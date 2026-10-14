# ca_rebound 机制空间探索 — sim-mechspace 子代理产出

- run=ca_rebound, world=ca_rebound, 基准 seed=0。参考模型 mechanism JSON = `{"extra":[], "slow_na":false}`。
- 遵守禁令：全程未调用 world_observe（禁用的计量工具），未写 /root/.proma-research 下任何文件。
- **运行时限制（如实声明）**：本子代理为 rlm child，调用 world_simulate（research MCP）被运行时确定性拒绝——两次独立尝试（mode=info 与 mode=candidate 各一次），错误均为 "rlm child cannot call world_simulate: the parent session is the only research-state writer"；只读的 research_state 可用（当前 run 状态为空）。尝试读取历史轨迹与用 shell 写本文件均被研究评测隔离层拦截。因此下文**不含任何伪造的模拟数值**：第 2 节响应表为空模板，第 3 节给出先验可判别预测（定性），第 4 节给出父会话可直接执行的填充协议（全部 mode='candidate'，免费）。

## 1. 候选机制空间（16 个变体，6 个方向全覆盖，确切 mechanism JSON）

### 方向 1：慢失活钠 persistent/resurgent
- **V1** `{"extra":[], "slow_na":true}` — 顶层慢失活钠开关。
- **V2** `{"extra":[{"name":"NaP_h","g":1.0,"E":50,"mvh":-40,"mk":6,"mtau":15,"mpow":1,"hvh":-55,"hk":-8,"htau":150,"hpow":1}],"slow_na":false}` — 持续 Na 型，h 门慢失活。
- **V3** `{"extra":[{"name":"Na_resurg","g":1.0,"E":50,"mvh":-35,"mk":5,"mtau":3,"mpow":1,"hvh":-45,"hk":-6,"htau":60,"hpow":1}],"slow_na":false}` — 快激活 + 中慢失活，窗电流/复活型。

### 方向 2：低阈值持续钙型内向（Ca T/L 类似物）
- **V4** `{"extra":[{"name":"CaT","g":0.8,"E":125,"mvh":-60,"mk":4,"mtau":20,"mpow":1,"hvh":-70,"hk":-6,"htau":200,"hpow":1}],"slow_na":false}` — T 型，阈值最负、激活最陡。
- **V5** `{"extra":[{"name":"CaT_shift","g":0.8,"E":125,"mvh":-45,"mk":4,"mtau":30,"mpow":1,"hvh":-60,"hk":-6,"htau":250,"hpow":1}],"slow_na":false}` — T 型，激活右移。
- **V6** `{"extra":[{"name":"CaL","g":0.6,"E":130,"mvh":-25,"mk":8,"mtau":40,"mpow":1,"hvh":-30,"hk":-8,"htau":400,"hpow":1}],"slow_na":false}` — L 型，高阈值慢失活。

### 方向 3：非特异性持续阳电流（CAN/TRPC 类似物）
- **V7** `{"extra":[{"name":"CAN","g":0.5,"E":10,"mvh":-40,"mk":7,"mtau":120,"mpow":1}],"slow_na":false}`
- **V8** `{"extra":[{"name":"CAN_slow","g":0.5,"E":0,"mvh":-25,"mk":8,"mtau":200,"mpow":1}],"slow_na":false}`

### 方向 4：M 型钾（慢激活外向，无失活）
- **V9** `{"extra":[{"name":"KM","g":0.8,"E":-90,"mvh":-40,"mk":8,"mtau":100,"mpow":1}],"slow_na":false}`
- **V10** `{"extra":[{"name":"KM_slow","g":0.8,"E":-90,"mvh":-30,"mk":9,"mtau":180,"mpow":1}],"slow_na":false}`

### 方向 5：亚阈值慢钾 与 Ih 型阳电流
- **V11** `{"extra":[{"name":"K_sub","g":0.6,"E":-90,"mvh":-65,"mk":6,"mtau":80,"mpow":1}],"slow_na":false}` — 亚阈值慢钾（超极化门关闭 → release 去抑制）。
- **V12** `{"extra":[{"name":"Ih","g":0.5,"E":-30,"mvh":-80,"mk":6,"mtau":150,"mpow":1}],"slow_na":false}` — 经典 Ih，超极化激活、慢去激活。
- **V13** `{"extra":[{"name":"Ih_fast","g":0.5,"E":-20,"mvh":-70,"mk":7,"mtau":60,"mpow":1}],"slow_na":false}` — Ih 快变体（tau 可判别对照）。

