# 扮演法写小说工作台

这是一个本地 Web 项目，用“AI 策划助手 + 导演 AI + 主要角色 AI + 次要角色群 AI + 小说改写 AI”的方式辅助写小说。

项目现在按两个阶段组织：先在挂载策划 skill 的 AI 聊天窗口里持续沉淀背景、角色卡、大纲、场景和线索，再在具体行文时启动多 AI 扮演并改写成正文。

## 当前能力

1. 新建、切换、删除小说。
2. 打开小说后默认进入 AI 策划聊天窗口。
3. 通过策划 skill 对话持续整理背景、角色卡、大纲、场景和线索。
4. 在档案页查看和修正结构化档案。
5. 由 AI 根据档案生成扮演配置草案。
6. 用户可以直接采纳草案，也可以修改 JSON 后采纳。
7. 添加主要角色和次要角色。
8. 主要角色单独选择提供商、模型和温度。
9. 次要角色共同由“次要角色群 AI”扮演。
10. 导演 AI 单独负责本轮背景、时间、地点和剧情引导。
11. 小说改写 AI 将最近扮演记录改写成正文片段。
12. 配置提供商、baseUrl、接口类型、key、模型查询路径。
13. 查询模型或手动添加模型。
14. 使用本地模拟提供商无 key 跑通完整流程。
15. 维护结构化长期记忆，支持有效、暂定、过期、冲突、已解决等状态。
16. 清理旧版机械投影记忆，并保留人工或 Agent 明确沉淀的长期事实。
17. 按策划、导演、主要角色、次要角色群、改写器生成不同上下文包。
18. 使用轻量 BM25 / 关键词检索召回档案、历史扮演、正文和策划对话证据。
19. 在行文记录中查看每轮 AI 实际收到的记忆注入。
20. 正文片段有草稿、已采纳、已废弃三个状态，正文原文属于正文库和 RAG 证据层。
21. 采纳正文后尝试让 AI 从正文中整理可持续影响后续创作的长期事实，不再把正文原文投影成记忆。
22. 侧栏“长期记忆”页只维护稳定长期记忆条目；RAG 检索配置、向量索引、Agent 权限和 verifier 配置放在“Agent 设置”页；证据调度和上下文包预览只作为策划 Agent 的运行审计。
23. 查询模型只返回候选列表，只有用户点击候选模型的“添加”才会保存到提供商。
24. 策划 AI 调用时会注入按任务组装的上下文包，用于承接长期创作决策。
25. 支持 SillyTavern Character Card V2/V3 风格 JSON 导入和导出，并支持读取 PNG 元数据中的 `ccv3`、`chara`、`ccv2` 角色卡载荷。
26. 导入酒馆 V2 角色卡为主要角色时，会自动沿用项目当前可用 AI 槽位，保证导入后可以直接进入扮演链路；用户仍可在角色编辑页手动改提供商和模型。
27. 独立 World Info / Lorebook 页面已落地，可编辑关键词、二级关键词、范围、可见性、插入位置、优先级、触发预算和递归扫描，并支持常见酒馆世界书 JSON 导入/导出。
28. 上下文包已区分 `project_rag`、`orchestration_rag`、`tavern_context`、`group_tavern_context`、`faithful_adaptation` 五种策略；角色扮演会优先走世界书触发和角色可见上下文。
29. 导入角色卡时，`character_book` 会同步为角色私有的独立世界书条目，不再只压平成角色卡长文本。
30. “Agent 设置 / 上下文检索配置”支持本地向量库、OpenAI 兼容 `/embeddings`、BM25 + vector 混合召回和重排；未配置 embedding 模型时可使用本地哈希向量验证链路。
31. 行文页支持导演 AI 生成章节级写前定位，只做场景压力、连续性锚点和软边界统筹，不替角色做选择。
32. 行文页已升级为章节工作流：写前定位、角色上下文、扮演、审查、正文改写、写后回写会绑定同一个 `chapterWorkflow`，可分步执行，也可运行到正文草稿；Agent 指定 `workflowId` 时，扮演和改写都必须绑定目标工作流，不能跨章节串用最近轮次。
33. 每轮扮演会保存上下文审计摘要：导演、主要角色、次要角色群分别记录策略、触发世界书、结构化记忆、RAG 证据和预算，不再只把大包藏在 `memoryInjection` 里。
34. 每轮扮演完成后会进入审查链，用户也可以手动审查最新扮演或正文片段。
35. 支持单角色重跑：只替换指定主要角色在某一轮的输出，保留导演引导和其他角色记录，并刷新该角色上下文审计。
36. 策划 skill 已升级为严格档案管理员：每轮对话会区分候选提取、稳定写入、冲突、纠错、待确认内容和写入报告。
37. 策划 skill 现在支持受控 `skillOps`：可以在聊天中检索项目资料、写入长期记忆、写入世界书、编辑已有角色卡、标记档案条目和退役旧记忆；后端会白名单执行并在前端显示执行报告。
38. 策划 skill 已支持对独立世界书条目、记忆条目本体、正文草稿、档案条目做精确编辑；路径级编辑支持 `set`、`append`、`remove`。
39. 策划 skill 可检索脱敏提供商和模型配置，可切换 AI 槽位和给已有提供商添加模型名，但不能读取或写入完整 API key、baseUrl 或鉴权配置。
40. 已采纳正文和原始扮演记录不允许被策划 skill 直接覆盖；策划 skill 只能新建正文修订草稿、编辑未采纳草稿，或给扮演轮次追加审查注释。
41. 策划 skill 支持可审计删除独立世界书条目、角色/场景/线索档案条目；删除必须提供原因，并会留下记忆审计记录。
42. 策划 skill 执行器已加入 preflight：高风险操作会先复用 `evidenceSearchId` 对应检索结果，或由后端自动内部检索；目标不存在、目标不唯一或缺少证据时会拒绝执行。
43. 策划 AI 的定位更接近受限版 Codex / Claude Code / opencode：先检索上下文，再提交受控操作；但所有写入都受后端白名单、preflight 和审计报告约束。
44. 策划 AI 已支持可观察 Agent 运行：同一轮对话可持续执行“模型思考 -> skillOps 工具执行 -> observation 回传 -> 继续修正或收束”；后端只保留内部运行保护预算，预算耗尽会暂停并允许继续，不会伪装成完成。
45. 策划 Agent 运行现在有可控任务单元：运行中可终止；每轮开始前会保存回滚快照；完成后可“回退并编辑”上一条用户消息，或“回退后重发”。
46. 策划 Agent 已改为异步任务队列：同一本小说的策划运行会串行执行，并通过写入锁避免并发覆盖同一份小说状态。
47. 策划 Agent 运行历史会记录状态、阶段事件、诊断、checkpoint、任务计划、完成判定、上下文预算和自检结果；前端通过 SSE 接收实时运行事件，轮询只作为兜底。
48. AI 调用支持结构化错误分类、可重试错误自动重试、失败诊断回写运行记录；策划模型输出非 JSON 时会调用模型做结构修复重试。
49. 高风险 `skillOps` 已支持人工确认模式：模型可为操作标记 `requireHumanApproval`，后端会暂停运行并在前端显示批准 / 拒绝入口。
50. checkpoint 现在支持单步回退：运行记录中的 checkpoint 可以恢复到该步之前的档案、记忆、世界书、角色和行文状态。
51. 本地文件检索已变成策划 Agent 工具能力：每本小说都会在项目内自动创建固定 Agent 工作区，它等同 Codex 打开文件夹后的 workspace / cwd；用户也可以在抽屉中更换这个工作区。用户可以直接在策划输入里要求“从本地资料/旧稿/某文件里找”，Agent 会自动调用 `searchLocalFiles` 和 `readLocalFile`。
52. 策划线程已改为最近消息窗口 + 上滑静默加载历史：`/api/state` 默认只返回最近一页策划消息，前端滚动到顶部附近时调用分页接口补载更早对话并保持视口位置。
53. 压缩和运行审计不再长期占用独立对话框：已完成 run 的工具、token 和压缩状态归入对应 Agent 回复的折叠审计；运行状态块只服务于运行中、等待确认、失败无回复或保护暂停的继续入口。
54. 策划上下文新增 `planning.contextCompaction` 滚动摘要：达到上下文压力时，旧消息会被压成内部摘要，最近消息尾巴仍保留原文；压缩不会生成新聊天气泡，也不会自动写入档案、记忆或世界书。
55. 策划上下文预算改为 token 优先：后端使用 `js-tiktoken` 按模型族选择 `o200k_base` 或 `cl100k_base` 估算 prompt token，并保留字符数兼容字段；压缩触发、运行审计和前端展示都以 token 压力为主。
56. 大工具结果新增上下文资产引用：过大的搜索、读取和工具结果会落盘到 `data/context-assets/<novelId>/`，prompt 里只保留摘要与 `assetRef`；索引 JSON 只保存元数据和短预览，完整 payload 旁路保存为同目录 `.payload.json` / `.payload.txt`，策划 Agent 可用 `searchContextAssets` 定位旧证据，再用 `readContextAsset` 按引用读取原文片段。
57. `planning.contextCompaction` 现在记录版本号、source range、token 统计、资产引用、版本链和质量审查结果；每次压缩快照会作为上下文资产保存，前端可回到有快照的旧版本。这仍是工程化上下文治理层，不等于完整复刻 Codex 的内部实现。
58. 策划 Agent 的上下文预算开始使用模型上下文画像：可从模型名推断上下文窗口，也可在提供商 `modelProfiles` 或 AI 槽位 `contextWindowTokens` 中手动覆盖；运行审计会显示上下文窗口、prompt 预算、输出保留和预算来源。
59. 继续任务的历史证据调度不再只靠提示词提醒：每个 observation 会生成 `contextRecall`，包含资产引用、失败工具和建议检索词，下一轮 Agent 会先看到这份证据计划，再决定是否调用 `readContextAsset`。
60. Verifier Runner 支持确定性检查、工作区命令检查和多个模型审查器；外部命令 stdout/stderr 和模型 token 流都会通过 SSE 显示在运行过程里。它仍是项目级 verifier 链，不等同 Codex 内部不可见验证系统。
61. 策划写入规则已收紧：普通对话默认不写入；档案、记忆、世界书、角色卡、正文草稿和扮演注释必须由 Agent 判断确有必要后，通过 `archivePatch` 或显式 `skillOps` 执行。
62. “Agent 工作区与本地文件”抽屉负责查看或更换当前小说 Agent 工作区、维护额外资料文件夹和人工预览；工具调用结果会进入 Agent 运行步骤、消息审计和后续 observation，不再要求用户手动检索后复制给 AI。
63. 策划 Agent 的只读检索任务不会保存大回滚快照；checkpoint 会复用未变化业务状态的快照，避免世界书和记忆在多步检索时重复撑大数据文件。
64. `skillOps` 执行器已升级为后端原生工具注册表，当前工具目录通过 `/api/novels/:id/planning-tools` 暴露 `name`、输入 schema、权限需求、重试策略、展示策略、结果 schema 和原生 `tool_calls` 定义；模型优先走原生 tools/tool_choice，`skillOps` 只是兼容 fallback。
65. Agent 已支持全局权限模式：只读、自动编辑低风险、高风险询问、全自动；工具开关包括联网、shell、自定义工具和 MCP。
66. Agent 已具备通用文件工具 `searchFiles`、`listFiles`、`globFiles`、`grepFiles`、`indexLocalFiles`、`readFile`、`writeFile`、`previewPatchFile`、`applyPatch`、`patchFile`、`revertPatch`、`revertFilePatch`、`previewPatchSet`、`applyPatchSet`、`revertPatchSet`；工作区内直接按权限执行，工作区外只接受明确绝对路径，并会先进入人工确认。
67. Agent 工作区写入已增加路径 preflight：`writeFile`、`patchFile`、`runShell` 会先确认 path/cwd 是否在当前小说 workspace 内；外部绝对路径会在审批卡片里显示 `externalAccess` 摘要，批准后才继续。同名覆盖必须显式 `overwrite:true`，避免 Agent 无意覆盖旧稿。
68. `searchLocalFiles` 支持 `keyword`、`semantic`、`hybrid` 三种模式；当“Agent 设置 / 上下文检索配置”启用向量后，本地资料会写入 `data/local-file-indexes` 的按小说隔离向量索引，复用 OpenAI 兼容 embedding / 本地 hash embedding 和 rerank 设置。
69. `indexLocalFiles` 提供轻量结构化资料索引，可提取 Markdown 标题、JSON 顶层键、JS/TS/Python/PowerShell 函数类等符号；传入 `buildVector:true` 时会刷新当前小说本地资料向量索引。它不是完整 LSP server，但可作为 LSP 接入前的结构化索引层。
70. 工具失败会形成结构化错误分类和修复建议，分类包括 `schema_error`、`permission_required`、`file_not_found`、`conflict`、`ai_provider_error`、`verifier_failed` 和 `tool_error`；可修复失败会强制进入下一轮“诊断-修正”，不会只塞进 skipped 后直接结束。
71. 自定义工具已落地为后端白名单执行器，默认关闭；当前内置 `jsonSchemaValidate`、`markdownHeadingIndex`、`jsonShapeSummary` 三个只读工具，并按注册 schema 校验参数。MCP 已落地为 JSON-RPC 白名单桥，默认关闭且默认目录为空，只调用 `PLANNING_MCP_TOOLS_JSON` 显式注册的工具。
72. 每本小说创建时都会在项目内自动分配固定文件夹 `novels/<书名>-<小说id>/`，并作为该书默认 Agent 工作区；其中会自动生成 `roleplay-novel-project/` 投影目录，包含档案、角色卡、世界书、结构化记忆、扮演配置草案、后台 shell 作业审计、扮演轮次、正文片段和行文审查。该目录是后端权威数据的只读投影，供 Agent 像项目文件一样检索；直接手改文件暂不会自动同步回应用。
73. 结构化记忆写入已收紧：每条有效记忆必须有 `subject`、`field`、`value`、`visibility` 和 `evidence`。扮演原始输出保留在事件日志和检索层，不再默认写成 active 长期记忆。
74. 每本小说会保存自己的默认扮演配置；只有成功保存 / 应用后的配置会成为默认配置，生成草案本身不会刷新默认，默认配置会投影到 `roleplay-novel-project/planning/default-roleplay-config.json`。
75. 文件编辑已补上更接近 Codex 的审计链：`previewPatchFile` 只返回 unified diff 和 hash，不落盘；`applyPatch` / `patchFile` / `writeFile` 会保存 `data/patch-history/<novelId>/` 历史，返回 `patchId`、diff、beforeHash 和 afterHash；`revertPatch` / `revertFilePatch` 回滚前会检查当前文件 hash，发现冲突时拒绝覆盖后续修改。
76. Agent 权限策略已有后端执行和前端授权入口：可保存并执行目录规则、命令前缀规则、工具规则、session grant 和 persistent grant；规则支持 `allow`、`confirm`、`deny`，“Agent 设置”页已支持配置持久命令前缀授权，默认仍不开放工作区外读写和 shell。
77. `webSearch` 已支持 provider 配置、TTL 缓存、失败重试、来源可信度评分和 URL 引用字段；前端“Agent 设置”页可配置搜索提供商和缓存时间。
78. `archivePatch` 现在只是兼容输入，后端会转换成 `applyArchivePatch` 工具后再写入档案；“提取档案”旧接口也会走统一工具执行器和审计报告。
79. 新增小说资料诊断器 `inspectNovelDiagnostics`，用于检查角色年龄/称呼、世界书关键词遮蔽与覆盖冲突、记忆证据与事实冲突、档案主键缺失或重复、正文事实追踪、扮演轮次引用、扮演配置 schema、角色可见性泄漏、导演过控、世界书触发异常、正文写出后台信息和已采纳正文缺写后回写；它是只读工具，不会自动改资料。
80. 策划线程已有 branch/fork 基础：回到某条用户消息编辑后发送会创建新分支，旧线程保留；后端支持分支列表、切换和按分支分页消息，后续运行不会污染旧分支。
81. 策划线程版本图接口 `GET /planning-version-graph` 会把 branch、message、Agent run、run item、工具调用 / 写入 / 失败、checkpoint 和上下文压缩版本合并成可审计 DAG；`GET /planning-response-tree` 会在此基础上派生可聚焦 response tree 路径；`GET /planning-response-tree-diff` 支持任意两个可见节点摘要 diff；`POST /planning-response-tree-revert-node` 支持回滚带业务快照的 checkpoint / Agent 回复节点；分支合并会创建新的合并分支而不是静默覆盖任一旧分支。它仍不是 Codex 内部完整 response tree：暂不支持对任意无快照节点做业务回滚，也没有复杂图形化冲突合并器。
82. 当前没有 Codex 那种完整 OS sandbox；项目实现的是应用层 workspace/path/tool/command 权限。真正系统级沙箱仍需要受限用户、容器、Windows Job Object/AppContainer 或独立隔离进程。
83. `spawnSubAgent` 已固定为资料考据、世界书审查、角色一致性审查、正文风格审查和扮演记录整理五类 profile；session 会记录 profile、权限画像、允许工具和输出结构，默认不开放 shell、写入、web、MCP 或工作区外能力。
84. 章节链路也已进入统一工具注册表：策划 Agent 可通过 `generatePrewritePlan`、`runRoleplayTurn`、`reviewLatestTurn`、`adaptRoleplayToProse`、`postwriteProse`、`runChapterWorkflow` 主动推进具体行文，而不是只能等用户点击页面按钮；`runChapterWorkflow` 会复用扮演轮次已有审查，除非显式 `forceReview`，避免同一链路无意义重复审查。
85. 扮演运行时已补上标准 transcript：每轮记录导演输入、角色上下文包摘要、模型、输出、审查结果、采纳状态、重跑次数和重跑原因，工作区会投影 `session/transcripts.json` 与 `session/turns.md`。
86. 写前定位会生成角色运行时指令：每个角色有当前目标、可见事实、禁知信息、禁做动作和观察重点；角色上下文包会把这些指令作为独立层注入，避免角色 AI 看到全局大纲、幕后真相或其他角色内心。
87. 世界书更接近酒馆运行规则：条目支持主关键词、二级关键词、递归扫描、插入位置、优先级、token 预算、角色可见性、冷却轮次、互斥组、覆盖条目、过期时间和触发日志。
88. 正文 Agent 已从“扮演改写”升级为段落组慢写：先输出改写计划，再按段落组决定保留、合并、删减和换序，每组记录功能检、角色检、场景检、承接检和风格检。
89. 记忆系统新增分层：稳定事实、暂行判断、角色可见记忆、作者级记忆、运行审计记忆和扮演态记忆；写入仍要求证据、状态、可见性和结构化字段，不会把每轮对话自动总结进记忆。
90. 审查链固定为小说域审查 Agent 组合：角色一致性、世界书触发、导演过度控制、扮演输出、正文事实、正文风格和用户偏好吸收审查，并与原有模型审查合并。
91. 行文页新增 transcript、段落组改写、模型策略和改稿学习入口；模型策略报告会按策划、导演、角色、正文、审查、embedding / rerank 检查模型槽位和风险。
92. 用户改稿学习已进入候选、暂行、确认、废弃状态机：编辑正文会比较 AI 原稿和用户修改稿，抽取删改偏好；确认后才写入作者级记忆，避免一次改稿被永久硬写成规则。
93. Windows 下 `runShell` 和 `startShellJob` 已接入准 OS 沙箱：后端生成可审计 PowerShell wrapper，用 Job Object 约束进程树、活动进程数、内存、CPU hard cap 和 Job 关闭清理；持续交互式 shell 仍保持独立会话，不粗暴套一次性 wrapper。
94. 正文版本事件现在保存 `previousSnapshot` / `nextSnapshot`，长文本会转成 `previousAssetRef` / `nextAssetRef` 上下文资产；回滚优先读取快照或资产引用，不再依赖简化 diff 推断正文。
95. 小说质量门禁升级为验收链执行器：`quality-gate` 支持 `diagnose`、`preview_fix`、`apply_safe_fixes`，流程为诊断结构化 issue、生成修复预览、应用低风险修复、再运行 gate 复检；阻断项保留给 Agent 或人工确认。
96. Provider 兼容层已外置为 `server/provider-adapters/*.json` manifest，声明 endpoint、tools、stream、json schema、max context 和错误码映射；核心只加载注册表与别名，不继续为每个供应商堆 if。
97. RAG 质量评估新增小说域测试集：`rag-benchmark` 会检查世界书应触发 / 不应触发、角色可见性泄漏、记忆写入合同和改稿偏好吸收边界，并返回分数、指标和失败用例。
98. 上下文资产引用更彻底：长文件、长工具结果、长 shell 输出、质量门禁报告、诊断报告和压缩快照都会落盘为上下文资产；消息和 prompt 里保留摘要与 `assetRef`，Agent 后续用 `searchContextAssets` / `readContextAsset` 自动读取证据。
99. 前端进一步弱化后台配置感：主输入区和消息流仍是策划 Agent 的核心入口，Agent 设置、权限、RAG、verifier 等放入设置页或抽屉；行文页只展示必要状态、折叠工具过程、证据和验收结果。

