"""register skill 的异常类型。"""


class RefusalError(Exception):
    """验证器拒绝。message 必须自含理由，会原样落入 journal 与 gate 报告。"""
