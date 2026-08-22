# Browser Patterns — driving ChatGPT via Playwright (2026-08-01)

**LOAD WHEN:** first time driving the browser this session.

> Concrete recipes for the browser apparatus. These patterns were discovered by live testing and solve
> real failure modes (stale refs, dynamic rendering, disabled submit buttons). Use them directly — don't
> reinvent the interaction each session.
>
> **Two tabs, one browser** *(revised 2026-08-19: Google Scholar is back; ScienceDirect is out with the
> Elsevier targets)*. **ChatGPT** serves three jobs and *which job it is doing is set entirely by the
> prompt* — grill answerer (as itself), literature search engine (search contract), debate panel (role
> contracts); contracts live in `debate-protocol.md`. **Scholar** serves one — citation-chain discovery,
> which is the thing the local corpus cannot do. Full text comes from `/data`, not from a paywall.

## Tab layout

| Tab | URL | Role |
|---|---|---|
| ChatGPT | `chatgpt.com` | answerer · search engine · debate panel |
| Scholar | `scholar.google.com` | citation chains · who-cited-whom · adjacent-field discovery |

**Full text is local, not browsed.** 80k CCF-A papers sit on `/data` with PDFs on disk —
`python3 .claude/scripts/corpus.py search "<terms>" --venue ICLR --paths`. Use the browser to *find*
and the corpus to *confirm and read*; a title is a lead until the corpus returns it.

```
mcp__playwright-extension__browser_tabs(action="list")            # ALWAYS list first
mcp__playwright-extension__browser_tabs(action="select", index=<n>)
```

**Select by TITLE-verified index, never by a remembered one.** Tab indices move whenever a tab opens or
closes, and selecting a stale index silently sends a debate role contract into the wrong site. List,
match the title, then select.

**`playwright-extension` only.** It attaches to the user's real Chrome, which is what carries both the
ChatGPT login and the institutional ScienceDirect session. `agent-browser` launches its own browser with
neither — and fails *silently*, returning an anonymous view rather than an error.

**Within ChatGPT, a conversation — not a tab — is the unit of isolation.** Everything that must be independent —
anti-anchoring breaks, cold-start replication, each blind debate role — is a *fresh conversation* on this
one tab. Never run two debate attackers in the same thread.

## CRITICAL: ref stability

Playwright-extension element refs (`[ref=eNNN]`) go stale after ANY page mutation (typing, navigation,
response rendering). **Do NOT cache refs across actions.** Two reliable approaches:

1. **Re-snapshot before every interaction** — `browser_snapshot` or `browser_find` immediately before the
   click/type that uses the ref.
2. **Use `browser_evaluate` with CSS selectors** — bypasses the ref system entirely. Safer for long
   multi-round sessions where the DOM mutates heavily.

## Sending and reading

**Send a message:**
```
# Option A: find + type (re-snapshot first)
mcp__playwright-extension__browser_find(text="Send a message")
mcp__playwright-extension__browser_type(target="[ref=<fresh_ref>]", text="<your question>", submit=true)

# Option B: evaluate (more reliable for long sessions)
mcp__playwright-extension__browser_evaluate(function="""() => {
  const el = document.querySelector('#prompt-textarea, [contenteditable="true"]');
  if (!el) return 'not found';
  el.focus();
  el.textContent = '<your question>';
  el.dispatchEvent(new Event('input', {bubbles: true}));
  return 'typed';
}""")
mcp__playwright-extension__browser_press_key(key="Enter")
```

**Read the response** (wait ~15–30s; a role contract with a search step can take longer):
```
mcp__playwright-extension__browser_evaluate(function="""() => {
  const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
  if (!msgs.length) return 'no response yet';
  const last = msgs[msgs.length - 1];
  return last.innerText.substring(0, 4000);
}""")
```

**Long answers** — a role contract's output routinely exceeds one read. Page through it rather than
truncating, or you will discharge half a review:
```
mcp__playwright-extension__browser_evaluate(function="""() => {
  const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
  return msgs[msgs.length - 1].innerText.substring(4000, 8000);
}""")
```

## Fresh conversation — the anti-anchoring primitive

```
mcp__playwright-extension__browser_navigate(url="https://chatgpt.com")
```

The old conversation stays in ChatGPT's history; nothing is lost. **The pre-registration ledger is YOUR
state, not ChatGPT's** — a fresh chat costs the orchestrator nothing.

Fire it when:

- a promising direction has emerged and been RECORDED — then attack the problem from a different angle;
- the conversation is converging too early, or answers have started agreeing with earlier answers;
- you want to test whether a crack **replicates from a cold start** (a crack that survives a fresh
  conversation is much stronger evidence than one that only appears in a continuing thread);
- **every debate role** (`debate-protocol.md`) — R1, R2 and R3 must not see each other;
- after ~10 rounds, when the page also gets heavy.

## Driving a ROLE, not a question

For the search-engine and debate contracts the whole prompt is the contract — **ROLE · OBJECTIVE ·
CRITERIA · OUTPUT · OUT OF SCOPE**, pasted as the first message of a fresh conversation. Two mechanical
points that matter in practice:

- **Send the contract as one message.** Splitting it across turns lets the model start answering the role
  description before it has the criteria, and it then anchors on its own preamble.
- **Check the shape of what came back before discharging it.** If the reply lists strengths when the
  contract forbade them, or omits a named output field, **re-issue the contract in a fresh conversation
  with the defect stated** ("your previous answer listed strengths; the contract forbids that"). Take the
  second result, note the degradation in the ledger, and continue — never pause the campaign over it.

## Anti-patterns (learned from live testing)

| Anti-pattern | What happens | Fix |
|---|---|---|
| Cache refs across actions | `[ref=eNNN]` does not match any elements | Re-snapshot or use `browser_evaluate` |
| Read response too early | "no response yet" | Wait 15–30s; retry once |
| Stay in one thread for 15+ rounds | Anchoring on previous answers; slow DOM | Fresh chat after 2–3 explored lines |
| Run two debate roles in one thread | The second agrees with the first; correlated objections read as consensus | One conversation per role |
| Truncate a role's output at 4000 chars | You discharge half a review and the missing half is usually the criteria-driven part | Page through with `substring(4000, 8000)` |
| Ask an unspecified "what do you think?" | Balanced, agreeable prose — the least useful output available | Issue a contract with `OUT OF SCOPE` |
| Keyword search | Generic results | Phrase as a natural-language research question, with date range and the specific constraint |
| Use `agent-browser` or `WebFetch` for ScienceDirect | Anonymous view; every record comes back `access_level: metadata` and reads as a paywall | `mcp__playwright-extension__*` only — it carries the real session |
| Select a tab by remembered index | Indices move when tabs open/close; a role contract lands on the wrong site | `browser_tabs(action="list")` and match the title, every time |