## 核心任务表验收

| 编号 | 任务 | 完成状态 | 验收点 |
| --- | --- | --- | --- |
| T1 | 扮演运行时 | 已完成 | 角色上下文构建、角色可见性隔离、导演轻约束、单角色重跑、标准 transcript 均已接入后端和行文页。 |
| T2 | 写作闭环 | 已完成 | 策划 Agent 可通过统一工具推进写前定位、扮演、审查、正文改写、采纳后回写；章节工作流绑定 `workflowId`。 |
| T3 | 小说域诊断器 | 已完成 | `inspectNovelDiagnostics` 覆盖角色冲突、世界书关键词、记忆证据、扮演配置、后台信息泄漏、写后回写缺失等问题。 |
| T4 | 记忆系统分层 | 已完成 | 记忆项新增 `layer`，上下文包会按任务偏好召回不同层级，并在长期记忆页显示层级统计。 |
| T5 | 正文生成 Agent | 已完成 | 正文改写输出 `adaptationPlan`、`paragraphGroups` 和最终正文，并保存段落组自检。 |
| T6 | 世界书 / Lorebook 酒馆化 | 已完成 | 冷却、互斥、覆盖、过期、触发日志和角色可见性进入触发逻辑与编辑页。 |
| T7 | 固定评审链 | 已完成 | 扮演和正文审查包含固定 chain，不再只依赖一次普通模型审稿。 |
| T8 | 模型策略 | 已完成 | `/api/novels/:id/model-strategy` 和行文页模型策略面板会检查各 Agent 槽位、上下文和提供商风险。 |
| T9 | 用户改稿学习 | 已完成 | 编辑正文会生成改稿学习候选，采纳可升为暂行，确认后写入作者级偏好记忆。 |

