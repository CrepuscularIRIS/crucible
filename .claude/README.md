# `.claude/` layout

```text
.claude/
  CLAUDE.md              always-on: Karpathy (inlined) + ponytail summary + grill contract
                         + Local rule 1 (research before write) / 2 (Grok review after build)
  settings.local.json    enables the ponytail plugin (always-on via its SessionStart hook)
  skills/
    grilling/            interview primitive — LOCAL FORK, do not re-copy upstream
    grill-me/            from mattpocock/skills, verbatim (user: /grill-me)
    karpathy-guidelines/ MIT, full text (CLAUDE.md inlines the summary)
    ponytail/            MIT, DietrichGebert/ponytail — SKILL.md + LICENSE
    SOURCE-mattpocock.txt
```

**Self-contained on purpose.** Everything here is a real file, not a symlink into
another checkout — this tree travels with the repo.

## What loads when

| Mechanism | What loads |
|---|---|
| `.claude/CLAUDE.md` | Always-on |
| `.claude/skills/<name>/SKILL.md` | On demand (one level deep only) |
| ponytail plugin (`settings.local.json`) | Always-on via its SessionStart hook |

The local `skills/ponytail/` copy is the fallback: it keeps `/ponytail` working even
where the plugin isn't installed.

## Refreshing upstream

```bash
git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/mattpocock-skills
cp -a /tmp/mattpocock-skills/skills/productivity/grill-me .claude/skills/
# do NOT blindly cp grilling/ — it would clobber the local fork.
```

`grilling/SKILL.md` diverges from upstream: Round 0 protocol research, the
fact-vs-decision split with ChatGPT web named as the world-fact channel, the two
opposite directions of "I don't know", and `HUMAN_CONFIRMED` / `AUTHORITATIVE` /
`INFERRED` provenance tags. See `skills/SOURCE-mattpocock.txt`.
