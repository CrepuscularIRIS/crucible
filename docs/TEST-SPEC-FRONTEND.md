# Frontend Stability & Capability Test Spec

**Env:** `bun run dev`; browser `http://127.0.0.1:5173`. The desktop window and every
browser tab are **views of one shared backend** — not isolated sessions. Channel: Qwen
(DashScope), models qwen3.7-plus / qwen3.7-max. Watch the dev log while testing.

## Core rule
For each capability verify the whole chain:
**trigger → visible UI state → backend execution → streamed feedback → final result → recovery/persistence.**
Any skill, sub-agent, tool call, progress indicator or completion badge shown **must map to a
real runtime event**. Cross-check every claim against the log. Decorative-only UI is a defect,
and so is real work that the UI never shows.

## Areas
1. **Chat core** — short/long prompts, CJK, markdown, code, tables, math. Stream smoothness,
   scroll behaviour, stop mid-stream, then continue.
2. **Thinking** — change levels; confirm reasoning content appears and genuinely changes output.
3. **Tools** — only `bash` + `edit` exist. Read/search/create/modify files; confirm displayed
   tool name, args and output match actual execution; permission prompt appears; deny works.
4. **Skills** (17 installed) — invoke; verify activation is real, not a label.
5. **Sub-agents / delegation** — spawn; per-agent progress and completion; a dead agent must
   not render as running.
6. **Long-horizon** — a >5 min task: progress legibility, turn/budget counters, interrupt,
   queue a message mid-run, resume.
7. **Compaction** — force overflow; check boundary marker, token counter *after* compaction,
   and continuation.
8. **Errors** — bad API key; kill network mid-stream; provoke 429. Must retry (≤8) **without
   ending the run**; messages must be actionable.
9. **Persistence** — refresh mid-run; reconnect; history, draft and run state intact.
10. **Concurrency** — browser + desktop window at once; two tabs; simultaneous edits.
11. **Config** — switch model/channel mid-session; add/delete channel; wrong baseUrl.
12. **Files** — attach, drag-drop (browser exposes no real paths), large file, preview.
13. **Edge** — type `/goal`, `/compact`, `/refine` as chat (must not reach Prime); empty send;
    huge paste; rapid repeated send; very long session.

## Record per issue
repro steps · severity (S1 blocks use → S4 cosmetic) · expected · actual · log/event evidence ·
intermittent? (repeat 3×).

## Qualitative
Responsiveness; discoverability; is progress understandable during long work; when does the
agent ask for input; does interruption feel immediate; are failures recoverable; is it coherent
enough for daily use.

## Stop when
All areas exercised; the three main journeys (chat, tool-using task, long-horizon run) repeated
3× cleanly; frontend/backend consistency confirmed; stability risks documented with evidence;
and a stated verdict on readiness for sustained real-user testing.