## 工程验收任务表

| 编号 | 任务 | 完成状态 | 验收点 |
| --- | --- | --- | --- |
| E1 | Windows 准 OS 沙箱 | 已完成 | `runShell` / `startShellJob` 通过 Job Object wrapper 管进程树、CPU、内存和进程数；`test:e2e:runtime` 覆盖后台 shell 作业输出读取。 |
| E2 | 正文版本强快照 | 已完成 | 正文创建、用户编辑、采纳、废弃、回滚和正文 Agent 草稿事件都保存 previous / next 快照或资产引用；E2E 校验每个版本事件可回滚依据。 |
| E3 | 质量门禁验收链 | 已完成 | `/quality-gate` 支持诊断、修复预览、应用低风险修复和复检；行文页显示验收链与修复执行器结果。 |
| E4 | Provider 适配器外置 | 已完成 | `server/provider-adapters/` 存放 Chat Completions 与 Responses manifest，核心通过注册表和 alias 加载能力。 |
| E5 | 小说域 RAG 测试集 | 已完成 | `/rag-quality` 返回 benchmark，`/rag-benchmark` 可运行内置或显式测试用例，覆盖触发、隔离、记忆和改稿偏好边界。 |
| E6 | 上下文资产引用 | 已完成 | 大工具输出、长 shell 输出、诊断和质量报告落盘为资产；短 shell 输出保留 inline 预览，避免用户和 Agent 只能看到引用。 |
| E7 | 前端 Agent 体验收束 | 已完成 | 策划页保留主输入和消息流优先；行文页新增验收链、修复预览、低风险应用和 RAG 测试集入口，工具过程默认折叠。 |

