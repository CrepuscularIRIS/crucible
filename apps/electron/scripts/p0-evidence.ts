/**
 * P3.4 证据 2/3/4（一次性实证脚本，node 运行；bun 加载 zeromq 即崩）：
 *   node apps/electron/scripts/p0-evidence.ts
 *
 * 2. kernel 跨压缩存活：定义变量 → 真实 compaction → 变量仍在；
 * 3. rlm() 真拉起子代理：句柄返回、子代理写文件可回收；
 * 4. auto-refine 真触发：turnInterval=2，两个 assistant 轮后 refinement 落盘。
 *
 * 密钥只接受操作者显式注入的 DASHSCOPE_API_KEY，脚本不读取 .env。
 */

// E3 根因：RLM 子会话的 kernel bootstrap 会重跑 uv sync，与 venv 的
// bin/python 存在窗口竞态（spawn ENOENT；fork-server 模式下表现为空 stderr）。
// 钉 PRIME_AGENT_KERNEL_PYTHON 指向已装配好的 venv 后 bootstrap 完全跳过 uv，
// 消除竞态。上游竞态本身另行跟进。
process.env.PRIME_AGENT_KERNEL_PYTHON = `${process.env.HOME}/.proma-p0-venv/bin/python`
process.env.PRIME_AGENT_KERNEL_FORKSERVER = '0'

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const REPO = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))))
const {
  disposeAndArchiveResearchSession,
  requireEnvironmentSecret,
} = await import('./research-script-lifecycle.ts')

const DASHSCOPE_API_KEY = requireEnvironmentSecret(process.env, 'DASHSCOPE_API_KEY')

const packageRoot = new URL('.', import.meta.resolve('@earendil-works/pi-coding-agent'))
const [servicesMod, sessionManagerMod, settingsMod] = await Promise.all([
  import(new URL('./core/agent-session-services.js', packageRoot).href),
  import(new URL('./core/session-manager.js', packageRoot).href),
  import(new URL('./core/settings-manager.js', packageRoot).href),
])
const rlmModule = await import('../src/main/lib/adapters/pi-ipython-rlm.ts')
const refineStateModule = await import('../src/main/lib/adapters/pi-refine-state.ts')

// 竞态取证：每 100ms 探测 venv python 与其 symlink 链，记录消失窗口
const VENV_PY = `${process.env.HOME}/.prime/agent/kernel-venv/bin/python`
const venvGaps: Array<{ at: string; phase: string }> = []
let phase = 'boot'
let venvPresent = true
const venvWatcher = setInterval(() => {
  let present = true
  try {
    require('fs').realpathSync(VENV_PY)
  } catch {
    present = false
  }
  if (present !== venvPresent) {
    venvPresent = present
    venvGaps.push({ at: new Date().toISOString(), phase: present ? 'reappear' : 'DISAPPEAR' })
  }
}, 100)

const rootDir = mkdtempSync(join(tmpdir(), 'proma-p0-evidence-'))
import { mkdirSync } from 'node:fs'
const cwd = join(rootDir, 'case')
mkdirSync(cwd, { recursive: true })

// in-memory settings：autoRefine turnInterval=2 + 极小 compaction 余量（保证真实压缩发生）
const settingsManager = settingsMod.SettingsManager.inMemory({
  autoRefine: { enabled: true, turnInterval: 2 },
  compaction: { enabled: true, reserveTokens: 130000 },
})

const services = await servicesMod.createAgentSessionServices({
  cwd,
  agentDir: join(rootDir, 'agent-dir'),
  settingsManager,
  noBuiltinHerdrReporter: true,
  telemetryDisabled: true,
})
services.modelRegistry.registerProvider('dashscope', {
  name: 'dashscope',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: DASHSCOPE_API_KEY,
  api: 'openai-completions',
  models: [{
    id: 'qwen3.7-plus',
    name: 'qwen3.7-plus',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 32768,
  }],
})

