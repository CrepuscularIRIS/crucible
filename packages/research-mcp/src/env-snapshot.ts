/**
 * SE7a · K0/K7 kernel 环境快照（02§4.4，规则 R-kernel-env-frozen）。
 *
 * 实例：ca_rebound :58，模型在 run 中把 research-kit 拷到 /tmp 再 `uv pip install --python`
 * 装进 kernel venv——实际执行的 kit 已不是 K0 那一份，trace 无法归因。guard 的文本规则只是辅助；
 * 这里是宿主重算：research_init 记快照，report_declare 重算，变了就封顶，不拒。
 *
 * 用宿主传入的 kernel python 跑一次子进程，取：importlib.metadata 包清单（名字==版本，排序后
 * sha256；不依赖 uv/pip 是否存在）、research_kit 的定位（find_spec，不执行 kit 代码）、kit 包目录下
 * 每个 .py 与 src 布局的 pyproject.toml 的 sha256。
 *
 * 子进程是宿主代码，不得被 agent 可写的目录劫持（审查 C1：`-c` 会把 cwd 放在 sys.path 首位，
 * 研究 cwd 里一个 hashlib.py 就能在宿主上运行、读走 NEURONBENCH_ROOT、伪造快照）：`-I` 隔离模式
 * （不加 cwd / PYTHON* 环境变量 / 用户 site）、cwd 固定为 `/`、环境只留 PATH。
 * kernel 本身会先 import cwd 里的 research_kit，所以这一项改在宿主侧看：`cwd_shadow`。
 * ponytail: site-packages 里新种的 .pth 仍会在 site 初始化时执行（-S 会连 editable 安装的 kit 一起丢掉）；
 * 环境已清空，它拿不到真相路径，但能伪造输出——上限是 SE15/SE16 的宿主侧 digest 与只读快照（赛后）。
 * ponytail: 只覆盖 kernel 包清单与 kit 源码；工作区 skills/ 等受保护文件的 digest 是 SE15（赛后）。
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export interface KernelEnvSnapshot {
  packages_sha256: string
  kit_file: string | null
  kit_files: Record<string, string>
  /** 宿主侧：kernel cwd 里遮住已装 kit 的 `research_kit.py` / `research_kit/` 的 sha256；没有为 null（旧快照无此字段） */
  cwd_shadow?: string | null
}

export type KernelEnvSnapshotResult =
  | { available: true; snapshot: KernelEnvSnapshot }
  | { available: false; reason: string }

const SNAPSHOT_SCRIPT = `
import hashlib, json, pathlib, importlib.metadata as md
h = lambda b: hashlib.sha256(b).hexdigest()
pk = sorted(f"{d.metadata.get('Name') or '?'}=={d.version}" for d in md.distributions())
out = {"packages_sha256": h("\\n".join(pk).encode()), "kit_file": None, "kit_files": {}}
import importlib.util
try:
    spec = importlib.util.find_spec("research_kit")
except Exception:
    spec = None
if spec is not None and spec.origin:
    f = pathlib.Path(spec.origin).resolve()
    root = f.parent
    files = {str(p.relative_to(root)): h(p.read_bytes()) for p in sorted(root.rglob("*.py")) if "__pycache__" not in p.parts}
    pp = root.parent.parent / "pyproject.toml"
    if pp.is_file():
        files["pyproject.toml"] = h(pp.read_bytes())
    out["kit_file"] = str(f)
    out["kit_files"] = files
print(json.dumps(out))
`

/** kernel 的 sys.path 以 cwd 打头：cwd 里的 research_kit 会遮住已装的 kit。只在宿主侧哈希，不执行。 */
function cwdShadow(cwd: string | undefined): string | null {
  if (!cwd) return null
  const parts = ['research_kit.py', 'research_kit']
    .filter((name) => existsSync(join(cwd, name)))
    .map((name) => {
      const path = join(cwd, name)
      return `${name}:${statSync(path).isDirectory() ? treeSha256(path) : entrySha256(path)}`
    })
  return parts.length > 0 ? sha256Hex(parts.join('\n')) : null
}

