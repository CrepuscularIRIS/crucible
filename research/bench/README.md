# research/bench: benchmark staging and scoring helpers

These are host-side helpers for plan `mindset/调研/redesign/05-多基准评测计划.md`
(slices S0, S2, S3 and the programmatic half of S5). The agent never runs these
scripts and never sees their inputs. They cover:

| script | slice | what it does |
|---|---|---|
| `stage_arc.py` | S2 | ARC manifest → `task-card.yaml` (field whitelist, no `rubric_path` / `arxiv_id` / `venue` / `paper_asset`) + `MANIFEST.sha256` |
| `stage_rcb.py` | S3 | copies RCB `data/` and `related_work/`, writes `task-card.yaml` (`task`, `data`) + `MANIFEST.sha256`, creates `code/ outputs/ report/images/`. Refuses a workspace inside the RCB repo. Deletes the workspace and fails if any staged file is byte-identical to a `target_study/` file |
| `score_arc.py` | S5 | programmatic ARC checks only: the submission contract (must_pass), `results.json` keys that the task's `req_results_json` names, and upstream's verdict / metric-coverage signals. The report counts the rubric leaves as **not scored** and gives no leaf ids, because the ids are descriptive. Upstream `judge.py` does not import (plan 05 R11). must_pass requirements that need a judge are listed under `unchecked`. Exit code is 1 when any programmatic must_pass item fails |
| `cost_meter.py` | S0 | Pi/Prime session JSONL (parent + `sub-*` children) → per-model input / cached / cache_write / output tokens + wall clock. A child's tokens are counted once (latest aggregate − Σ childUsage for `child_usage_attributed` targets, as Prime does). Non-session `.jsonl` files are skipped |

Tests: `python3 -m pytest -q research/bench` (the ARC and RCB tests read the real
checkouts and skip if they are missing; the leak strings come from the real
rubric and `target_study` files when the tests run).

Upstream pins: RCB `~/oss/ResearchClawBench` @ `23e0a58`; ARC `~/oss/AutoResearchClaw/experiments/arc_bench` @ `be4ba47`.

## Before any real run (not done here)

- **Deny roots (S1):** the agent must not be able to read `~/oss/ResearchClawBench`, `~/cli/ResearchClawBench`,
  `~/oss/AutoResearchClaw`, `research/eval`, `research/campaigns`, `mindset`, or any `$RUN/collected` / `$RUN/score-ws`.
  Staging outside the repos does not by itself stop `cat ~/oss/...`.
- **Network (plan Q4):** each RCB task text names its target paper's title, so with open network the paper can be found in one search.
- Do not start RCB's Web UI: it serves checklists on `0.0.0.0:5000`.

## ARC example: ML04

```bash
BENCH=/home/lingxufeng/crucible/research/bench
RUN=$HOME/bench-runs/arc-ML04-$(date +%Y%m%d-%H%M%S)      # outside every benchmark repo

# 1. stage; keep a copy of the manifest outside the workspace (the agent can write to the workspace)
python3 $BENCH/stage_arc.py ML04 $RUN/ws
cp $RUN/ws/MANIFEST.sha256 $RUN/MANIFEST.sha256

# 2. agent run (in the Proma app; out of scope here). Workspace = $RUN/ws.
#    The agent writes $RUN/ws/submission/{code/, results/metrics.json, README.md, claims.json}
#    (the layout is in task-card.yaml under `deliverables`).

# 3. collect (after report_declare). Proma keeps Pi sessions in ~/.proma/sdk-config/sessions/<file>.jsonl
#    and RLM children under ~/.proma/sdk-config/session-artifacts/<header id>/sub-*/.
(cd $RUN/ws && sha256sum -c --quiet $RUN/MANIFEST.sha256) || echo "STAGED INPUTS CHANGED"
mkdir -p $RUN/collected/sessions
cp -r $RUN/ws/submission $RUN/collected/submission
PARENT="${PARENT:?export PARENT=<path of the run's parent session .jsonl under ~/.proma/sdk-config/sessions/>}"
SID=$(head -1 "$PARENT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
cp "$PARENT" $RUN/collected/sessions/
[ -d ~/.proma/sdk-config/session-artifacts/$SID ] && cp -r ~/.proma/sdk-config/session-artifacts/$SID $RUN/collected/sessions/children

# 4. score (programmatic only; exit 1 = a must_pass item failed)
python3 $BENCH/score_arc.py ML04 $RUN/collected/submission --out $RUN/collected/score-arc.json

# 5. cost
python3 $BENCH/cost_meter.py $RUN/collected/sessions
python3 $BENCH/cost_meter.py $RUN/collected/sessions --json > $RUN/collected/cost.json
```

