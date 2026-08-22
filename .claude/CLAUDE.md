# CLAUDE.md

Coding behavior merges [Karpathy-style guidelines](https://github.com/forrestchang/andrej-karpathy-skills)
(inlined below · full text in `.claude/skills/karpathy-guidelines/`) with
[**ponytail**](https://github.com/DietrichGebert/ponytail) (MIT · `.claude/skills/ponytail/`)
and a locally forked **grill** from [mattpocock/skills](https://github.com/mattpocock/skills)
(`.claude/skills/{grill-me,grilling}/` — see `SOURCE-mattpocock.txt`).

---

## Coding behavior (Karpathy)

Bias caution over speed on non-trivial work. For trivial tasks, use judgment.

### Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- Multiple interpretations → present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If unclear, stop. Name what's confusing. Ask.

### Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No unrequested "flexibility" / configurability.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite.

Test: would a senior engineer call this overcomplicated? If yes, simplify.

### Surgical changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken; match existing style.
- Unrelated dead code: mention it, don't delete it unless asked.
- Remove imports/vars/functions **your** change made unused only.

Test: every changed line traces to the user request.

### Goal-driven execution

**Define success criteria. Loop until verified.**

- "Add validation" → tests for invalid inputs, then make them pass.
- "Fix the bug" → reproducing test, then make it pass.
- "Refactor X" → tests pass before and after.

Multi-step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Working if: smaller diffs, fewer overbuild rewrites, questions before wrong code.

---

## Ponytail (laziness as a discipline)

Full skill: `.claude/skills/ponytail/SKILL.md`. Level **full** by default
(`/ponytail lite|full|ultra`). The ladder — stop at the first rung that holds:

1. **Does this need to exist at all?** Speculative → skip it, say so in one line.
2. **Already in this codebase?** Reuse it. Look before you write.
3. **Stdlib does it?** Use it.
4. **Native platform feature covers it?** `<input type="date">` over a picker lib,
   CSS over JS, DB constraint over app code.
5. **Already-installed dependency solves it?** Use it. Never add one for a few lines.
6. **Can it be one line?** One line.
7. **Only then:** the minimum code that works.

**The ladder shortens the solution, never the reading.** Trace the whole thing first —
every file the change touches, the actual flow — then pick a rung. A bug report names a
*symptom*; grep every caller before editing, because one guard in the shared function is
a smaller diff than a guard in every caller.

**Never lazy about:** input validation at trust boundaries, error handling that prevents
data loss, security, accessibility basics, or anything explicitly requested.

Deliberate corner-cuts get a `ponytail:` comment naming the ceiling and the upgrade path.
Non-trivial logic leaves **one runnable check** behind — the smallest thing that fails if
the logic breaks. No frameworks, no fixtures.

Output shape: `[code] → skipped: [X], add when [Y].` If the explanation is longer than
the code, delete the explanation.

---

## Grill (mattpocock, locally forked)

Skills: **`grill-me`** (user-invoked · `/grill-me`) and **`grilling`** (the interview loop).

**When:** non-trivial plan, product direction, design choice, or any idea still vague —
*before* implementation. Prefer a fresh conversation. Leave plan-mode off (it rushes to a plan).

**How (skill contract):**

0. **Round 0 — research the protocol, not the domain.** Before the first question, go find
   what this field settles *before* work starts: regulators, professional bodies, standards,
   due-diligence questionnaires, practitioner playbooks. **Never a blog's "10 questions
   to ask…".** That research seeds the tree. A model asking from its own priors asks the
   obvious questions; **the point is to ask the ones the user didn't know existed.**
1. Map a **design tree** (decisions branch into decisions).
2. Work in **rounds**. Each round asks the whole **frontier** — every decision whose
   prerequisites are already settled. Number questions; recommend an answer on each.
3. Question shape:

   ```
   ❓ **Q1** - **<title>**: <body / options>

   ➡️ <your recommended answer>
   ```

4. **Facts are the agent's job. Decisions are the user's.**

   | | who resolves it | how |
   |---|---|---|
   | **Environment fact** — files, repo, installed versions, running services | agent | read it, or dispatch a sub-agent for a broad sweep |
   | **World fact** — API capability, limit, price, prior art, current best practice | agent | **ChatGPT web via `playwright-extension`** — never model memory, never anonymous fetch |
   | **Decision** — what they want, what they'll trade off, what "good" means | **user** | ask, then wait |

   *"I think" / "as far as I know" appearing in a question = a fact you skipped looking up.*
   **Don't block:** a running lookup only holds up the questions downstream of it — ask the
   rest of the frontier now. Take the answer as **evidence, not verdict**: check the citations
   resolve. Research that contradicts what you were about to build is the *point*.

5. **Two directions of "I don't know":** they answered → **dig deeper** (they know this field,
   raise precision); they couldn't → **don't push**, fall back on the industry standard from
   Round 0 and say what you're falling back to.
6. Tag every settled item `HUMAN_CONFIRMED` / `AUTHORITATIVE` / `INFERRED`.
   **Nothing critical stays `INFERRED`** when the frontier is declared empty. This is what
   makes churn diagnosable: `AUTHORITATIVE` items getting overturned means the research was
   bad; `HUMAN_CONFIRMED` items getting overturned means the questions were bad —
   **opposite fixes**.
7. Done when the frontier is empty **and** the user confirms shared understanding.
   **Do not implement** until that confirmation.

User should steer: push back, say "I don't know", stop scope drift — not nod through 40 questions.
Ungrillable "how should it feel?" items → stop grilling; prototype or research first, then return.

---

## Local rule 1 — Research before write

For any non-trivial problem:

1. **ChatGPT research loop (required).** Use **`playwright-extension` only** (logged-in Chrome).
   Not `agent-browser`, not anonymous fetch, not model-only guessing.
   List tabs → new tab → **one complete contract** (today's date · full background · numbered
   questions · demand source URLs and dates · ask for the counter-argument) → wait through
   search/reasoning → read the full answer → narrow follow-ups until candidates or a dead end.
2. **Git locally.** Shallow-clone under `~/oss/<name>` (or `/tmp/refs/<name>`).
3. **Analyze.** License, maintenance, fit; keep / adapt / discard with reasons.
4. If the plan/design is still open: **`/grill-me`** until confirmed.
5. **Then implement** under Karpathy + ponytail rules.

Trivial one-line fixes in an already-understood file may skip research/grill; when unsure, do both.

## Local rule 2 — Review after build

When a development slice is ready to call done:

1. Self-verify (tests / typecheck / real path as applicable).
2. **Grok review (required):** Grok subagent(s) on the diff **and** Grok CLI when available.
3. Fix accepted findings; re-check. Do not claim done without this step.

Human owns: secrets, spend, public deploy, force-push, and `git push` unless asked.
