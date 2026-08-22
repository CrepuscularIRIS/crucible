---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Researches how this field itself elicits requirements before asking anything, resolves every fact via ChatGPT web, and puts only genuine decisions to the user. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrase.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

## Round 0 — research the protocol, not the domain

**Before the first question, go find out what this field settles before anyone starts work.**
Not "what is a recommender system" — **"what do practitioners in this line pin down
before writing a line of code, and why."** Search the field's *written* protocols:
regulators, professional bodies, government handbooks, certification standards,
standardized due-diligence questionnaires, practitioner playbooks. For fields with no
formal standard: publisher project templates, the public design decisions of top
practitioners, peer-reviewed education research. **Never trust a blog post's
"10 questions to ask before…".**

Compile what you find into the initial design tree. Each node carries: the in-field
term for the decision, why it must be settled *before* work starts, the 2–5 options
that actually exist in practice, and what the field's safe default is.

This is what separates a grill from a chat. A model asking from its own priors asks
the obvious questions. **The point is to ask the questions the user didn't know existed.**

## Rounds

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are
already settled — the questions you can ask _now_ without guessing at answers you
haven't heard yet. Ask the whole frontier in one round: number each question and give
your recommended answer. Then wait for the user's answers before the next round.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier
outward and unblock questions that depended on them. Recompute the frontier and ask
the next round. A question whose answer depends on another question still open in this
round belongs to a _later_ round, not this one.

## Facts are yours. Decisions are theirs.

**Finding facts is your job, never the user's.** Split every candidate question:

- **Fact** — has a right answer that exists outside this conversation (what the API
  supports, what the limit is, what that library does, what the field's convention is,
  what already exists on disk). **You go get it. Never ask.**
- **Decision** — has no right answer outside the user's head (what they want, what
  they'll trade off, what "good" means to them). **Only these reach the user.**

If you catch yourself about to say "I think" or "as far as I know" in a question,
that question was a fact and you skipped the lookup.

### The fact channel

**Environment facts** (filesystem, repo, installed versions, running services) →
read them yourself, or dispatch a sub-agent for a broad sweep.

**World facts** (API capabilities, limits, pricing, prior art, current best practice,
what shipped this year) → **ask ChatGPT web via `playwright-extension`.** Not
model-only recall, not an anonymous fetch. The logged-in session has search and
reasoning the local model does not, and web beats a training cutoff.

```
browser_tabs list                      # see what's open
browser_tabs new  https://chatgpt.com/ # fresh thread — don't pollute an existing one
browser_type      #prompt-textarea     # one complete contract, submit: true
```

Poll until it finishes, then read the whole answer:

```js
// still working?  →  busy === true
() => { const m = document.querySelectorAll('[data-message-author-role]');
        const last = m[m.length-1];
        return { busy: !!document.querySelector('button[data-testid="stop-button"]'),
                 role: last?.getAttribute('data-message-author-role'),
                 text: last?.innerText }; }
```

Write **one complete contract**, not a chat opener: today's date, the full background,
the numbered questions, and an explicit demand for source URLs and dates. Ask for the
**counter-argument** on anything you're about to build on. Then narrow with follow-ups
until you have candidates or a dead end.

**Don't block on it.** A running lookup is an unsettled prerequisite: only the questions
downstream of it wait. Ask the rest of the frontier now.

**Take the answer as evidence, not verdict.** Check the citations resolve and the
numbers match. Research that contradicts what you were about to build is the point of
doing it — say so plainly and change the plan.

## Two kinds of "I don't know" — they go opposite directions

- **They answered** → they know this field. **Dig deeper.** A confident answer is the
  signal to raise precision, not to move on.
- **They couldn't answer** → **don't push.** Fall back on the industry standard or
  community consensus you found in Round 0, tell them what you're falling back to and
  why, and move on. Or explain the ground first, then re-ask.

Terminate a branch when every remaining node is "I don't understand / I'm not sure" —
that branch is now carried by the fallback, and it should be **marked as such**.

## Provenance on every settled item

Tag each decision as it settles:

- `HUMAN_CONFIRMED` — the user actually chose it
- `AUTHORITATIVE` — a standard, spec, or doc says so, cited
- `INFERRED` — you guessed a sensible default

**Nothing critical may remain `INFERRED` when you declare the frontier empty.**
This tagging is what makes churn diagnosable later: if the `AUTHORITATIVE` items keep
getting overturned, the research was bad; if the `HUMAN_CONFIRMED` ones keep getting
overturned, the questions were bad. **Those two failures have opposite fixes.**

## Done

The session is done when the frontier is empty: every branch of the design tree visited,
nothing left silently assumed, nothing critical still `INFERRED`.

**Do not act on it until the user confirms you have reached a shared understanding.**