/** `cwd` 是 kernel 的工作目录（研究 cwd）：只用于宿主侧的影子检查，子进程不在那里跑。 */
export function takeKernelEnvSnapshot(python: string | undefined, cwd?: string): KernelEnvSnapshotResult {
  if (!python?.trim()) return { available: false, reason: 'PROMA_KERNEL_PYTHON 未设置' }
  const proc = spawnSync(python, ['-I', '-c', SNAPSHOT_SCRIPT], {
    encoding: 'utf-8', timeout: 30_000, cwd: '/', env: { PATH: process.env.PATH ?? '' },
  })
  if (proc.status !== 0) {
    const detail = proc.error?.message ?? proc.stderr?.trim().split('\n').pop() ?? `exit ${proc.status}`
    return { available: false, reason: `kernel python 快照失败：${detail}` }
  }
  let parsed: KernelEnvSnapshot
  try {
    parsed = JSON.parse(proc.stdout) as KernelEnvSnapshot
  } catch {
    return { available: false, reason: 'kernel python 快照输出不是 JSON' }
  }
  return { available: true, snapshot: { ...parsed, cwd_shadow: cwdShadow(cwd) } }
}

/** K0 → K7 的差异项：`packages_sha256`、`research_kit.__file__`、`cwd:research_kit`、`kit:<相对路径>`（增 / 删 / 改）。 */
export function diffKernelEnv(before: KernelEnvSnapshot, after: KernelEnvSnapshot): string[] {
  const changed: string[] = []
  if (before.packages_sha256 !== after.packages_sha256) changed.push('packages_sha256')
  if (before.kit_file !== after.kit_file) changed.push('research_kit.__file__')
  if ((before.cwd_shadow ?? null) !== (after.cwd_shadow ?? null)) changed.push('cwd:research_kit')
  const files = new Set([...Object.keys(before.kit_files), ...Object.keys(after.kit_files)])
  for (const file of [...files].sort()) {
    if (before.kit_files[file] !== after.kit_files[file]) changed.push(`kit:${file}`)
  }
  return changed
}

const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

/** 单个条目的摘要：不跟随链接（`link:<目标>`），读不了记 `unreadable:<错误码>`——宿主重算不能被一个坏链接打断。 */
function entrySha256(path: string): string {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return sha256Hex(`link:${readlinkSync(path)}`)
    if (!stat.isFile()) return sha256Hex(`other:${stat.mode}`)
    return sha256Hex(readFileSync(path))
  } catch (error) {
    return sha256Hex(`unreadable:${(error as NodeJS.ErrnoException).code ?? String(error)}`)
  }
}

/** 相对路径（`/` 分隔）→ 条目摘要；目录只递归不计入，读不了的目录记一条 unreadable。 */
function walk(dir: string, rel: string, out: Map<string, string>): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(join(dir, rel), { withFileTypes: true })
  } catch (error) {
    out.set(rel, sha256Hex(`unreadable:${(error as NodeJS.ErrnoException).code ?? String(error)}`))
    return
  }
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (child === 'MANIFEST.json' || entry.name === '__pycache__') continue
    if (entry.isDirectory()) walk(dir, child, out)
    else out.set(child, entrySha256(join(dir, child)))
  }
}

/**
 * 03 §3.2 的 nbsim 树 sha256：按相对路径（`/` 分隔）排序，拼接各文件 sha256 十六进制串后再哈希。
 * 不含根下的 MANIFEST.json（它记录树 sha 本身）与 `__pycache__`。
 * 普通文件树上与轨道 E 的生成器（`nbsim_strip.py`）同一定义（接口常量）；生成器不产出的条目
 * （符号链接、不可读文件 / 目录、特殊文件）各记一个标记摘要，所以出现即不符——全函数，从不抛（审查 H-A）。
 * ponytail: `__pycache__` 仍排除——容器以 root 跑 kernel，0555 拦不住 import 时写入的合法字节码，
 * 计入就会每个 world run 误封顶；种一个头部伪造成 mtime/size 相符的 .pyc 因此看不见。
 * 升级路径：kernel 环境设 PYTHONDONTWRITEBYTECODE=1 之后，两侧（含 nbsim_strip.tree_sha256）一起计入。
 * 目录不存在返回 undefined。
 */
export function treeSha256(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const entries = new Map<string, string>()
  walk(dir, '', entries)
  return sha256Hex([...entries.keys()].sort().map((file) => entries.get(file)).join(''))
}