验证命令：

```powershell
npm run build:web
npm test
npm run test:e2e:writing
npm run test:e2e:runtime
npm run test:e2e:agent
```

`npm test` 现在是默认冒烟套件，目标是 30 秒左右发现核心回归；完整 Agent、写作和运行时回归分别用 `npm run test:e2e:agent`、`npm run test:e2e:writing`、`npm run test:e2e:runtime`，全量才用 `npm run test:e2e:all`。

## 运行方式

项目依赖已写入 `package.json` 和 `package-lock.json`，首次运行或删除过 `node_modules/` 后需要执行 `npm install`。已安装依赖后，使用本机 Node.js 启动即可。

### 一键启动

Windows 下可以直接双击：

```text
一键启动.bat
```

如果当前服务已经运行，脚本会先关闭当前项目的旧后端实例，再在 `5177-5185` 之间选择可用端口，启动服务并打开浏览器。关闭逻辑会校验运行清单、端口和命令行，只处理本项目的工作台服务，不会直接结束所有 `node.exe`。

如果临时想复用已有服务而不是重启，可以手动运行：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -ReuseExisting
```

一键启动默认会让后端持续运行。关闭浏览器标签页不会关闭后端，需要在启动窗口按 `Ctrl+C` 或直接关闭启动窗口。

如果确实想启用“标签页全部关闭后自动退出”的实验行为，可以手动运行：

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -AutoShutdown
```

