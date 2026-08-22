# Phase 1 — CANDIDATE

Produce one screened, selected candidate phenomenon. No measurement happens in this phase except the
asset checks the screen requires.

**LOAD:** `references/phenomenon-catalogue.md`, then `references/six-question-screen.md`.

## 1.1 Propose 2–3 candidates

From the catalogue's ten entry questions. Each candidate arrives with **its measurement and its
control already named** — that pairing is what makes it a candidate rather than a topic.

Two is the floor. One candidate means the screen has nothing to rank and the next outcome kills
nothing.

## 1.2 Grill the framing — ChatGPT web, you drive

**LOAD:** `references/iterative-questioning.md` (and `references/browser-patterns.md` the first time
this session).

You are the QUESTIONER. Your unit of work is **prediction error**, not answers. Pre-register what you
expect the answerer to say, *then* ask; the deviation is the measurement.

- **Never reveal your hypothesis.** Ask about the area, not about your idea.
- **Fresh conversation every 2–3 lines** to break anchoring. A converging conversation is agreeing
  with itself.
- Converge on **quality** — ≥3 genuinely distinct lines, each pressure-tested — never on a round count.

A crack here is a *hypothesis about a field gap*, not evidence. Two filters before it counts:
replicate it in a cold conversation, then ground it in 1.3.

## 1.3 Ground it — three lanes, they fail differently

| Lane | Fires | Fails when |
|---|---|---|
| **local corpus** — `research` agent | always, first: it is instant and free | title-only index; a miss is *not titled that*, never *does not exist* |
| **Scholar web** — you drive | when the corpus is thin or the phrasing may be wrong | no full text without a session |
| **ChatGPT web** — search contract | associative discovery, adjacent fields | reconstructs plausible titles it cannot cite — a title is a **lead** until the corpus confirms it |

```
Agent(subagent_type="research", prompt="Corpus + assets.
QUERIES: <3+ phrasings — the field's word is usually not yours>
VENUES: ICLR 2022-2026, NeurIPS, ICML
ALSO: verify the three Q4 checkpoints load. Return CORPUS and ASSETS blocks.")
```

**Read the ICLR rejections in this sub-area, not just the acceptances.** They are local, and the
recurring objection to phenomenon papers — *"may be an artifact"*, *"one model only"* — is a control
you should be running, harvested before the work instead of after the rebuttal.

## 1.4 Locate — `analyst`, two modes in one message

```
Agent(subagent_type="analyst", prompt=BRIEF + "MODE: THESIS")
Agent(subagent_type="analyst", prompt=BRIEF + "MODE: MECHANISM")
```

Same message so the readings stay independent. `BRIEF` carries everything — they have no tools:
the candidates, the grill residue, the corpus findings, the register's current state.

**The most useful single field is the empty roles.** A live intervention with no phenomenon under it
means you are about to build a fix for something never established.

Advisory. A localization demotes, scopes or reframes; it never kills.

## 1.5 SCREEN — the gate

```bash
cp .claude/scripts/screen.template.json .grill/screen-<candidate>.json   # then answer it
python3 .claude/scripts/screen.py check .grill/screen-<candidate>.json   # exit 1 blocks
python3 .claude/scripts/screen.py rank  .grill/screen-*.json
```

Q1/Q3/Q4 gate · Q2 ranks · Q5/Q6 set the ceiling. **Q2's blind predictions go into
`.grill/prediction-ledger.md` before any measurement** — afterwards, "counterintuitive" is
unfalsifiable, and the wrong prediction quoted verbatim is the paper's opening sentence.

Rejected candidates keep their state with the failing question attached. **State, not deletion** — a
candidate blocked on Q3 in August may pass in October.

## 1.6 DEBATE — only on the top-ranked candidate

**LOAD:** `references/debate-protocol.md`.

Four **separate** ChatGPT conversations: R1 contribution · R2 novelty · R3 evidence design · R4
reformulator (sees all three). Separate, because in one thread they converge into a single voice and
three correlated objections read as consensus.

Every role ships **ROLE · OBJECTIVE · CRITERIA · OUTPUT · OUT OF SCOPE**. `OUT OF SCOPE` is what makes
it bite — ask for a rejection without forbidding compliments and you get a rejection with three
compliments attached.

Run it **before spending**, not after: its whole value is being cheaper than the experiment it
redirects. It may demote, scope or rewrite — **never kill**.

Discharge: transcript to `.grill/debate-<date>.md`, every `SILENT_ASSUMPTION` into the register as a
protocol claim with its own falsifier, and an explicit *"no change, because —"* for each attack you
reject.

## Exit

One candidate selected, screen passed, ceiling recorded in the register, debate discharged.
Write it all into `.grill/STATE.md`.

**Next:** `loop/2-measure.md`.