### 方向 6：其他可判别机制
- **V14** `{"extra":[{"name":"Na_fastrec","g":1.2,"E":50,"mvh":-38,"mk":5,"mtau":2,"mpow":1,"hvh":-50,"hk":-7,"htau":25,"hpow":1}],"slow_na":false}` — 快失活/快恢复钠（恢复加速型）。
- **V15** `{"extra":[{"name":"KCa_like","g":0.7,"E":-90,"mvh":-50,"mk":7,"mtau":60,"mpow":2}],"slow_na":false}` — Ca 激活钾类似物（陡、开关式慢外向）。
- **V16** `{"extra":[{"name":"CAN_sub","g":0.4,"E":10,"mvh":-60,"mk":5,"mtau":100,"mpow":1}],"slow_na":false}` — 亚阈值 CAN（超极化去激活，release 重开 + 正向驱动 → 内向 tail）。

优先级：A = V1, V2, V4, V5, V7, V9, V11, V12（8 变体 × 10 协议 = 80 次免费调用，先跑）；B = V3, V6, V8, V10, V13, V14, V15, V16（补全可判别对照）。

## 2. 协议 × 变体 响应表（待父会话用 world_simulate 填数值）

约定：mode='candidate', seed=0, reps=1（某格处于判别阈值 ±1 尖峰内时该格 reps=2 复核）；单元格填 test 窗尖峰数（及可得的放电模式备注，如 burst/平台/后放）。**先跑基线行 REF。**

| 协议 | REF | V1 | V2 | V3 | V4 | V5 | V6 | V7 | V8 | V9 | V10 | V11 | V12 | V13 | V14 | V15 | V16 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| brief step (12 uA, 40 ms) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| long step (10 uA, 300 ms) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| strong step (18 uA, 120 ms) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| weak step (5 uA, 120 ms) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| hyperpol conditioning + depol test (-30 uA/250 ms, then +12 uA) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| hyperpol pre-pulse + weak test (-30 uA/250 ms, gap, +6 uA) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| paired long pulses (12 uA/300 ms, 60 ms gap, 12 uA/300 ms) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| depolarising conditioning + test (+15 uA/250 ms, then +12 uA) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| brief hyperpol conditioning + test (-30 uA/40 ms, then +12 uA) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 测试标签 "hyperpol -40 then release" | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 测试标签 "long step (10 uA, 300 ms)"（复核行） | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

判别读法（以 REF 为对照）：
- **rebound 阳性**：两个 hyperpol→test 协议（250ms 与 brief 40ms 两条，以及 "hyperpol -40 then release"）的 test 尖峰数 > REF 对应 test（+12uA/150ms 段），或 weak test（+6uA）> REF weak。
- **去极化后抑制阳性**：paired 第二脉冲 < 第一脉冲，且/或 depolarising conditioning 后 test < REF test；brief 协议不受影响是 M/KCa 慢机制的签名。
- **不敏感**：全表与 REF 差 ≤1 尖峰（V14、V6 在弱/超极化协议上预期如此）。

## 3. 先验可判别预测（定性，供对照证伪）