也提供一个英文文件名入口：

```text
start-workbench.bat
```

### 命令行启动

```powershell
npm start
```

启动后打开：

```text
http://127.0.0.1:5177
```

如果端口被占用，可以指定其他端口：

```powershell
$env:PORT=5180; npm start
```

## 快速验证

首次启动会在 `data/store.json` 创建本地数据，并内置一个“本地模拟提供商”。

最小验证流程：

1. 打开页面。
1. 新建一本小说。
1. 在策划 Agent 页输入小说灵感、任务目标，或直接粘贴设定文档、旧大纲、人物关系等长文本。
1. 让策划 Agent 在同一线程里检索资料、沉淀档案、更新记忆或准备扮演配置；这些是 Agent 工具能力，不再依赖顶部流程按钮。
1. 如需使用本地旧稿或资料文件，可以把资料放入当前小说自动生成的 Agent 工作区，也可以在“Agent 工作区与本地文件”抽屉更换工作区或添加额外资料文件夹；随后直接在策划输入里说“从本地资料里找……”，Agent 会自行检索和读取，抽屉里的关键词检索只是人工预览。
1. 在策划 Agent 的运行审计抽屉查看上下文包、工具审计和证据调度；扮演配置草案在“扮演配置”页查看和采纳，需要时可以在输入区快速切换策划模型。
1. 在扮演配置页采纳草案，或修改 JSON 后采纳。
1. 点击“采纳并启动扮演”，或进入行文页使用章节工作流：先生成写前定位，再启动扮演、审查、改写，也可以直接点“运行到正文草稿”。
1. 在行文页查看“上下文审计”，确认主要角色是否使用 `tavern_context`、触发了哪些世界书、注入了哪些长期记忆和检索证据。
1. 在“正文版本”里审阅草稿，点击“采纳”后才会进入稳定正文库；采纳会触发写后回写，从已采纳正文提取可持续影响后续创作的长期事实，并补写审查记录。
1. 进入“长期记忆”页清理旧版投影记忆、编辑稳定事实或让 AI 合并整理长期事实；这里不放 RAG 配置和上下文包。
1. 进入“世界书”页新增关键词条目；需要审计触发结果时，到策划 Agent 的“运行审计与上下文 / 上下文包”里选择导演、主要角色、次要角色群或改写 AI 生成预览，检查 `triggeredLore` 和 `promptSections`。