const sessionManager = sessionManagerMod.SessionManager.create(cwd, join(rootDir, 'sessions'))
const { session } = await servicesMod.createAgentSessionFromServices({
  services,
  sessionManager,
  model: services.modelRegistry.find('dashscope', 'qwen3.7-plus'),
  noTools: 'builtin',
  // P6.0/1.2 接线：无 'ipython' customTool，激活会话自己的内置定义（子代理拿到自己的 kernel）
  initialActiveToolNames: ['ipython'],
  customTools: [],
})

let compacted = false
const eventNames: string[] = []
session.agent.subscribe((event: { type: string }) => {
  eventNames.push(event.type)
  if (event.type === 'session_compacted') compacted = true
})

interface TranscriptTexts {
  assistant: string
  toolResults: string
}

function transcriptTexts(): TranscriptTexts {
  const messages = session.agent.state.messages as Array<{ role: string; content?: Array<{ type: string; text?: string }> }>
  const assistant: string[] = []
  const toolResults: string[] = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ').trim()
    if (!text) continue
    if (message.role === 'assistant') assistant.push(text)
    if (message.role === 'toolResult') toolResults.push(text)
  }
  return { assistant: assistant.join('\n'), toolResults: toolResults.join('\n') }
}

function messagesSnapshot(): number {
  return (session.agent.state.messages as unknown[]).length
}

function textsSince(index: number): { assistant: string; toolResults: string } {
  const messages = session.agent.state.messages as Array<{ role: string; content?: Array<{ type: string; text?: string }> }>
  const assistant: string[] = []
  const toolResults: string[] = []
  for (let i = index; i < messages.length; i += 1) {
    const message = messages[i]
    if (!Array.isArray(message.content)) continue
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ').trim()
    if (!text) continue
    if (message.role === 'assistant') assistant.push(text)
    if (message.role === 'toolResult') toolResults.push(text)
  }
  return { assistant: assistant.join('\n'), toolResults: toolResults.join('\n') }
}