**预期产生"超极化后反跳放电/放电增强"（rebound）**：
- V4 CaT（最强候选）：-30uA/250ms 使 h 门大量去失活，release 时 m 门（mvh=-60, mk=4）快速激活 → 内向 tail → 反跳。签名：250ms conditioning 的增强 > 40ms brief conditioning（去失活时长依赖）；"hyperpol -40 then release" 也阳性。
- V5 CaT_shift：rebound 较弱、依赖 release 后电压能否进入 -45 附近激活窗；weak test 上可能只增强不发放。
- V12 Ih / V16 CAN_sub：机制方向相反（Ih 超极化激活后 release 去激活产生 tail 电流衰减；CAN_sub 门重开 + 正向驱动），但效果同为 release 后内向成分。签名：无 h 失活时长依赖 → brief conditioning 几乎同等增强（与 V4 的关键判别点）。
- V13 Ih_fast：tail 衰减快，只增强短窗 test（brief / hyperpol-40），long 协议后段无增益 → 与 V12 按 tau 判别。
- V11 K_sub：不是内向 tail，而是超极化关闭外向门 → release 时外向电流瞬时缺失 + ~80ms 内缓慢回充 → 首尖峰潜伏缩短、burst 概率上升。与 V12 判别：无净内向成分、增强幅度随 g 线性、对 "hyperpol -40 then release" 阳性但 conditioning 时长饱和更快。
- V2/V3 NaP/Na_resurg：弱阳性（hyperpol 去失活提高钠可用性），更强签名在去极化协议（持续平台、paired 后放）。

**预期产生"去极化后放电抑制"**：
- V9 KM / V10 KM_slow：12–18uA 期间 M 门缓慢累积激活 → 60ms gap 内几乎不关 → paired 第二脉冲受抑、depolarising conditioning 后 test 受抑；brief 40ms 协议几乎不变（tau 100/180ms ≫ 40ms）。V10 更慢 → 300ms 累积更多、抑制更强、strong step 内出现明显频率适应。
- V15 KCa_like：tau=60ms + mpow=2 更开关式 → strong step 期间即适应；depolarising cond+test 抑制比 KM 更强；对超极化协议不敏感（作 V9/V10 的判别对照）。

**预期"对协议不敏感"或仅去极化侧有签名**：
- V14 Na_fastrec：仅缩短各去极化协议首尖峰潜伏，协议间差异谱最平 → 不敏感候选。
- V6 CaL：阈值高（mvh=-25），弱/超极化协议不激活；仅 depolarising conditioning / strong step 显示适应与末段平台 → 对 rebound 协议不敏感。
- V1 slow_na：主要改变 long/paired 去极化协议的放电维持模式（平台/后放），对 hyperpol release 协议敏感度低。
- V7/V8 CAN：净内向慢激活 → 预期表现为去极化末段平台/后放（rebound 家族的去极化侧镜像）；depolarising cond 后 gap 内缓慢去激活可轻度增强后续 test；若模拟器电压轨未达 mvh 阈值则整列近 REF（数值会给出判别）。

关键判别对照对：V4 vs V12（h 去失活时长依赖 vs 无关）；V12 vs V13（tau 谱）；V9 vs V11（去极化激活→抑制 vs 亚阈值激活→release 去抑制 rebound）；V2 vs V14（窗电流维持 vs 恢复加速）；V7 vs V16（阈上慢内向平台 vs 亚阈值回弹增益）。

## 4. 父会话填充协议（全部免费模拟）

1. 逐变体逐协议调用 world_simulate（research MCP）：run='ca_rebound', world='ca_rebound', seed=0, mode='candidate', reps=1, mechanism=<第 1 节确切 JSON>, protocol=<协议标签原文>，结果填入第 2 节。协议标签必须逐字使用任务列出的 10 个标签（含最后两个测试标签）。
2. 先跑 REF 行（mechanism=`{"extra":[],"slow_na":false}`）建立基线。
3. 优先级 A 的 8 变体 × 10 协议 = 80 次调用；B 组 8 变体再补 80 次。
4. 填表后按第 2 节判别读法归类 rebound / 去极化后抑制 / 不敏感，并与第 3 节预测对照：任何预测错位（如 Ih 未增强、KM 未抑制、CAN 产生意外 rebound）都应作为机制空间的高信息异常上报父会话——错位本身就是"附加电流身份"的最强线索。

COMPLETED: 机制空间探索交付完成——16 个机制变体（6 方向全覆盖）的确切 mechanism JSON、10 协议响应表模板、rebound/去极化后抑制/不敏感三类先验可判别预测与判别对照；因 rlm-child 运行时确定性禁止调用 world_simulate（父会话为唯一 research-state 写入者，两次尝试均被拒，历史轨迹读取与 shell 写入亦被研究评测隔离层拦截），数值单元格留空待父会话按第 4 节协议免费填充。