本地模拟提供商只用于验证项目链路，不代表真实模型写作质量。接入真实提供商后，可以在右侧“提供商”区域新增配置。

## 提供商配置

字段说明：

| 字段 | 说明 |
| --- | --- |
| 名称 | 自定义提供商名称 |
| baseUrl | OpenAI 兼容接口地址，例如 `https://api.openai.com/v1` |
| 接口类型 | `chat/completions` 或 `responses` |
| 模型查询路径 | 默认 `/models` |
| key | 本地保存，前端只显示脱敏结果 |

真实模型调用路径：

| 接口类型 | 调用路径 |
| --- | --- |
| `chat/completions` | `{baseUrl}/chat/completions` |
| `responses` | `{baseUrl}/responses` |

## 数据位置

本地数据保存在：

```text
data/store.json
```

删除该文件会清空所有小说、角色、提供商和扮演记录。重新启动后会生成新的初始数据。

## 文档

- [用户思路](./user_ideas.md)
- [详细设计](./docs/detailed_design.md)
- [前端详细设计](./docs/frontend_design.md)
- [实施计划](./docs/implementation_plan.md)
- [酒馆与角色卡研究](./docs/research.md)
- [skill 与插件设计](./docs/skill_plugin_design.md)
- [记忆与 RAG 设计](./docs/memory_rag_design.md)
- [下载与依赖记录](./docs/downloads.md)

