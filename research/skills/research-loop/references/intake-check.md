# Intake check — before `research_init`

**When to load:** a new campaign (no journal yet), right before `research_init`.
Skip it for an existing run.

Sources (line refs are to files in the upstream repos; provenance only, see `NOTICE.md`):
RS = ResearchStudio (github.com/microsoft/ResearchStudio),
`ResearchStudio-Idea/skills/idea_spark/references/intake-routing.md` and
`ResearchStudio-Idea/skills/idea_spark/SKILL.md:24-27,212`; RC = research-companion
(github.com/andrehuang/research-companion), `skills/research-companion/SKILL.md:54-58`.

## 1. Prior campaigns on the same question (RC :54-58)

**World task (`world_*` tools present / probes are `spec.observe`), or the world/seed
is pinned: do not read earlier REPORTs.** A rerun or a same-condition comparison must
form its own prereg without the earlier verdicts. Ruling: `prior campaigns = not read
(independent run)`.

Otherwise list `.proma-research/*/REPORT.md` under the project root
(`PROMA_RESEARCH_CWD`) and read only those whose question overlaps this one. Reading an
old report is reading a source, not observing this run's commands.

- An overlapping report exists → default ruling: start from it, naming every old run
  you read; that knowledge is prior knowledge and REPORT says so. Its graveyard and
  SUPPORTED claims go into research-abduce's "read the graveyard first"; do not re-probe
  a dead direction without naming what changed. The user can revoke the ruling.
- None → say so in the ruling.

`Ruling: prior campaigns = <run names read | none> — <what carries over> — <cost if wrong>`

## 2. OOD triggers (RS intake-routing.md:5-15,28-29; SKILL.md:27,212)

| Trigger | Fires when | Ask the user for |
|---|---|---|
| Too broad | no specific direction ("do some AI research") | one area + one specific limitation |
| No anchor | no domain, task, data, baseline, or runnable system/metric named | domain, task, baseline, data — or the command and metric to study |
| < 5 truly related works | the question claims a literature gap, yet fewer than ~5 sources genuinely bear on it (keyword matches don't count) | a narrower question, or recast it as an empirical question about a named system |
| Pure construction | the deliverable is building a benchmark / dataset / system, not answering a question | the question the artifact should answer (auditing a benchmark is fine) |

Any trigger fires → do not call `research_init`. Stop and ask once, listing which
trigger fired and the fields that would clear it; this is ruling class ④ (choice
underdetermined) in `SKILL.md`. Do not ideate around the gap.

Not OOD (RS intake-routing.md:17-24): engineering framing, no ready benchmark, tight
compute. Those surface later at candidate-screen Q3 and in prereg; let them through.
