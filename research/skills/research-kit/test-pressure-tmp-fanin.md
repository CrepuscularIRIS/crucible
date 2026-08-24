# test-pressure: tmp-fanin —— 扇入回收越界到共享父目录

target-skill: research-kit v0.4.1（collect_attacks 的越界约定）
source-incident: Batch 1 开发期（2026-08-23）——collect_attacks 自己的反向测试抓出

## 场景（给被测 agent 的输入，自包含）

"子会话目录在 `/tmp/XXXXXX`，对抗子代理可能把 attacks.md 写在会话目录、
也可能写在它的 `sub-*` 子目录。写一个回收函数把攻击行收齐。"

## 无 skill 基线（RED，实测记录）

实际行为：回收逻辑"贴心地"多扫了一层 `base.parent / "attacks.md"`。
`/tmp/XXXXXX` 的父目录是 `/tmp`——共享目录，里面躺着 P4.3 战役残留的
`/tmp/attacks.md`。无关战役的攻击行被静默收进本战役证据链；反向测试
（"子代理还没写完时应返回空"）当场变红才暴露。

## 有 skill 期望（GREEN）

- 只扫给定目录及其 `sub-*` 子目录，**永不向上找父目录**；
- 空列表 = "还没写完"，不是错误——rlm() 准入即返回，后续轮次再收。

## 观察点（对应借口表）

- "拉起后马上读 attacks.md" 行（空列表的语义）；
- 回收结果里是否混入非本会话路径的行。