async function ask(prompt: string): Promise<{ assistant: string; toolResults: string }> {
  const before = messagesSnapshot()
  const mark = eventNames.length
  await session.promptAndWait(prompt, { source: 'rpc' })
  // turn 的最终文本可能迟于 promptAndWait（续写/收尾）；给最多 45s 增量等待
  const deadline = Date.now() + 45_000
  let after = textsSince(before)
  while (Date.now() < deadline) {
    after = textsSince(before)
    const settled = eventNames.slice(mark).filter((n) => n === 'message_end').length >= 2
    if (after.assistant && settled) break
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  const turnEvents = eventNames.slice(mark).filter((n) => n === 'message_end' || n.includes('error')).slice(-4)
  const messages = session.agent.state.messages as Array<{ role: string }>
  console.log(`    [turn] events=${turnEvents.join(',')} msgs=${messages.length} lastRole=${messages[messages.length - 1]?.role ?? '?'}`)
  return after
}

// ── 证据 2（前半）+ 证据 4：定义变量；第 2 轮后 auto-refine 应触发 ──
await ask('用 ipython 定义变量 PROMA_EVIDENCE_X = 20260822，然后只回答"已定义"。')
await ask('用 ipython 输出 PROMA_EVIDENCE_X 的值确认还在，然后只回答该数字。')

// ── 证据 2（后半）：垫大上下文后做真实 compaction，验证变量仍在 ──
// keepRecentTokens 默认 20k：历史必须明显超过它，压缩才有可总结的区间
const padding = Array.from({ length: 2600 }, (_, i) => `材料 ${i + 1}：${'x'.repeat(48)}（噪声行，仅用于让上下文超过压缩下限）`).join('\n')
await ask(`下面是一段待摘要的材料，读完只需回答"收到"。\n\n${padding}`)
try {
  await session.compact()
  console.log('[E2] session.compact() 完成')
} catch (error) {
  console.log(`[E2] compact 报告: ${error instanceof Error ? error.message : String(error)}`)
}
const recall = await ask('不要重新定义任何变量。用 ipython 直接输出 PROMA_EVIDENCE_X 的值，只回答该数字。')
const survived = recall.assistant.includes('20260822') || recall.toolResults.includes('20260822')
console.log(`[E2] kernel 跨压缩存活: ${survived ? 'PASS' : 'FAIL（assistant/toolResult 均无 20260822）'}${compacted ? '（compaction 已发生）' : ''}`)

// ── 证据 3：rlm() 拉起子代理并回收其产出 ──
const markerFile = join(cwd, 'rlm-child-evidence.txt')
const rlmReply = await ask(
  `调用 rlm() 拉起一个名为 evidence-worker 的子代理，提示词让它：用 ipython 把句子 "written by rlm child" 写入当前目录的 rlm-child-evidence.txt 文件。`
  + 'spawn 返回后把 rlm_child_id 和 name 原样告诉我即可结束本轮。',
)
const rlmEvents = eventNames.filter((n) => n.includes('rlm') || n.includes('child') || n.includes('spawn') || n.includes('agent')).slice(-8)
const rlmHandleSeen = /rlm_child_id|evidence-worker/i.test(rlmReply.assistant) || /rlm_child_id|evidence-worker/i.test(rlmReply.toolResults)
console.log(`[E3] 相关事件（尾 8）: ${rlmEvents.join(', ') || '（无）'}`)
console.log(`[E3] rlm 句柄返回: ${rlmHandleSeen ? 'PASS' : `CHECK（assistant 片段: ${rlmReply.assistant.slice(0, 160)}；toolResult 片段: ${rlmReply.toolResults.slice(0, 160)}）`}`)
const childFileWritten = await waitFor(() => existsSync(markerFile), 150_000)
console.log(`[E3] 子代理产出文件: ${childFileWritten ? 'PASS' : 'FAIL'}`)
if (childFileWritten) {
  console.log(`[E3] 文件内容: ${readFileSync(markerFile, 'utf-8').trim().slice(0, 80)}`)
}

// ── 证据 4：auto-refine 落盘与徽章数据源可读 ──
const sessionFile = sessionManager.getSessionFile()
const harnessDir = join(sessionManager.getSessionArtifactDir?.() ?? join(rootDir, 'session-artifacts', session.sessionId), 'harness')
// auto-refine 在轮末后台执行，给它时间落盘
const refinedInTime = await waitFor(() => {
  const jsonl = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf-8') : ''
  return jsonl.split('\n').some((l) => l.includes('prime-agent.refinement'))
}, 120_000)
const summary = refineStateModule.summarizePrimeRefineArtifacts(harnessDir, sessionFile)
const sessionJsonl = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf-8') : ''
const refinementEntries = sessionJsonl.split('\n').filter((l) => l.includes('prime-agent.refinement')).length
void refinedInTime
const refineEvents = eventNames.filter((n) => n.includes('refine')).slice(-6)
console.log(`[E4] refine 相关事件（尾 6）: ${refineEvents.join(', ') || '（无）'}`)
console.log(`[E4] auto-refine 落盘: refinement 条目 ${refinementEntries} 条，harness 摘要可读 entries=${summary.entries} recent=${summary.recent.length}`)

clearInterval(venvWatcher)
console.log(`[diag] venv python 消失窗口: ${venvGaps.length ? JSON.stringify(venvGaps) : '（全程存在，无消失——ENOENT 另有原因）'}`)
await disposeAndArchiveResearchSession({
  session,
  archiveDir: join(REPO, 'research', 'campaigns', '2026-08-23-p0-evidence'),
  entries: [
    { source: cwd, target: 'project', required: true },
    { source: join(rootDir, 'sessions'), target: 'sessions', required: true },
    { source: join(rootDir, 'session-artifacts'), target: 'session-artifacts', required: false },
  ],
})
rmSync(rootDir, { recursive: true, force: true })

const pass = survived && childFileWritten && refinementEntries > 0
console.log(pass ? 'P0_EVIDENCE_PASS' : 'P0_EVIDENCE_PARTIAL')
process.exit(pass ? 0 : 1)

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate()) return resolve(true)
      if (Date.now() - startedAt > timeoutMs) return resolve(false)
      setTimeout(tick, 2000)
    }
    tick()
  })
}
