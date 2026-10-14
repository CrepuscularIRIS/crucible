SUMMARY

W1 召回（identify/light）完成：三镜头召回 7 机制族 + 3 伪影/前提，全部过门稳态实例化检查；每族 4 条 sanity（reps=64, seed=0），共 44 条 sim 记录。参考模型协议5 自身 15.42±1.74（基线自带 rebound），族效应以差值表达。

- ih：超极化激活内向电流；ΔP5=+2.4，符号效应≈0。
- cat：低阈瞬态内向电流；ΔP5=+5.5，符号效应 +7.0，Cd 敏感。
- nap：近阈持续内向电流，纯增益；ΔP5=+3.7。
- mcur：去极化激活外向电流，唯一负向族（−2.4），XE991 可翻转。
- ihfast：IH 快动力学异名；条件期末电位远高于地板。
- catna：CaT 门、E=50 异名；Cd 不敏感，与 cat 正交。
- combo：IH+CaT；sd 全场最大，Cd 只削一半。
- shunt/noisysrc：伪影对手，贴参考。
- slowna 开关：不可被阻断剂剔除的建模前提。
镜头3 另记：v-clip 地板、test_start 语义、双内核不一致、观测噪声不在仿真 sd。

文件：recall/families.md（完整族节+伪影与前提+差值表）；sim/ 下 44 条 JSON；本 out.md。

STATUS: ok PATH: .rlm-jobs/ca-rebound/recall/W1/2458/out.md
