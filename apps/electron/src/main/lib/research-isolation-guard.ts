import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { isResearchMutatingTool } from './research-permission-policy'
import {
  assignedVariables,
  findPythonCallEnd,
  maskBashQuotedAndCommentText,
  maskQuotedAndCommentText,
  splitExecutionUnits,
} from './research-isolation-source'

/**
 * 文本启发式，不密闭（02 §1.4、§5.2 (d) 第一层）。已知上限：字符串拼接出的路径
 * （如 `'.prom' + 'a-research'`）不追；完整性靠第二层的宿主重算（MCP 内存基线与哈希链、
 * refine 事件基线、turn_end harness diff、K0/K7 环境快照）。
 */
export interface ResearchIsolationConfig {
  cwd: string
  denyRoots: string[]
  /** `<research cwd>/.proma-research`：模型一律不可写；REPORT/lessons 写在 `<research cwd>/research-work/<run>/`，由宿主 report_declare 拷入。 */
  stateRoots: string[]
  /** 宿主 state 根（02 SE2a ⑤：sdk-config 子目录、Prime global harness、kernel venv、工作区 skills/）：一律拒写。 */
  hostStateRoots?: string[]
}

export interface ResearchToolBlock {
  block: true
  reason: string
}

const PYTHON_RESEARCH_IMPORT = /^\s*(?:import\s+neuronbench(?:\s|$)|from\s+neuronbench(?:[.\s]|$))/im
const PYTHON_METER_RUN = /^\s*%run\s+\S*world-meter\.py\b/im
const BASH_METER_RUN = /(?:^|[\s;&|'"`])(?:python[23]?|bun|node)\s+[^\n;&|]*world-meter\.py\b/i
const BASH_RESEARCH_IMPORT = /(?:^|[\s;&|])python[23]?\s+(?:-[^\s]+\s+)*-c\s+(['"])[^\n]*\b(?:import\s+neuronbench|from\s+neuronbench)\b[^\n]*\1/i
const RESEARCH_ENV_EXPANSION = /\$(?:\{)?(?:NEURONBENCH_ROOT|PROMA_RESEARCH_DENY)(?:\})?/i
const PROCESS_CONTROL = /(?:^|[!\s;&|()])(?:sudo\s+)?(?:[^\s;&|()]+\/)?(?:kill|killall|pkill)\b|\bos\.kill(?:pg)?\b|\bprocess\.kill\b|\.(?:kill|terminate|send_signal)\s*\(/i
const BASH_DIRECTORY_CHANGE = /(?:^|[\s;&|()])(?:(?:command|builtin)\s+(?:--\s+)?)?(?:cd|pushd)\b/i
const PYTHON_DIRECTORY_CHANGE = /\b(?:os\.)?chdir\s*\(/i
const IPYTHON_SYSTEM_ESCAPE = /\bget_ipython\s*\(\s*\)\s*\.system\s*\(/i
const PYTHON_PROCESS_COMMAND = /^\s*subprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*(?:args\s*=\s*)?(?:[[(]\s*(?:['"](?:[^'"]*\/)?(?:sudo|env)['"]\s*,\s*(?:['"](?:--?[^'"]*|[A-Za-z_][A-Za-z0-9_]*=[^'"]*)['"]\s*,\s*)*)*['"](?:[^'"]*\/)?(?:kill|killall|pkill)['"]|['"](?:(?:[^'"\s]*\/)?(?:sudo|env)(?:\s+(?:--?\S+|[A-Za-z_][A-Za-z0-9_]*=\S+))*\s+)*(?:[^'"\s]*\/)?(?:kill|killall|pkill)(?:\s|['"]))/i
const STATIC_SHELL_BRACE_EXPANSION = /(^|[^$])\{[^}\r\n]+\}/
const STATE_MUTATION = new RegExp([
  /(?:^|[\s;&|()\\])(?:rm|rmdir|mkdir|mv|cp|ln|rsync|install|truncate|unlink|shred|tee)\b|\bdd\s[^\n;&|]*\bof=/.source,
  /\bsed\s+-i\b|\bperl\s+-i\b/.source,
  /\bshutil\.(?:rmtree|copy|copy2|copyfile|copytree|move)\b|\bos\.(?:remove|unlink|rmdir|rename|replace|symlink|link)\b/.source,
  /\.(?:unlink|rename|replace|write_text|write_bytes|symlink_to|hardlink_to|move|copyfile|copy2|copytree|rmtree)\s*\(/.source,
  // `from os import replace` 之后的裸调用；别名（`import shutil as s` → `s.move(`）由上一行覆盖
  /(?<![.\w])(?:remove|unlink|rmdir|rename|renames|replace|symlink|link|move|copy\w*|rmtree)\s*\(/.source,
  // open(p, 'w') / open(expanduser('~/x'), mode='a') / Path(p).open('r+')
  /\bopen\s*\((?:[^()]|\([^()]*\))*,\s*(?:mode\s*=\s*)?['"][rbt]*[wax+]|\.open\s*\(\s*(?:mode\s*=\s*)?['"][rbt]*[wax+][bt+]*['"]/.source,
].join('|'), 'i')
/** 建链接：指向 state 路径的一律拒；指向 deny 根的祖先也算读 deny 根（`ln -s ~/oss /tmp/o && cat /tmp/o/…`）。 */
const LINK_CREATION = /(?:^|[\s;&|()])ln\b|\bos\.(?:symlink|link)\b|\.(?:symlink_to|hardlink_to)\s*\(/
/** 把文件当脚本跑：REPORT/lessons 草稿的 heredoc 正文不扫描，不能再拿去执行。 */
const SHELL_SCRIPT_RUN = /(?:^|[|&;(`]\s*|\$\(\s*)(?:(?:env|sudo|exec|nohup|time|command|builtin|xargs|timeout\s+\S+)\s+(?:-\S+\s+)*|[A-Za-z_]\w*=\S*\s+)*(?:\S*\/)?(?:python[0-9.]*|bash|sh|zsh|dash|ksh|node|bun|perl|ruby|eval|source|exec|xargs|\.)(?=$|[\s;&|)<])/
/** 输出目标（`> REPORT`、`| tee REPORT`）是写，不是执行：判 SHELL_SCRIPT_RUN 前去掉。 */
const SHELL_OUTPUT_TARGET = />>?\|?\s*(?:(['"])[^'"]*\1|[^\s;&|<>()]+)|\btee\s+(?:-\S+\s+)*(?:(['"])[^'"]*\2|[^\s;&|<>()]+)/g
/** `.compile` / `.eval` 是方法（`re.compile`、`model.eval()`），不是内建；`builtins.eval` 另算。 */
const PYTHON_SCRIPT_RUN = /\b(?:exec|runpy|subprocess|os\.system|os\.popen|importlib|SourceFileLoader|builtins|__builtins__)\b|(?<!\.)\b(?:eval|compile)\b|^\s*%run\b/m
/**
 * 递归读：以 deny 根的祖先为根（`find ~/oss`、`grep -r x ~/oss`、`zip -r`、`os.walk`、`cp -r`）等于读 deny 根。
 * ponytail: 只认这几种工具；`ls -R` 只列名不算，`du` 等未列，上限同文件头（第二层兜底）。
 */
const RECURSIVE_READ = new RegExp([
  /(?:^|[\s;&|()`])(?:\S*\/)?(?:find|rg|ag|tar|rsync|zip|7z|7za|7zr)\b/.source,
  /\b[ef]?grep\b[^\n;&|]*\s-(?:[A-Za-z]*[rR][A-Za-z]*|-recursive|-dereference-recursive)\b/.source,
  /\bcp\b[^\n;&|]*\s-(?:[A-Za-z]*[rRa][A-Za-z]*|-recursive|-archive)\b/.source,
  /\bos\.walk\b|\.r?glob\s*\(|\bshutil\.(?:copytree|make_archive)\b/.source,
].join('|'))
const GLOB_CHARS = /[*?[]/
const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=$|[/\\])/
/** 拼出 home 的写法：`$HOME`、`os.environ['HOME']`、`os.getenv('HOME')`、`Path.home()`、`expanduser('~')`。 */
const HOME_EXPRESSION = /\$\{?HOME\}?|\b(?:os\.)?environ\s*\[\s*['"]HOME['"]\s*\]|\b(?:os\.)?(?:environ\.get|getenv)\s*\(\s*['"]HOME['"]\s*\)|\b(?:pathlib\.)?Path\.home\s*\(\s*\)|\b(?:os\.path\.)?expanduser\s*\(\s*['"]~['"]\s*\)/g
/** 归一化（引号、逗号、括号 → 空格）后的装包动词；配合 PYTHON_PROCESS_CALL 只在真实调用里生效。 */
const PACKAGE_INSTALL = /\b(?:pip3?\s+install|pip\.main\s+install|uv\s+pip\s+(?:install|sync)|uv\s+(?:add|sync)|(?:conda|mamba)\s+install)\b/i
const PYTHON_INSTALL_MAGIC = /^\s*%(?:pip|uv|conda|mamba)\b[^\n]*\b(?:install|add|sync)\b/im
const PYTHON_PROCESS_CALL = /\b(?:subprocess|os\.system|os\.popen|pip\.main|runpy)\b/
const REPORT_FILES = new Set(['REPORT.md', 'lessons.md'])
const HEREDOC_START = /(?<!<)<<(-?)\s*(['"]?)([A-Za-z0-9_][\w.-]*)\2/
const SHELL_INTERPRETER = /(?:^|[\s;&|(/])(?:python[0-9.]*|bash|sh|zsh|node|bun|perl|ruby|eval|source|exec|xargs)(?=$|[\s;&|)])/
const PYTHON_TRIPLE_QUOTED = /("""|''')[\s\S]*?\1/g
const DENIAL_REASON = '研究评测隔离拒绝直接访问 benchmark、meter、Research MCP 进程，改写研究账本或宿主状态，或往 kernel 环境装包；'
  + '请使用 world_* MCP 与 research MCP 工具；若 world_simulate(mode=info) 返回 sim_env，仿真请 import 工作目录里的 nbsim；'
  + '.proma-research/ 下一律不可写：REPORT 与 lessons 请写到 research-work/<run>/REPORT.md 与 research-work/<run>/lessons.md'
  + '（正文放进 ipython 三引号字符串，或 bash 用 cat 加引号定界的 heredoc：<<\'EOF\'），report_declare 时由宿主拷进 run 目录；'
  + 'kernel 缺包是宿主环境缺陷，请写进报告 scope 段，不要自行安装。'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function isPathWithin(candidate: string, root: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function stripToken(value: string): string {
  return value.trim().replace(/^['"`]+|['"`,)\]}]+$/g, '').replace(/^(?:file:\/\/)+/i, '')
}

/** `bareNames`：建链接时裸名也算路径（`ln -s oss o`，cwd 是 deny 根的祖先）。 */
function expandCandidatePath(value: string, cwd: string, bareNames = false): string | undefined {
  const candidate = expandHome(stripToken(value))
  if (!candidate || candidate.includes('\n') || candidate.includes('\0')) return undefined
  if (!isAbsolute(candidate) && !candidate.includes('/') && !candidate.includes('\\')) {
    // 裸文件名只在它是 `.` / `..` 或链接时才算路径（`open('h.json','w')`，h.json 链到宿主根）。
    const bare = resolve(cwd, candidate)
    return bareNames || candidate === '.' || candidate === '..' || isSymlink(bare) ? bare : undefined
  }
  return resolve(cwd, candidate)
}

function expandHome(value: string): string {
  return value.replace(HOME_PREFIX, () => homedir())
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** 字面路径与链接解析后的真实落点；目标还不存在时解析父目录（`research-work/r1` 链到 run 目录）。 */
function pathAliases(path: string): string[] {
  let real: string
  try {
    real = realpathSync(path)
  } catch {
    try {
      real = join(realpathSync(dirname(path)), basename(path))
    } catch {
      return [path]
    }
  }
  return real === path ? [path] : [path, real]
}

function isWithinAny(path: string, roots: string[]): boolean {
  return pathAliases(path).some((alias) => roots.some((root) => isPathWithin(alias, root)))
}

/**
 * `Path.home()/'oss'/'x'`、`os.environ['HOME']+'/x'`、`"$HOME"/x`：去引号、把 + , / 连接折成 `/` 后的 `~/…`。
 * `substituted`：变量已代回成绝对路径（`"/h/oss" + '/x'`），绝对路径也收。
 */
function joinedCandidates(source: string, substituted = false): string[] {
  if (!substituted && !source.match(HOME_EXPRESSION)) return []
  const text = source.replace(HOME_EXPRESSION, '~').replace(/['"`]/g, '').replace(/\s*\+\s*/g, '/').replace(/\s+\/\s+/g, '/')
  // 逗号两种读法都收：`join(d, 'oss')` 是拼接，`walk(d, topdown=True)` 是另一个参数。
  return [text.replace(/\s*,\s*/g, '/'), text.replace(/,/g, ' ')].join(' ').replace(/\/{2,}/g, '/')
    .split(/[\s;&|()<>=[\]{}]+/)
    .filter((token) => token.startsWith('~/') || (substituted && token.startsWith('/')))
}

function pathCandidates(source: string): string[] {
  const candidates: string[] = []
  const quoted = /(['"`])([^'"`\r\n]+)\1/g
  for (const match of source.matchAll(quoted)) {
    const candidate = match[2]
    if (candidate) candidates.push(candidate, ...candidate.split('=').slice(1))
  }
  // `=` 也切：`VIRTUAL_ENV=<venv>`、`--target=<venv>/…`、`X=<deny 根>`、`dd of=<journal>`。
  for (const token of source.split(/[\s;&|()<>'"`,=]+/)) {
    if (token.includes('/') || token.includes('\\') || token.startsWith('~') || HOME_PREFIX.test(token)
      || token === '.' || token === '..') candidates.push(token)
  }
  return [...candidates, ...joinedCandidates(source)]
}

function globSegmentMatches(pattern: string, segment: string): boolean {
  try {
    const source = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[!/g, '[^')
    return new RegExp(`^${source}$`).test(segment)
  } catch {
    return true
  }
}

/** glob 路径逐段对 deny 根：走完根的全部段（或遇 `**`）= 落在根内；先走完 glob = 根的祖先。 */
function globReachesRoot(pattern: string, root: string, recursive: boolean): boolean {
  const parts = pattern.split(sep)
  const rootParts = root.split(sep)
  for (let index = 0; index < rootParts.length; index += 1) {
    const part = parts[index]
    if (part === undefined) return recursive
    if (part === '**') return true
    if (!globSegmentMatches(part, rootParts[index] ?? '')) return false
  }
  return true
}

/**
 * 字面路径落在根内；glob 前缀能匹配到根；递归工具或建链接以根的祖先为起点（递归工具无路径参数时是 cwd）。
 * `extra`：变量代回后拼出的路径（见 substitutePathVariables）。
 */
function sourceTouchesRoots(source: string, roots: string[], cwd: string, extra: string[] = []): boolean {
  const recursive = RECURSIVE_READ.test(source)
  const linking = LINK_CREATION.test(source)
  const raws = [...pathCandidates(source), ...extra, ...(linking ? source.split(/[\s;&|()<>'"`,=]+/) : [])]
  const candidates = raws.map((raw) => expandCandidatePath(raw, cwd, linking)).filter((path): path is string => !!path)
  if (recursive && !raws.some((raw) => expandCandidatePath(raw, cwd))) candidates.push(cwd)
  const ancestors = recursive || linking
  return candidates.some((candidate) => (GLOB_CHARS.test(candidate)
    ? roots.some((root) => globReachesRoot(candidate, root, ancestors))
    : isWithinAny(candidate, roots)
      || (ancestors && pathAliases(candidate).some((alias) => roots.some((root) => isPathWithin(root, alias))))))
}

/** 赋了 deny 根祖先路径的变量（`D=~/oss`、`d = expanduser('~/oss')`），代回后续单元：`cat $D/neuron*\/…`。 */
const BASH_ASSIGNMENT = /(?:^|[\s;&|(])(?:(?:export|declare|local|readonly|typeset)(?:\s+-\w+)*\s+)?([A-Za-z_]\w*)=(\S+)/g
const PYTHON_ASSIGNMENT = /^\s*([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)\s*(.+)$/gm

function substitutePathVariables(unit: string, vars: Map<string, string>, toolName: 'bash' | 'ipython'): string {
  let out = unit
  for (const [name, value] of vars) {
    out = toolName === 'bash'
      ? out.replace(new RegExp(`\\$\\{?${name}\\b\\}?`, 'g'), value)
      : out.replace(new RegExp(`(?<![.\\w$])${name}\\b`, 'g'), JSON.stringify(value))
  }
  return out
}

function recordPathVariables(unit: string, vars: Map<string, string>, toolName: 'bash' | 'ipython', roots: string[], cwd: string): void {
  for (const [, name, rawValue] of unit.matchAll(toolName === 'bash' ? BASH_ASSIGNMENT : PYTHON_ASSIGNMENT)) {
    if (!name || !rawValue) continue
    const value = substitutePathVariables(rawValue, vars, toolName)
    const path = [...joinedCandidates(value, true), ...pathCandidates(value)]
      .map((raw) => expandCandidatePath(raw, cwd)).find((candidate): candidate is string => !!candidate)
    if (path && roots.some((root) => isPathWithin(root, path))) vars.set(name, path)
    else vars.delete(name)
  }
}

function resolveUserPath(raw: string, cwd: string): string {
  return resolve(cwd, expandHome(raw.replace(/^@/, '')))
}

function protectedStateRoots(config: ResearchIsolationConfig): string[] {
  return [...config.stateRoots, ...(config.hostStateRoots ?? [])]
}

/** `<research cwd>/research-work`：报告草稿所在（与 `.rlm-jobs` 一样在状态根之外）。 */
function reportDraftRoots(config: ResearchIsolationConfig): string[] {
  return config.stateRoots.map((root) => join(dirname(root), 'research-work'))
}

/** `research-work/<run>/{REPORT,lessons}.md`（草稿）或宿主拷入的 `.proma-research/<run>/` 副本。 */
function isReportShape(path: string, config: ResearchIsolationConfig, draftsOnly = false): boolean {
  const roots = draftsOnly ? reportDraftRoots(config) : [...reportDraftRoots(config), ...config.stateRoots]
  return REPORT_FILES.has(basename(path)) && roots.includes(dirname(dirname(path)))
}

function isProtectedWriteTarget(path: string, config: ResearchIsolationConfig): boolean {
  return isWithinAny(path, protectedStateRoots(config))
}

function unitTouchesProtectedState(unit: string, config: ResearchIsolationConfig, cwd: string): boolean {
  return unit.includes('.proma-research') || pathCandidates(unit)
    .some((raw) => { const path = expandCandidatePath(raw, cwd); return !!path && isProtectedWriteTarget(path, config) })
}

/** Bash 的 `>` / `>>` / `>|` 目标（引号与注释里的不算；`2>&1` 这类 fd 复制不算）。 */
function shellRedirectTargets(unit: string): string[] {
  const masked = maskBashQuotedAndCommentText(unit)
  const targets: string[] = []
  for (const match of masked.matchAll(/>>?\|?(?!&)/g)) {
    const start = (match.index ?? 0) + match[0].length
    const target = /^(?:(['"])(.*?)\1|[^\s;&|<>()]+)/.exec(unit.slice(start).trimStart())
    if (target) targets.push(target[2] ?? target[0])
  }
  return targets
}

/**
 * `cat > research-work/<run>/REPORT.md <<'EOF'` 的正文是数据，不是命令：REPORT 正文里的 `kill H1`、`{extra:[]}`
 * 曾让归档里 5 次正当的 REPORT 写入被拒（02 §1.4）。只剥离写 REPORT/lessons 草稿、且不会被执行
 * 的正文：起始行是 cat、无管道、不调解释器，定界符带引号（不展开）或正文没有 `$` / 反引号。
 * 草稿落点若经链接落进状态根，重定向检查照拒（isProtectedWriteTarget 看 realpath）。
 */
function stripReportHeredocBodies(source: string, config: ResearchIsolationConfig): string {
  const lines = source.split('\n')
  const out: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    out.push(line)
    const masked = maskBashQuotedAndCommentText(line)
    const start = HEREDOC_START.exec(line)
    if (!start || masked.slice(start.index, start.index + 2) !== '<<') continue
    if (!/\bcat\b/.test(masked) || /(?:^|[^|])\|(?!\|)/.test(masked) || SHELL_INTERPRETER.test(masked)) continue
    const targets = shellRedirectTargets(line)
    if (targets.length === 0 || !targets.every((target) => (
      !/[$`]/.test(target) && isReportShape(resolveUserPath(stripToken(target), config.cwd), config, true)
    ))) continue
    const delimiter = start[3]
    const end = lines.findIndex((next, at) => at > index && (start[1] ? next.replace(/^\t+/, '') : next) === delimiter)
    if (end < 0) continue
    const body = lines.slice(index + 1, end)
    if (!start[2] && body.some((next) => /[$`]/.test(next))) continue
    out.push(...body.map(() => ''))
    index = end - 1
  }
  return out.join('\n')
}

function hasPackageInstall(source: string): boolean {
  // 三引号正文与整行注释不是调用（REPORT 草稿里写 `%pip install` 不算装包）。
  const code = source.replace(PYTHON_TRIPLE_QUOTED, '""').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
  if (PYTHON_INSTALL_MAGIC.test(code)) return true
  return PYTHON_PROCESS_CALL.test(maskQuotedAndCommentText(code))
    && PACKAGE_INSTALL.test(code.replace(/['"`,[\]()]/g, ' '))
}

function classifyEditCall(record: Record<string, unknown> | undefined, config: ResearchIsolationConfig): ResearchToolBlock | undefined {
  for (const raw of [record?.path, record?.file_path]) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const target = resolveUserPath(raw.trim(), config.cwd)
    if (config.denyRoots.some((root) => isPathWithin(target, root)) || isProtectedWriteTarget(target, config)) {
      return { block: true, reason: DENIAL_REASON }
    }
  }
  return undefined
}

function directoryChangeTarget(unit: string, cwd: string): string | undefined {
  const bashMatch = /^\s*(?:(?:command|builtin)\s+(?:--\s+)?)?(?:cd|pushd)\s+(?:--\s+)?(.+?)\s*$/i.exec(unit)
  const pythonMatch = /\b(?:os\.)?chdir\s*\(\s*(?:[rRuUbB]{1,2})?(['"])([^'"]+)\1\s*\)/i.exec(unit)
  const raw = pythonMatch?.[2] ?? bashMatch?.[1]
  const candidate = raw ? expandHome(stripToken(raw)) : undefined
  if (!candidate || /[$`]/.test(candidate)) return undefined
  return resolve(cwd, candidate)
}

function sourceTouchesRootsFollowingDirectoryChanges(source: string, roots: string[], cwd: string, toolName: 'bash' | 'ipython'): boolean {
  let currentCwd = cwd
  const vars = new Map<string, string>()
  for (const unit of splitExecutionUnits(source)) {
    if (roots.some((root) => isPathWithin(currentCwd, root))) return true
    const substituted = substitutePathVariables(unit, vars, toolName)
    if (sourceTouchesRoots(unit, roots, currentCwd, substituted === unit ? [] : joinedCandidates(substituted, true))) return true
    recordPathVariables(unit, vars, toolName, roots, currentCwd)
    const nextCwd = directoryChangeTarget(unit, currentCwd)
    if (nextCwd) {
      currentCwd = nextCwd
      if (roots.some((root) => isPathWithin(currentCwd, root))) return true
    }
  }
  return false
}

function hasUnsafeExecutionSyntax(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (toolName === 'bash') {
    const executable = maskBashQuotedAndCommentText(source)
    return BASH_DIRECTORY_CHANGE.test(executable)
      || STATIC_SHELL_BRACE_EXPANSION.test(executable)
  }

  if (/^\s*(?:!|%%bash\b|%sx\b|%system\b)/im.test(source)) return true
  const executable = maskQuotedAndCommentText(source)
  return PYTHON_DIRECTORY_CHANGE.test(executable) || IPYTHON_SYSTEM_ESCAPE.test(executable)
}

function mentionsVariable(unit: string, names: Set<string>): boolean {
  for (const name of names) {
    if (new RegExp(`(?:\\$\\{?${name}\\}?|\\b${name}\\b)`).test(unit)) return true
  }
  return false
}

function hasUnsafeStateMutation(source: string, config: ResearchIsolationConfig, toolName: 'bash' | 'ipython'): boolean {
  const tainted = new Set<string>()
  let currentCwd = config.cwd
  // 三引号字符串是正文（REPORT 草稿）：其中提到的账本路径不让变量变"脏"；cell 里有 exec/eval/compile 时不剥离。
  // Bash：续行先拼回一行；`>|`、`>&file` 统一成 `>`，免得分片把重定向和目标拆开。
  const scanned = toolName === 'bash'
    ? source.replace(/\\\n/g, ' ').replace(/>\|/g, '> ').replace(/>&(?![\d-])/g, '> ')
    : !/\b(?:exec|eval|compile)\s*\(/.test(maskQuotedAndCommentText(source))
      ? source.replace(PYTHON_TRIPLE_QUOTED, '""')
      : source
  for (const unit of splitExecutionUnits(scanned)) {
    const touchesState = protectedStateRoots(config).some((root) => isPathWithin(currentCwd, root))
      || unitTouchesProtectedState(unit, config, currentCwd)
      || mentionsVariable(unit, tainted)
    if (touchesState) {
      for (const name of assignedVariables(unit)) tainted.add(name)
    }
    if (touchesState && (STATE_MUTATION.test(unit) || PACKAGE_INSTALL.test(unit))) return true
    // ipython 的 `!` / `%%bash` 已被 hasUnsafeExecutionSyntax 整体拒绝，重定向只需看 Bash。
    if (toolName === 'bash') {
      for (const raw of shellRedirectTargets(unit)) {
        if ([...tainted].some((name) => new RegExp(`\\$\\{?${name}\\b`).test(raw))) return true
        const target = expandHome(stripToken(raw))
        if (!/[$`]/.test(target) && isProtectedWriteTarget(resolve(currentCwd, target), config)) return true
      }
    }
    currentCwd = directoryChangeTarget(unit, currentCwd) ?? currentCwd
  }
  return false
}

/**
 * 建链接指向任何 state 路径，或把 REPORT/lessons（research-work 草稿或宿主拷入的副本）当脚本执行
 * （`bash|sh|source|. <REPORT>`、`cat REPORT | bash`、`exec(open(REPORT).read())`、`%run`、`runpy`）。
 * Bash 整条管道算一片；变量经赋值传染（`p = REPORT` → `src = open(p).read()` → `exec(src)`）。
 */
function hasStateLinkOrScriptRun(source: string, config: ResearchIsolationConfig, toolName: 'bash' | 'ipython'): boolean {
  const roots = protectedStateRoots(config)
  const linked = new Set<string>()
  const scripted = new Set<string>()
  for (const unit of splitExecutionUnits(source, toolName !== 'bash')) {
    const executable = toolName === 'bash' ? maskBashQuotedAndCommentText(unit) : maskQuotedAndCommentText(unit)
    const paths = (source: string): string[] => pathCandidates(source)
      .map((raw) => expandCandidatePath(raw, config.cwd)).filter((path): path is string => !!path)
    const touchesState = unit.includes('.proma-research') || paths(unit).some((path) => isWithinAny(path, roots)) || mentionsVariable(unit, linked)
    if (touchesState && LINK_CREATION.test(executable)) return true
    // Bash 看原文（`"$(bash REPORT)"` 在引号里），命令位上的解释器才算；Python 看去掉字符串后的调用。
    const runScope = toolName === 'bash' ? unit.replace(SHELL_OUTPUT_TARGET, ' ') : unit
    const touchesWritable = paths(runScope).some((path) => isReportShape(path, config)) || mentionsVariable(runScope, scripted)
    if (touchesWritable && (toolName === 'bash' ? SHELL_SCRIPT_RUN.test(unit) : PYTHON_SCRIPT_RUN.test(executable))) return true
    for (const name of assignedVariables(unit)) {
      if (touchesState) linked.add(name)
      if (touchesWritable) scripted.add(name)
    }
  }
  return false
}

function hasUnsafeProcessControl(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (toolName === 'ipython') {
    const executable = maskQuotedAndCommentText(source)
    for (const match of executable.matchAll(/\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(/gi)) {
      if (match.index === undefined) continue
      const openIndex = match.index + match[0].lastIndexOf('(')
      const callEnd = findPythonCallEnd(executable, openIndex)
      if (callEnd !== undefined && PYTHON_PROCESS_COMMAND.test(source.slice(match.index, callEnd))) {
        return true
      }
    }
  }
  const popenVariables = new Set<string>()
  const bashCell = toolName === 'ipython' && /^\s*%%bash\b/i.test(source)
  for (const rawUnit of splitExecutionUnits(source)) {
    const shellEscape = toolName === 'ipython' && /^\s*!/.test(rawUnit)
    const shellMode = toolName === 'bash' || bashCell || shellEscape
    const unit = shellMode
      ? rawUnit.replace(/^\s*!\s*/, '').replace(/['"`]/g, ' ')
      : maskQuotedAndCommentText(rawUnit)
    if (PROCESS_CONTROL.test(unit)) {
      if (/\b(?:pkill|killall)\b|\b(?:os|process)\.kill\b/i.test(unit)) return true
      const withoutOwnedMethods = unit.replace(
        /\b([A-Za-z_][A-Za-z0-9_]*)\.(?:kill|terminate|send_signal)\s*\(/g,
        (full, name: string) => (popenVariables.has(name) ? '(' : full),
      )
      const withoutOwnedShellJobs = withoutOwnedMethods.replace(
        /(?:^|[\s;&|()])(?:sudo\s+)?kill\s+(?:-[A-Za-z0-9]+\s+)*(?:\$!|%\d+)(?=$|[\s;&|)])/gi,
        ' ',
      )
      if (PROCESS_CONTROL.test(withoutOwnedShellJobs)) return true
    }

    if (shellMode) continue
    const assigned = assignedVariables(unit)
    const established = new Set<string>()
    for (const match of unit.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=;()]+)?\s*=\s*(?:subprocess\.)?Popen\s*\(/g)) {
      const name = match[1]
      if (name) established.add(name)
    }
    for (const name of assigned) {
      if (established.has(name)) popenVariables.add(name)
      else popenVariables.delete(name)
    }
  }
  return false
}

function hasDirectResearchSource(source: string, toolName: 'bash' | 'ipython'): boolean {
  if (RESEARCH_ENV_EXPANSION.test(source)) return true
  if (toolName === 'bash') return BASH_METER_RUN.test(source) || BASH_RESEARCH_IMPORT.test(source)
  const withoutCommentLines = source.split(/\r?\n/).filter((line) => !/^\s*#/.test(line)).join('\n')
  const shellEscapes = withoutCommentLines
    .split(/\r?\n/)
    .filter((line) => /^\s*!/.test(line))
    .map((line) => line.replace(/^\s*!\s*/, '').replace(/['"`]/g, ' '))
    .join('\n')
  return PYTHON_RESEARCH_IMPORT.test(withoutCommentLines)
    || PYTHON_METER_RUN.test(withoutCommentLines)
    || (/^\s*%%bash\b/im.test(withoutCommentLines) && BASH_METER_RUN.test(withoutCommentLines))
    || BASH_METER_RUN.test(shellEscapes)
    || BASH_RESEARCH_IMPORT.test(shellEscapes)
}

export function resolveResearchIsolationConfig(
  mcpServers: Record<string, Record<string, unknown>>,
  cwd: string,
  pathDelimiter: string = delimiter,
  hostStateRoots: string[] = [],
): ResearchIsolationConfig | undefined {
  const denyRoots = new Set<string>()
  const stateRoots = new Set<string>()
  for (const server of Object.values(mcpServers)) {
    const env = asRecord(server.env)
    const rawDeny = typeof env?.PROMA_RESEARCH_DENY === 'string' ? env.PROMA_RESEARCH_DENY.trim() : ''
    if (!rawDeny) continue
    for (const entry of rawDeny.split(pathDelimiter)) {
      const trimmed = entry.trim()
      if (trimmed) denyRoots.add(resolve(cwd, trimmed))
    }
    const researchCwd = typeof env?.PROMA_RESEARCH_CWD === 'string' ? env.PROMA_RESEARCH_CWD.trim() : ''
    if (researchCwd) stateRoots.add(resolve(cwd, researchCwd, '.proma-research'))
  }
  if (denyRoots.size === 0) return undefined
  return {
    cwd: resolve(cwd),
    denyRoots: [...denyRoots],
    stateRoots: [...stateRoots],
    ...(hostStateRoots.length > 0 && { hostStateRoots: hostStateRoots.map((root) => resolve(root)) }),
  }
}

export function classifyResearchToolCall(
  toolName: string,
  input: Record<string, unknown>,
  config: ResearchIsolationConfig,
): ResearchToolBlock | undefined {
  const normalizedTool = toolName.toLowerCase()
  const record = asRecord(input)
  if (normalizedTool === 'edit') return classifyEditCall(record, config)
  if (normalizedTool !== 'bash' && normalizedTool !== 'ipython') return undefined
  const rawSource = normalizedTool === 'bash' ? record?.command : record?.code
  if (typeof rawSource !== 'string' || !rawSource.trim()) {
    return { block: true, reason: '研究评测隔离无法验证空的 Bash/ipython 输入，已拒绝执行。' }
  }
  const source = normalizedTool === 'bash' ? stripReportHeredocBodies(rawSource, config) : rawSource
  if (
    hasUnsafeExecutionSyntax(source, normalizedTool)
    ||
    hasDirectResearchSource(source, normalizedTool)
    || sourceTouchesRootsFollowingDirectoryChanges(source, config.denyRoots, config.cwd, normalizedTool)
  ) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (hasUnsafeProcessControl(source, normalizedTool)) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (hasUnsafeStateMutation(source, config, normalizedTool) || hasStateLinkOrScriptRun(source, config, normalizedTool)) {
    return { block: true, reason: DENIAL_REASON }
  }
  if (normalizedTool === 'ipython' && hasPackageInstall(source)) return { block: true, reason: DENIAL_REASON }
  return undefined
}

/**
 * rlm child 经 MCP 只读（01-统一架构 §4.5 / §9.4，P0 检查 ②）：父会话是唯一的研究状态写入者。
 * `rlmDepth` 取自 tool_call handler 的 `ctx.sessionManager.getHeader()?.rlmDepth`
 * （Prime 给 child header 写 rlmDepth=父+1；父会话为 0 或缺省）。
 * world_* 一律拒（含 world_simulate：它也往 journal.jsonl 追加，§4.5/§9.4）；research_init 仍算写入。
 * ponytail: 只管 MCP 调用；child 用 ipython 直接写文件不受此限（Prime 无权限层），靠 collect 的检测兜底。
 */
export function classifyRlmChildToolCall(toolName: string, rlmDepth: number | undefined): ResearchToolBlock | undefined {
  if (!rlmDepth || rlmDepth <= 0) return undefined
  if (!isResearchMutatingTool(toolName)) return undefined
  const tool = toolName.slice(toolName.lastIndexOf('__') + 2)
  return {
    block: true,
    reason: `rlm child cannot call ${tool}: the parent session is the only research-state writer. `
      + 'Write your result into the out.md your brief names (last line = the STATUS line) and finish; '
      + 'the parent collects it and records state.',
  }
}

export function buildResearchIsolationConfig(
  denyRoots: string[],
  researchCwd: string,
  hostStateRoots: string[] = [],
): ResearchIsolationConfig {
  const cwd = resolve(researchCwd)
  return {
    cwd,
    denyRoots: denyRoots.map((root) => resolve(cwd, root)),
    stateRoots: [join(cwd, '.proma-research')],
    ...(hostStateRoots.length > 0 && { hostStateRoots: hostStateRoots.map((root) => resolve(cwd, root)) }),
  }
}

/**
 * kernel venv 目录，与 Prime `getKernelVenvDir` 同序：pin 的 PRIME_AGENT_KERNEL_PYTHON 所在 venv
 * （不在 venv 里——如 /usr/bin/python3——返回 undefined，不把系统目录当 state 根）→
 * PRIME_AGENT_KERNEL_VENV → ~/.prime/agent/kernel-venv。
 * ponytail: 不跟 Prime 的 XDG 回退（主目录不可建时才用）；真正的防线是 SE7a 的环境快照。
 */
export function resolveKernelVenvDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const pinned = env.PRIME_AGENT_KERNEL_PYTHON?.trim()
  if (pinned) {
    const venv = dirname(dirname(pinned))
    return existsSync(join(venv, 'pyvenv.cfg')) ? venv : undefined
  }
  const override = env.PRIME_AGENT_KERNEL_VENV
  return override ? resolveUserPath(override, homedir()) : join(homedir(), '.prime', 'agent', 'kernel-venv')
}
