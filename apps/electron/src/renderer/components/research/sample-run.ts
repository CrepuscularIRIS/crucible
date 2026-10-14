/**
 * 随应用打包的回放示例：2026-10-14 GLM 一句话 run（ca_rebound，seed 20261014）。
 * 不需要主进程、研究会话或网络——R1 缺失时画布仍能回放它（04 §3.1 回放模式）。
 *
 * 只打包不含真相的文件。annotations.json（truth 原文与参数）、recompute.json（truth_mean）
 * 绝不打进 bundle：宿主研究会话的拒绝根不覆盖 apps/electron/dist（M-3，sample-bundle.test.ts 守着）。
 * 注记只在运行时经 R1 归档根读取——主进程列出同一个 run 时，示例按钮走归档（archivePickerView）。
 * docker 镜像排除了 research/campaigns，glob 为空 → bundled=false，示例按钮隐藏（M-2）。
 */

const RAW = import.meta.glob(
  [
    '../../../../../../research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound/journal.jsonl',
    '../../../../../../research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound/REPORT.md',
    '../../../../../../research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound/register.json',
    '../../../../../../research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound/prereg/*.json',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const MARKER = '2026-10-14-glm53flash-oneline-ca_rebound/'

export const SAMPLE_RUN = {
  path: 'research/campaigns/2026-10-14-glm53flash-oneline-ca_rebound',
  label: '示例：一句话 run（ca_rebound · 2026-10-14）',
  /** 相对 run 目录的路径 → 原文，与 R1 快照的 files 同口径 */
  files: Object.fromEntries(
    Object.entries(RAW).map(([path, text]) => [path.slice(path.indexOf(MARKER) + MARKER.length), text]),
  ),
  /** 本构建是否带上了示例（docker 镜像里为 false） */
  bundled: Object.keys(RAW).some((path) => path.endsWith('/journal.jsonl')),
}

/** 空状态里的"复制示例提示词"：示例 run 的一句话原文（评委视角 §5.1 表，会话 eb383a8d） */
export const SAMPLE_PROMPT = '帮我研究一下 ca_rebound 这个神经元的放电机制。'