## 当前限制

1. 当前向量库是本地文件型索引，适合单机创作工作台；超大项目后续可换 SQLite、LanceDB、Qdrant 等专用向量存储。
1. PNG 导入读取常见文本元数据块，不做图片像素识别；如果外部工具把角色卡写入非标准位置，需要先转成标准酒馆卡。
1. 世界书导入/导出支持常见 JSON 结构和本项目扩展字段，但不是完整复刻 SillyTavern 所有扩展选项。
1. 档案页的角色、场景、线索数组暂时使用 JSON 文本区编辑。
1. 扮演记录暂时不能在界面中逐条编辑；策划 skill 也不能改写原始扮演记录，只能追加审查注释或走单角色重跑。
1. API key、baseUrl 和鉴权配置不会开放给策划 skill 写入；这些仍应由用户在提供商配置区手动维护。
1. 真实提供商兼容已拆为内部适配器注册表，当前内置 OpenAI Chat Completions 和 Responses 兼容适配器；特殊厂商差异后续应新增适配器，不继续在核心请求里堆厂商分支。
1. 正文版本树已进入第一版，支持草稿、用户改稿、采纳稿、Agent 修订稿、分支稿的版本事件、diff、回滚入口和行文页展示；分支合并 UI 与更细粒度逐节点正文合并仍可继续增强。
1. 小说资料诊断器已能作为质量门禁运行，输出 passed / warning / blocked、阻断问题、修复建议和复检范围；自动修复仍需 Agent 按工具权限执行，不能静默改资料。
1. RAG 质量评估已覆盖世界书触发准确率、角色可见性泄漏率、记忆误写率和改稿偏好误吸收率；这些是小说域质量指标，不是通用向量召回 benchmark。
1. 前端实时步骤显示目前使用 SSE 运行事件流，轮询只作为兜底；策划模型 token 流、mock token 流、持续 shell stdout/stderr 和 verifier 命令输出已进入实时面板，但不同第三方提供商的流式事件格式仍可能需要继续适配。
1. 自定义工具已有白名单执行器，MCP 已有 JSON-RPC 白名单桥；二者默认关闭，且还不是完整外部 MCP 工具生态或插件市场。
1. Shell 能力已有一次性命令、持续 shell 会话、后台 shell 作业、stdout/stderr SSE 输出、命令分段审计、每段状态 / 退出码 / 耗时 / 输出记录、作业列表 / 读取 / 停止、文件化作业审计、会话停止和取消清理，“Agent 设置”页可配置持久命令前缀授权；但仍是应用层权限控制，不是 OS 级隔离或完整终端复刻，PTY 兼容和交互式 TUI 还需要后续引入原生 PTY 能力。
1. 当前 patch 系统支持单文件和多文件补丁预览、应用、历史和回滚；更成熟的冲突定位 UI、patch preview 审批流和批量 revert 体验还需要继续扩展。
