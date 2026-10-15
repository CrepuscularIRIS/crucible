/**
 * 阶段文档：agent 在 `research-work/<run>/` 写的中间产物（rivals / lessons / forecast / REPORT 草稿 / _P#.json…），
 * 画布只读展示。范围 = 任意深度的 .md + 顶层 .json；不含 sim/、nbsim/（几百个仿真记录）与隐藏项。
 *
 * 信任边界：工作目录归 agent 写，路径来自渲染层（web-bridge 下来自浏览器）。
 * 从 base 起逐段 lstat，任何一段是符号链接即拒绝；末段用 O_NOFOLLOW 打开（末段换成链接即失败），
 * O_NONBLOCK 让 FIFO 不会卡死主进程（随后 fstat 非普通文件即拒绝）。
 * ponytail: 中间段是 lstat 后再 open（Node 没有 openat），检查与打开之间把中间目录换成链接仍有窄竞态；
 * 能这么做的 agent 已有文件系统读写权，不比它本来能读的更多。要堵死就改成逐段 openat 的原生实现。
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { ResearchStageDoc, ResearchWorkdir } from '../../types/research-record'

/** ponytail: 先全收再按时间截断；文档上千时再改成边走边保留最新的 N 个 */
const MAX_DOCS = 200
const MAX_DEPTH = 4
const MAX_DOC_BYTES = 2 * 1024 * 1024
const SKIP_DIRS = new Set(['sim', 'nbsim', 'node_modules', '__pycache__'])

const isDoc = (segs: string[]): boolean =>
  segs.length > 0
  && segs.every((s) => s !== '' && !s.startsWith('.'))
  && !segs.slice(0, -1).some((s) => SKIP_DIRS.has(s))
  && (segs.at(-1)!.endsWith('.md') || (segs.length === 1 && segs[0]!.endsWith('.json')))

/** base 下逐段走，每段都必须是真目录（不是符号链接）；返回绝对路径，不存在或有链接返回 undefined */
function realDir(base: string, segs: string[]): string | undefined {
  let path = base
  for (const seg of segs) {
    path = join(path, seg)
    try {
      if (!lstatSync(path).isDirectory()) return undefined
    } catch {
      return undefined
    }
  }
  return path
}

function dirMtime(path: string): number | undefined {
  try {
    const s = lstatSync(path)
    return s.isDirectory() ? s.mtimeMs : undefined
  } catch {
    return undefined
  }
}

/**
 * 工作目录快照：文档列表（新的在前）+ sim/、recall/ 的目录 mtime（新增文件即变，供状态条推阶段）。
 * 工作目录不存在、或任何一段是符号链接 → null。
 * ponytail: 每次轮询都 readdir 一遍（不进 sim/、nbsim/），文档几十个以内足够；上千再改成按目录 mtime 增量。
 */
export function readWorkdir(base: string, segs: string[]): ResearchWorkdir | null {
  const root = realDir(base, segs)
  if (!root) return null
  const docs: ResearchStageDoc[] = []
  const walk = (dir: string, rel: string[]): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const segsHere = [...rel, e.name]
      // withFileTypes 的 Dirent 报告链接本身：符号链接既不是 isFile 也不是 isDirectory，自然被跳过
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && segsHere.length < MAX_DEPTH) walk(join(dir, e.name), segsHere)
      else if (e.isFile() && isDoc(segsHere)) {
        try {
          const s = lstatSync(join(dir, e.name))
          docs.push({ path: segsHere.join('/'), mtimeMs: s.mtimeMs, size: s.size })
        } catch {
          // 读的瞬间被删：下一次轮询会更新
        }
      }
    }
  }
  walk(root, [])
  docs.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
  docs.length = Math.min(docs.length, MAX_DOCS)
  const simMtimeMs = dirMtime(join(root, 'sim'))
  const recallMtimeMs = dirMtime(join(root, 'recall'))
  return {
    docs,
    ...(simMtimeMs !== undefined ? { simMtimeMs } : {}),
    ...(recallMtimeMs !== undefined ? { recallMtimeMs } : {}),
  }
}

/** 读一份阶段文档（只读）。rel 必须是列表规则内的相对路径；越界、链接、过大一律抛错。 */
export function readStageDocAt(base: string, segs: string[], rel: string): ResearchStageDoc & { text: string } {
  if (typeof rel !== 'string' || rel.length > 512 || rel.includes('\0') || rel.includes('\\') || rel.startsWith('/')) {
    throw new Error('阶段文档路径不合法')
  }
  const parts = rel.split('/')
  if (parts.some((p) => p === '..' || p === '.') || !isDoc(parts)) throw new Error(`不是阶段文档：${rel}`)
  const dir = realDir(base, [...segs, ...parts.slice(0, -1)])
  if (!dir) throw new Error(`阶段文档不在工作目录内或路径含符号链接：${rel}`)
  let fd: number
  try {
    fd = openSync(join(dir, parts.at(-1)!), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  } catch {
    throw new Error(`读不到阶段文档（不存在或是符号链接）：${rel}`)
  }
  try {
    const s = fstatSync(fd)
    if (!s.isFile()) throw new Error(`不是普通文件：${rel}`)
    if (s.size > MAX_DOC_BYTES) throw new Error(`阶段文档太大（${s.size} 字节，上限 ${MAX_DOC_BYTES}）：${rel}`)
    // 按 fstat 的大小读，不读到 EOF：文件在 fstat 之后长大也不会超过上限
    const buf = Buffer.alloc(s.size)
    let n = 0
    while (n < buf.length) {
      const got = readSync(fd, buf, n, buf.length - n, n)
      if (got === 0) break
      n += got
    }
    return { path: rel, text: buf.subarray(0, n).toString('utf-8'), mtimeMs: s.mtimeMs, size: s.size }
  } finally {
    closeSync(fd)
  }
}
