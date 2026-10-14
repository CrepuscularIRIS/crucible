/**
 * 宿主读 agent 工作区文件的唯一方式：不跟随任何链接（报告源、仿真记录、K3 审计产物共用）。
 * 跟随 = 宿主替 agent 把别处的文件（deny 根里的真相、journal）当证据读进来。
 */

import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type { Cap } from './caps'
import { ResearchStateError, confined, sanitizeRunName, sha256, type SimCitation } from './state'

export type WorkFile = { source: string } & ({ text: string } | { link: 'symlink' | 'hardlink' })

/**
 * 末段 O_NOFOLLOW + fstat（普通文件、nlink 1），目录段 realpath 必须等于字面路径。
 * 不存在返回 undefined；source 是相对 cwd 的路径。
 */
export function readNoFollow(cwd: string, file: string): WorkFile | undefined {
  const source = relative(cwd, file)
  try {
    lstatSync(file)
  } catch {
    return undefined
  }
  if (realpathSync(dirname(file)) !== resolve(realpathSync(cwd), dirname(source))) return { source, link: 'symlink' }
  let fd: number
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') return { source, link: 'symlink' }
    throw error
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new ResearchStateError(`不是普通文件: ${source}`)
    if (stat.nlink > 1) return { source, link: 'hardlink' }
    return { source, text: readFileSync(fd, 'utf-8') }
  } finally {
    closeSync(fd)
  }
}

/**
 * IR-D3：prereg 引用的仿真记录必须是 <cwd>/research-work/<run>/sim/*.json 的普通文件，且 sha256 与引用相符
 * （给前 ≥12 位即可）。返回规范化引用（cwd 相对路径 + 宿主算的完整 sha256），由 prereg 冻结。
 * 不符即拒：引用的是"登记时的那份仿真"，对不上就不是同一份证据。
 */
export function verifySimCitations(cwd: string, run: string, sims: SimCitation[]): SimCitation[] {
  const simDir = join(cwd, 'research-work', sanitizeRunName(run), 'sim')
  return sims.map(({ path, sha256: cited }) => {
    const normalized = path.replace(/\\/g, '/')
    const file = normalized.startsWith('research-work/') ? resolve(cwd, normalized) : resolve(dirname(simDir), normalized)
    const where = `research-work/${sanitizeRunName(run)}/sim/`
    if (dirname(file) !== simDir || !file.endsWith('.json')) {
      throw new ResearchStateError(`仿真记录必须是 ${where}<id>.json（收到 ${path}）→ 把记录写进 ${where} 再引用`)
    }
    const read = readNoFollow(cwd, confined(simDir, file))
    if (!read) throw new ResearchStateError(`仿真记录不存在：${where}${file.split('/').pop()}`)
    if ('link' in read) throw new ResearchStateError(`仿真记录是链接，拒绝跟随：${read.source} → 写成普通文件`)
    const digest = sha256(read.text)
    const prefix = String(cited ?? '').trim().toLowerCase()
    if (!/^[0-9a-f]{12,64}$/.test(prefix) || !digest.startsWith(prefix)) {
      throw new ResearchStateError(
        `仿真记录 ${read.source} 的 sha256 与引用不符（引用 ${prefix.slice(0, 16) || '空'}…，现为 ${digest.slice(0, 12)}…）：`
        + '记录在引用后被改动，或抄错 → 重算 sha256（≥12 位十六进制）后重新登记',
      )
    }
    return { path: read.source, sha256: digest }
  })
}

/** 与 research_kit.jobs 同一条 STATUS 契约（01 §4.2）：容忍弱模型常见的反引号 / 加粗走样。 */
const STATUS_LINE = /STATUS:\s*(ok|blocked|failed)(\s+SELF_REVIEWED)?\s+PATH:\s*(\S+)/i

/**
 * K3 审计产物（claim_transition{audit}）：只认 <cwd>/.rlm-jobs/<run>/ 下的普通文件、末行 `STATUS: ok`。
 * 不合格不拒，只封顶（A2）；读得到时把 sha256 一并冻结进 journal。
 *
 * ponytail: 只认"自报"的降级（`-self` 目录 / SELF_REVIEWED）。父会话本身能写 .rlm-jobs/（brief.md 就在那），
 * 手写一份 `<nonce>/out.md` 末行 `STATUS: ok` 即可清掉 no_audit——宿主分不出审计是不是子代理写的（M12 已知上限）。
 * 升级路径：claim_transition 时把 audit 路径里的 job 名与运行时 child tracker（createResearchChildTracker）
 * 记录的已派发 / 已结束子代理对账，对不上 → audit_unverified。
 */
export function inspectAudit(cwd: string, run: string, path: string): { audit?: SimCitation; cap?: Cap } {
  const jobsRoot = join(cwd, '.rlm-jobs', sanitizeRunName(run))
  const file = resolve(cwd, path.replace(/\\/g, '/'))
  const unverified = (why: string): { cap: Cap } => ({ cap: { code: 'audit_unverified', detail: `${path}：${why}` } })
  if (!file.startsWith(`${jobsRoot}/`)) return unverified(`不在 .rlm-jobs/${sanitizeRunName(run)}/ 下`)
  const read = readNoFollow(cwd, file)
  if (!read) return unverified('文件不存在')
  if ('link' in read) return unverified('是链接')
  const audit = { path: read.source, sha256: sha256(read.text) }
  const last = read.text.trimEnd().split('\n').pop() ?? ''
  const status = STATUS_LINE.exec(last.replace(/[`*]/g, ''))
  if (!status || status[1].toLowerCase() !== 'ok') return { audit, ...unverified('末行不是 STATUS: ok') }
  if (status[2] || dirname(file).endsWith('-self')) {
    return { audit, cap: { code: 'self_reviewed', detail: `${read.source} 是父会话代写的降级审计` } }
  }
  return { audit }
}
