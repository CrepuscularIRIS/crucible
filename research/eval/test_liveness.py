"""P6.0b liveness 的 truth-leak 回归测试；F1-T4 的 nbsim 活性与 journal_metrics 仿真计数。"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from journal_metrics import bundle_metrics
from liveness import analyze


def assistant_tool(code: str, tool: str = "ipython") -> dict:
    return {
        "timestamp": "2026-08-23T12:00:00Z",
        "message": {
            "role": "assistant",
            "content": [{
                "type": "toolCall",
                "name": tool,
                "arguments": {"code": code},
            }],
        },
    }


class TruthLeakTests(unittest.TestCase):
    def test_kernel_import_neuronbench_is_reported(self) -> None:
        report = analyze([assistant_tool("import neuronbench")])
        self.assertEqual(report.get("truth_leak"), {
            "detected": True,
            "matches": ["benchmark_import"],
        })

    def test_direct_meter_execution_is_reported(self) -> None:
        report = analyze([assistant_tool(
            "python3 /repo/research/eval/world-meter.py --ledger /tmp/x forecast h_sag 0",
            tool="bash",
        )])
        self.assertEqual(report.get("truth_leak"), {
            "detected": True,
            "matches": ["meter_execution"],
        })

    def test_benchmark_tree_read_is_reported(self) -> None:
        benchmark_root = "/tmp/neuronbench-fixture"
        with patch.dict("os.environ", {"NEURONBENCH_ROOT": benchmark_root}):
            report = analyze([assistant_tool(
                f"open('{benchmark_root}/neuronbench/worlds.py').read()",
            )])
        self.assertEqual(report.get("truth_leak"), {
            "detected": True,
            "matches": ["benchmark_path_read"],
        })

    def test_unconfigured_benchmark_path_does_not_guess_a_machine_path(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            report = analyze([assistant_tool(
                "open('/tmp/neuronbench-fixture/neuronbench/worlds.py').read()",
            )])
        self.assertEqual(report.get("truth_leak"), {
            "detected": False,
            "matches": [],
        })

    def test_honest_world_mcp_call_is_not_reported(self) -> None:
        events = [{
            "timestamp": "2026-08-23T12:00:00Z",
            "message": {
                "role": "assistant",
                "toolName": "mcp__research__world_observe",
                "content": [],
            },
        }]
        report = analyze(events)
        self.assertEqual(report.get("truth_leak"), {
            "detected": False,
            "matches": [],
        })


class NbsimLivenessTests(unittest.TestCase):
    CODE = "import sys; sys.path.insert(0, 'research-work/r1')\nimport nbsim\nr = nbsim.simulate(m, seg, 64, seed=1)"

    def test_parent_nbsim_import_and_simulate_are_counted(self) -> None:
        report = analyze([assistant_tool(self.CODE)])
        self.assertEqual(report.get("nbsim"), {
            "parent": {"import": 1, "simulate": 1},
            "child": {"import": 0, "simulate": 0},
        })

    def test_child_session_counts_separately(self) -> None:
        header = {"type": "session", "id": "c", "timestamp": "t", "cwd": "/w", "rlmDepth": 1}
        report = analyze([header, assistant_tool(self.CODE)])
        self.assertEqual(report.get("nbsim"), {
            "parent": {"import": 0, "simulate": 0},
            "child": {"import": 1, "simulate": 1},
        })

    def test_nbsim_import_is_not_a_truth_leak(self) -> None:
        report = analyze([assistant_tool(self.CODE)])
        self.assertFalse(report["truth_leak"]["detected"])


class JournalMetricsSimSourceTests(unittest.TestCase):
    def test_sim_calls_read_world_env_and_sim_records(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            arm = Path(tmp) / "campaign" / "arm"
            (arm / "run").mkdir(parents=True)
            sim = arm / "research-work" / "r1" / "sim"
            sim.mkdir(parents=True)
            for i in range(3):
                (sim / f"s{i}.json").write_text(json.dumps({"counts_mean": 1.0, "reps": 64}))
            events = [{"op": "run.init", "run": "r1", "ts": "2026-10-14T00:00:00Z"},
                      {"op": "world.env", "sha256": "ab" * 32, "ts": "2026-10-14T00:01:00Z"}]
            (arm / "run" / "journal.jsonl").write_text("".join(json.dumps(e) + "\n" for e in events))
            metrics = bundle_metrics(arm)
        self.assertEqual(metrics["sim_calls"], 3)
        self.assertEqual(metrics["sim_env"], "ab" * 6)


if __name__ == "__main__":
    unittest.main()
