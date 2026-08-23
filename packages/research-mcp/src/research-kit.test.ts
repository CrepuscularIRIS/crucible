/**
 * research-kit（kernel 侧只读 Python 工具箱）× register.json 契约测试。
 *
 * 用首场战役归档做 fixture：register 格式一变（本包的输出契约），这里先红。
 * 同时验证 claim_view 的信息不对称——对抗者上下文绝不能带 transition notes。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

const repoRoot = join(import.meta.dir, '..', '..', '..')
const kitSrc = join(repoRoot, 'research', 'skills', 'research-kit', 'src')
const campaign = join(repoRoot, 'research', 'campaigns', '2026-08-23-first')

function runPython(code: string): string {
  const result = spawnSync('python3', ['-c', code], {
    env: { ...process.env, PYTHONPATH: kitSrc },
    encoding: 'utf-8',
    timeout: 30_000,
  })
  if (result.status !== 0) {
    throw new Error(`python3 退出 ${result.status}: ${result.stderr}`)
  }
  return result.stdout
}

describe('research-kit 作为 Python skill 的可安装性（P4.3 §3.3）', () => {
  // P4.3 实测：kernel 里 `import research_kit` 报 ModuleNotFoundError，Agent 靠手工加
  // sys.path 绕过——"kernel 启动时自动导入、被子代理继承"因此只是纸面。这里把 Prime
  // detectPythonSkill 的三条硬性前提变成可检查的：任一条破了，skill 会被静默跳过。
  const skillDir = join(repoRoot, 'research', 'skills', 'research-kit')

  it('结构满足 Prime 的 Python skill 探测：pyproject + src/<import_name>/__init__.py', () => {
    // Prime 把 skill 目录名的 "-" 换成 "_" 作为 import 名，并要求该路径存在
    const importName = 'research-kit'.replaceAll('-', '_')
    expect(importName).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
    expect(existsSync(join(skillDir, 'pyproject.toml'))).toBe(true)
    expect(existsSync(join(skillDir, 'src', importName, '__init__.py'))).toBe(true)
  })

  it('pyproject 的 wheel 打包路径与 import 名一致——错了会装出一个空包', () => {
    const pyproject = readFileSync(join(skillDir, 'pyproject.toml'), 'utf-8')
    expect(pyproject).toContain('packages = ["src/research_kit"]')
  })
})

describe('research_kit（只读，对 register.json 契约）', () => {
  it('anchor：graveyard 禁令体 + 探针状态 + 攻击计数，FAILED 不冒充 LANDED', () => {
    const out = runPython(
      `import research_kit; print(research_kit.anchor(${JSON.stringify(campaign)}))`,
    )
    expect(out).toContain('GRAVEYARD (2)')
    expect(out).toContain('禁止换装重提')
    expect(out).toContain('P6 LANDED metric=0.865')
    expect(out).toContain('P1 FAILED')
    expect(out).toContain('ATTACKS: 7')
  })

  it('claim_view：含主张与证据探针，不含提出者的 transition note', () => {
    const out = runPython(
      `import research_kit; print(research_kit.claim_view(${JSON.stringify(campaign)}, 'H1'))`,
    )
    expect(out).toContain('待攻击主张 · H1')
    expect(out).toContain('P6')
    expect(out).toContain('graveyard')
    // journal 里 H1 终态迁移的 note 含"落在 H1 预测频段"——对抗者不许看到
    expect(out).not.toContain('落在 H1 预测频段')
  })

  it('disjoint_pairs：只报互斥对', () => {
    const out = runPython(
      "import research_kit; print(research_kit.disjoint_pairs({'H1': (0.8, 1.0), 'H2': (0.0, 0.6), 'H3': (0.5, 0.9)}))",
    )
    expect(out.trim()).toBe("[('H1', 'H2')]")
  })

  it('calibration：落地探针逐频段报带内/外', () => {
    const out = runPython(
      `import research_kit; print(research_kit.calibration(${JSON.stringify(campaign)}))`,
    )
    expect(out).toContain('P6 × H1')
    expect(out).toContain('带内')
  })

  it('collect_attacks：会话目录与其 sub-* 子目录都回收，去重，且不越界到父目录', () => {
    const out = runPython(`
import tempfile, pathlib, research_kit
root = pathlib.Path(tempfile.mkdtemp())
session = root / 'sub-489fc4d7'
(session / 'sub-deadbeef').mkdir(parents=True)
(session / 'attacks.md').write_text('# 标题不算\\nnew_h | H1 | 同级落点\\nnew_h | H1 | 同级落点\\n', encoding='utf-8')
(session / 'sub-deadbeef' / 'attacks.md').write_text('constraint | H1 | 子目录落点\\n', encoding='utf-8')
(root / 'attacks.md').write_text('no_change | H2 | 无关战役\\n', encoding='utf-8')
print(research_kit.collect_attacks(str(session)))
`)
    expect(out).toContain('同级落点')
    expect(out).toContain('子目录落点')
    expect(out).not.toContain('标题不算')
    // 父目录可能是 /tmp 这类共享目录：越界会把无关战役的攻击收进证据链
    expect(out).not.toContain('无关战役')
    expect(out.split('同级落点').length - 1).toBe(1)
  })

  it('反向：子代理还没写完时 collect_attacks 返回空——空不是错误', () => {
    // rlm() 在准入时返回句柄，不是完成时；立即去读必然为空，父代理要在后续轮次再读
    const out = runPython(`
import tempfile, research_kit
print(research_kit.collect_attacks(tempfile.mkdtemp()))
`)
    expect(out.trim()).toBe('[]')
  })
})

describe('research_kit.counters（元认知计数器，只读 journal）', () => {
  it('已结案战役：计数归零、deaths 按 by_probe 分组、concluded 抑制 ⚠ 提示', () => {
    const out = runPython(`
import json, research_kit
c = research_kit.counters(${JSON.stringify(campaign)})
print(json.dumps(c, ensure_ascii=False))
`)
    const c = JSON.parse(out)
    // 最后一次信念变化（transition/propose）之后没有成功落地（P1–P5 exit=2 不算落地）
    expect(c.landed_since_transition).toBe(0)
    // 7 条攻击都在 report.declare 之前清账（declare 把余债落成报告收窄声明）
    expect(c.attack_debt).toBe(0)
    // 只有 REFUTED/SCOPED 算死亡：H2 死于 P6；SUPPORTED 的 H1 不算
    expect(c.deaths_by_probe).toEqual({ P6: 1 })
    expect(c.live).toBe(0)
    expect(c.graveyard).toBe(2)
    expect(c.concluded).toBe(true)
    // anchor 带 COUNTERS 行并标注已结案，不再输出 ⚠ 调度提示
    const anchorOut = runPython(
      `import research_kit; print(research_kit.anchor(${JSON.stringify(campaign)}))`,
    )
    expect(anchorOut).toContain('COUNTERS: 落地未迁移=0 · 攻击债=0 · LIVE=0/坟场=2 · 已结案')
    expect(anchorOut).not.toContain('⚠')
  })

  it('declare 之前的窗口（评审发现 17）：战末攻击债非零，无 LIVE 提示指向 report', () => {
    // 同一份 fixture 截掉 report.declare/gate.verdict：这正是 P4.1 强制的
    // 冻结后攻击刚落完、报告还没写的真实时刻——债必须可见，出路必须指对
    const out = runPython(`
import json, pathlib, tempfile, research_kit
src = pathlib.Path(${JSON.stringify(campaign)})
root = pathlib.Path(tempfile.mkdtemp())
events = [json.loads(l) for l in (src / "journal.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
events = [e for e in events if e["op"] not in ("report.declare", "gate.verdict")]
(root / "journal.jsonl").write_text("".join(json.dumps(e) + "\\n" for e in events), encoding="utf-8")
reg = json.loads((src / "register.json").read_text(encoding="utf-8"))
reg["gateVerdicts"] = []
reg["reports"] = []
(root / "register.json").write_text(json.dumps(reg), encoding="utf-8")
print(json.dumps(research_kit.counters(str(root)), ensure_ascii=False))
print(research_kit.anchor(str(root)))
`)
    const [firstLine, ...rest] = out.split('\n')
    const c = JSON.parse(firstLine!)
    // 3 条 new_h（上次 propose 之后）+ 3 条 constraint（上次 prereg 之后）
    expect(c.attack_debt).toBe(6)
    expect(c.concluded).toBe(false)
    const anchorText = rest.join('\n')
    expect(anchorText).toContain('⚠ 攻击债 6 未清')
    // 余债的出路包含 report 收窄声明，而不是把已答完的战役赶回 abduce
    expect(anchorText).toContain('收窄声明')
    expect(anchorText).toContain('research-report')
  })

  it('进行中战役：propose 也重置落地计数；prereg 只清 constraint 债不清 new_h 债', () => {
    const out = runPython(`
import json, pathlib, tempfile, research_kit
root = pathlib.Path(tempfile.mkdtemp())
events = [
    {"ts": "t00", "op": "run.init"},
    {"ts": "t01", "op": "claim.propose", "id": "H1"},
    {"ts": "t02", "op": "claim.propose", "id": "H2"},
    {"ts": "t03", "op": "claim.propose", "id": "H3"},
    {"ts": "t04", "op": "prereg.write", "pid": "P1"},
    {"ts": "t05", "op": "probe.start", "pid": "P1"},
    {"ts": "t06", "op": "probe.land", "pid": "P1", "exit_code": 0, "metric": 0.5},
    {"ts": "t07", "op": "claim.transition", "id": "H2", "to": "REFUTED", "by_probe": "P1"},
    {"ts": "t08", "op": "claim.transition", "id": "H3", "to": "REFUTED", "by_probe": "P1"},
    {"ts": "t09", "op": "probe.land", "pid": "P2", "exit_code": 0, "metric": 0.6},
    {"ts": "t10", "op": "probe.land", "pid": "P3", "exit_code": 0, "metric": 0.7},
    {"ts": "t11", "op": "probe.land", "pid": "P4", "exit_code": 2, "metric": None},
    {"ts": "t12", "op": "attack.record", "kind": "constraint", "target": "H1"},
    {"ts": "t13", "op": "attack.record", "kind": "new_h", "target": "H1"},
    {"ts": "t14", "op": "attack.record", "kind": "no_change", "target": "H1"},
    {"ts": "t15", "op": "prereg.write", "pid": "P5"},
]
def write(evts):
    (root / "journal.jsonl").write_text(
        "".join(json.dumps(e) + "\\n" for e in evts), encoding="utf-8")
write(events)
(root / "register.json").write_text(json.dumps({
    "run": "t", "probes": [], "attacks": [], "gateVerdicts": [],
    "claims": [{"id": "H1", "state": "LIVE", "statement": "s1", "predicts": []}],
    "graveyard": [
        {"id": "H2", "state": "REFUTED", "statement": "s2", "predicts": [], "byProbe": "P1"},
        {"id": "H3", "state": "REFUTED", "statement": "s3", "predicts": [], "byProbe": "P1"},
    ],
}), encoding="utf-8")
print(json.dumps(research_kit.counters(str(root))))
print(research_kit.anchor(str(root)))
print("=== after propose ===")
write(events + [{"ts": "t16", "op": "claim.propose", "id": "H4"}])
print(json.dumps(research_kit.counters(str(root))))
`)
    const lines = out.split('\n')
    const c = JSON.parse(lines[0]!)
    // 迁移前的 P1 落地不计；迁移后 exit 0 两次计入，exit 2 崩溃不计
    expect(c.landed_since_transition).toBe(2)
    // prereg P5 清掉 constraint 债；new_h 债要等 claim.propose；no_change 从不计
    expect(c.attack_debt).toBe(1)
    // 同一探针杀死两条假设 → 独立机制警告
    expect(c.deaths_by_probe).toEqual({ P1: 2 })
    expect(c.live).toBe(1)
    expect(c.graveyard).toBe(2)
    const marker = out.indexOf('=== after propose ===')
    const anchorText = out.slice(0, marker)
    expect(anchorText).toContain('⚠ 攻击债 1 未清')
    expect(anchorText).toContain('⚠ 连续 2 个探针落地而信念未动')
    expect(anchorText).toContain('references/reframe.md')
    expect(anchorText).toContain('⚠ P1 一次杀死 2 条假设')
    // propose 同时清 new_h 债并重置落地计数
    const after = JSON.parse(out.slice(marker).split('\n')[1]!)
    expect(after.attack_debt).toBe(0)
    expect(after.landed_since_transition).toBe(0)
  })
})
