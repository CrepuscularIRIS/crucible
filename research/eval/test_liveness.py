"""P6.0b liveness 的 truth-leak 回归测试。"""

from __future__ import annotations

import unittest

from research.eval.liveness import analyze


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
        report = analyze([assistant_tool(
            "open('/home/lingxufeng/oss/neuronbench/neuronbench/worlds.py').read()",
        )])
        self.assertEqual(report.get("truth_leak"), {
            "detected": True,
            "matches": ["benchmark_path_read"],
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


if __name__ == "__main__":
    unittest.main()