## RCB example: Information_005

```bash
BENCH=/home/lingxufeng/crucible/research/bench
RCB=$HOME/oss/ResearchClawBench
RUN=$HOME/bench-runs/rcb-Information_005-$(date +%Y%m%d-%H%M%S)

# 1. stage (copies about 100 MB); keep the manifest outside the workspace
python3 $BENCH/stage_rcb.py Information_005 $RUN/ws
cp $RUN/ws/MANIFEST.sha256 $RUN/MANIFEST.sha256

# 2. agent run (in the Proma app; out of scope here). Workspace = $RUN/ws; deliverable = report/report.md + report/images/*.png.

# 3. collect: a NEW RCB-layout dir for upstream score.py (plan 05 §3.2), plus sessions as in the ARC example
(cd $RUN/ws && sha256sum -c --quiet $RUN/MANIFEST.sha256) || echo "STAGED INPUTS CHANGED"
mkdir -p $RUN/score-ws $RUN/collected/sessions
cp -r $RUN/ws/report $RUN/ws/outputs $RUN/score-ws/
# the judge reads INSTRUCTIONS.md as context in every prompt; build upstream's own text on the host
(cd $RCB && python3 -c "from evaluation.run_task import TaskRunner; print(TaskRunner('Information_005')._build_instructions())") \
  > $RUN/score-ws/INSTRUCTIONS.md
python3 -c 'import json,sys; json.dump({"run_id": sys.argv[1], "task_id": "Information_005", "agent_name": "crucible"}, open(sys.argv[2], "w"))' \
  "$(basename $RUN)" $RUN/score-ws/_meta.json
# (copy PARENT + session-artifacts/$SID into $RUN/collected/sessions exactly as above)

# 4. score: upstream LLM judge, on the host, after declare. One-time setup (score.py needs structai):
#      python3 -m venv ~/.venvs/rcb-score && ~/.venvs/rcb-score/bin/pip install 'structai>=0.1.23' 'openai>=1.0' python-dotenv
#    The judge key comes from $RCB/evaluation/.env inside this process only; do not echo it.
#    Print only numbers: _score.json and the return value contain checklist text.
(cd $RCB && git rev-parse --short HEAD && ~/.venvs/rcb-score/bin/python - "$RUN/score-ws" <<'EOF'
import sys
from dotenv import load_dotenv
load_dotenv("evaluation/.env")              # before importing config (reads JUDGE_MODEL_NAME at import)
from evaluation.score import score_workspace
r = score_workspace(sys.argv[1])
if "error" in r:
    sys.exit(r["error"])
print("total", r["total_score"])
for it in r["items"]:
    print(it["index"], it["type"], it["weight"], it["score"])
EOF
)

# 5. cost
python3 $BENCH/cost_meter.py $RUN/collected/sessions --json > $RUN/collected/cost.json
```

`$RUN/score-ws/_score.json` holds checklist excerpts and judge reasoning. Keep it inside the deny roots and do not paste it into a report.

## Known gaps

- `claims.json` / `results.json` are written by the agent. Plan S5 wants them projected from the journal by the host; that projection is not built.
- No fingerprint scan or liveness (S4) and no `check_bench_run.py` (S6).
- `stage_arc` drops unknown fields with a warning, and keeps going. It does not stop. It keeps only listed keys at the top level, in `experiment_design`, and in hypothesis and requirement items. Values below those keys (for example `metrics[]` entries) are copied whole. Today it drops exactly `arxiv_id, paper_asset, rubric_path, venue` on all 55 manifests.
- `cost_meter` sums every session file it is given. Prime itself reads only the newest file in each `sub-*` directory, so check whether a resumed child has left a second file there.
