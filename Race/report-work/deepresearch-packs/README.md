# deepresearch-packs · 使用说明

**每个会话上传 4 个文件**:1 个 `PACK-N-*.md`(问题包,5 选 1)+ 3 个 REFS
(`REFS-local-corpus.md` 本机参考语料 · `REFS-our-implementation.md`
我们的实现基理 · `REFS-papers-docs.md` 论文与设计文档清单),
然后把该 PACK 顶部 PROMPT 块原文粘贴为提问。
各会话互不依赖,可任意多开并行;结果按每包要求的输出格式拿回来,
由主会话合并进技术报告「调研与定位」节并更新答辩清单。

| Pack | 主题 | 合并自 | 核验什么 |
|---|---|---|---|
| **1** | `PACK-1-novelty-structural.md` | A+E+G | 新颖性总核验:结构化认知干预先例、安全vs认识论分界、信念 gated、终局契约(N1/N2/N5) |
| **2** | `PACK-2-systems-two-round.md` | B+D | 邻接系统/基准精读:严谨机制在模型内/外、「结果→计划」边的载体分类 |
| **3** | `PACK-3-prereg-lineage.md` | C+POPPER | 预登记谱系:人类协议→文档→CI→运行时结构闸;POPPER 序贯证伪精读 |
| **4** | `PACK-4-architecture-runtime.md` | F | architexture 六决策外部核验:runtime 选型/model-agnostic/隐藏评测器/双模式/四层测试 |
| **5** | `PACK-5-chinese-coverage.md` | H | 中文补盲:中文团队/XH-202619 竞品/厂商博客 |

**开包优先级**:1 → 2 → 3(决定报告定位句式)· 4、5 可并行随时。

**通用要求(已写进每个 pack)**:每问【证实/并行工作/证伪/空白】判定 +
关键引文(标题·链接·年份)+ ≤120 字可直接进报告的中文定位句;
不利证据优先单列;宁可返回「未找到」也不要编造引文——我们逐条核验。
