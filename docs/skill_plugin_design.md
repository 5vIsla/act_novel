# skill 与插件设计

## 1. 结论

本项目不应该把 Codex 的 `SKILL.md` 或 `webnovel-writer` 的插件目录原样塞进对话窗口。

更合理的做法是把它们转成三层：

1. **应用内 skill 包**：项目运行时真正使用，负责提示词、工作流、档案合同、角色卡映射和配置生成。
2. **可选 Codex skill**：给 Codex 或其他编码 Agent 使用，负责维护这个项目、写作项目文档或生成小说素材。
3. **可选插件包**：当需要把多个 skill、脚本、模板和界面能力打包分发时再做。

当前已落地第一层，位置是：

```text
server/skillpacks/novel-planning.js
```

## 2. 为什么不直接复制参考项目

`E:\novel\my-novel-skill` 的价值在于：

1. 稳定档案和漂移档案分层。
2. 人物档案不写空标签，而写反应模型、说话方式、禁区行为和阶段变化。
3. 资料导入不是搬运原文，而是分类、筛选、沉淀能影响正文的稳定事实。
4. 写章前先形成执行约束，再进入正文。

`E:\novel\webnovel-writer` 的价值在于：

1. skill 有明确入口、目标、阻断条件和运行顺序。
2. 插件有 manifest，能把多个 skill、脚本、模板和数据链打包。
3. 运行态 state 是合同，不是临时聊天记录。
4. 写作链按“上下文、起草、审查、润色、提交、记忆”分阶段推进。

“酒馆”的价值在于：

1. 角色卡把角色稳定输入拆成名称、描述、性格、场景、首条消息、示例对话、系统提示、历史后置指令、标签和世界书。
2. 世界书用于条件性注入背景，不应该把整本世界观塞进每个角色卡。
3. 群聊/多角色不是让所有人乱说话，而是要有角色边界、历史上下文和发言调度。

所以本项目采用“策划 skill 包 + 角色卡映射 + 多 AI 编排”，而不是复制某个产品形态。

同时，策划 AI 的交互形态更接近 Codex、Claude Code、opencode 这类智能操作工具：它不是只聊天，而是要读取上下文、检索证据、形成计划，再提交受控操作，并在同一轮内读取工具 observation 后继续修正或收束。区别在于，本项目策划 AI 不是无边界系统代理；所有高风险写入都必须经过后端白名单和 preflight。

## 3. 应用内 skill 包结构

当前 skill 包包含：

```text
novel-planning.js
├─ NOVEL_PLANNING_SKILL
├─ buildPlanningSystemPrompt()
├─ buildArchiveExtractionSystemPrompt()
├─ buildRoleplayConfigSystemPrompt()
├─ buildSkillRuntimeContext()
├─ normalizeCardLikeInput()
└─ toTavernCardV2()
```

职责划分：

| 模块 | 职责 |
| --- | --- |
| `NOVEL_PLANNING_SKILL` | manifest，记录名称、版本、工作流、参考来源和合同 |
| `buildPlanningSystemPrompt` | 把 AI 策划固定成“对话理解 + 素材分类 + 候选提取 + 冲突校验 + 严格写入 + 最小追问” |
| `buildArchiveExtractionSystemPrompt` | 从对话中重新整理稳定档案，并输出写入诊断、冲突和纠错 |
| `buildRoleplayConfigSystemPrompt` | 把档案转成导演、角色、次要角色群、改写器配置 |
| `buildSkillRuntimeContext` | 每次调用时传入当前项目压力点和档案完整性自检，帮助 AI 判断下一步 |
| `normalizeCardLikeInput` | 接收普通角色卡或酒馆 V2 字段并归一化 |
| `toTavernCardV2` | 将本项目角色卡映射为酒馆 V2 兼容结构 |

当前策划 skill 的关键不是“能提取字段”，而是强制区分：

1. `archivePatch`：只写稳定、可入库的资料。
2. `archiveDiagnostics.extracted`：本轮提取出的候选事实。
3. `archiveDiagnostics.writeDecisions`：哪些内容写入、哪些不写入、为什么。
4. `archiveDiagnostics.conflicts`：新输入与旧档案或记忆冲突但不能裁决的内容。
5. `archiveDiagnostics.corrections`：用户已明确纠正、可以修正旧档案的内容。
6. `archiveDiagnostics.tentative`：有价值但不能入库的备选或推测。
7. `archiveDiagnostics.missing`：继续策划前最阻塞的缺口。

后端会对 `archivePatch` 再做一次写入准备：空值不能覆盖旧档案；角色、场景、线索必须有稳定主键；每条数组档案默认补 `status` 和 `confidence`，并返回 `writeReport` 供前端展示。

### 3.1 受控写入、编辑和检索

策划 skill 现在不仅能输出 `archivePatch`，还可以调用后端原生工具协议。优先路径是模型原生 `tools/tool_choice`；`skillOps` 只作为旧模型和 JSON 输出的 fallback。无论来自原生 tool call、`skillOps`，还是旧 `archivePatch` 兼容字段，后端都会统一进入工具注册表执行，不让模型直接操作数据库。

当前支持的操作：

| 类型 | 作用 | 边界 |
| --- | --- | --- |
| `search` | 检索档案、记忆、世界书、角色卡、策划对话、扮演记录和正文证据 | 只读，返回证据片段，不改数据 |
| `inspectNovelDiagnostics` | 运行小说资料诊断器 | 只读，检查角色年龄/称呼、世界书关键词与覆盖、记忆证据、档案、正文事实和扮演配置引用一致性，不自动修复 |
| `applyArchivePatch` | 写入项目级稳定档案 | 旧 `archivePatch` 会被转换为这个工具，统一走 schema、权限、审计和 writeReport |
| `searchFiles` | 标准文件检索别名 | 指向 `searchLocalFiles` 的同一执行器，便于原生工具模型理解 |
| `searchLocalFiles` | 检索当前小说 Agent 工作区和额外资料文件夹 | 默认从 `defaultAgentFolder` 开始，它等同 Codex 的 workspace / cwd；不能扫磁盘根目录 |
| `readLocalFile` | 读取 Agent 工作区或额外资料文件夹中的单个文本文件片段 | 工作区外绝对文本文件必须先人工确认，单文件读取受 1MB 限制 |
| `listFiles` / `globFiles` / `grepFiles` / `indexLocalFiles` / `readFile` | 通用只读文件系统工具 | 默认访问当前小说 Agent 工作区和额外资料文件夹；工作区外绝对路径必须先人工确认 |
| `writeFile` / `previewPatchFile` / `patchFile` / `revertFilePatch` | 通用文本写入、补丁预览、补丁应用和补丁回滚工具 | 默认写入当前小说 Agent 工作区；工作区外绝对文本路径必须先人工确认；预览只返回 diff，不落盘；应用和写入会保存 patch 历史，回滚会检查 hash 冲突 |
| `applyPatch` / `revertPatch` | 标准补丁工具别名 | 指向 `patchFile` / `revertFilePatch` 的同一执行器，保留 diff、patchId 和回滚审计 |
| `webSearch` / `webFetch` | 联网搜索和网页读取 | 受 Agent 工具开关控制；搜索支持 provider、缓存、失败重试、来源可信度和 URL 引用字段，结果只能作为证据，不会直接写入项目 |
| `runShell` | 在 Agent 工作区内执行受控 shell 命令 | 默认关闭；外部绝对 cwd 必须先人工确认；即使开启也有危险命令和密钥探测拦截 |
| `spawnSubAgent` | 启动固定类型只读小说域子 Agent | `profile` 只能是 `research`、`lorebook_review`、`character_consistency`、`prose_style_review`、`roleplay_log_cleanup`；子 Agent 不获得额外文件、shell、web、MCP 或写入权限 |
| `customTool` | 调用后端白名单自定义工具 | 默认关闭；当前内置 `jsonSchemaValidate`、`markdownHeadingIndex`、`jsonShapeSummary` 三个只读工具，参数会按注册 schema 校验，不执行任意代码 |
| `mcpTool` | 调用后端白名单 MCP JSON-RPC 工具 | 默认关闭；只允许 `PLANNING_MCP_TOOLS_JSON` 显式注册的 server/name/endpoint/method，默认目录为空，不向小说策划 Agent 开放任意外部 MCP |
| `upsertMemory` | 写入或更新长期记忆 | 必须有 `subject`、`field`、`value` |
| `patchMemory` | 精确编辑某条记忆本体 | 只能改记忆白名单字段，不物理删除 |
| `upsertLorebook` | 写入或更新独立世界书条目 | 必须有 `name` 和 `content`，不替代世界书编辑器 |
| `patchLorebook` | 精确编辑独立世界书条目 | 只能改条目白名单字段，不触碰角色卡 |
| `deleteLorebook` | 删除独立世界书条目 | 必须有 `reason`，会留下审计记忆 |
| `updateCharacterCard` | 更新已有角色卡的可编辑字段 | 必须通过角色 id 或精确名称命中，不能新建角色 |
| `markArchiveRecord` | 给角色、场景或线索档案补状态和少量字段 | 只能操作已有条目，不能静默删除 |
| `patchArchiveRecord` | 对角色、场景或线索档案做路径级编辑 | 支持 `set`、`append`、`remove`，路径深度受限 |
| `deleteArchiveRecord` | 删除角色、场景或线索档案条目 | 必须有 `reason`，不删除角色卡 |
| `retireMemory` | 把旧记忆标记为 `outdated` 或 `contradicted` | 不物理删除，保留审计链 |
| `upsertProseDraft` | 基于正文或扮演记录创建修订草稿 | 不覆盖已采纳正文 |
| `patchProseDraft` | 编辑尚未采纳的正文草稿 | 已采纳正文必须另建修订草稿 |
| `annotateTurn` | 给扮演轮次追加审查或注释 | 不改原始扮演记录 |
| `updateAiSlot` | 切换策划、导演、次要角色群或改写器槽位 | 只能使用已有 providerId/model，不写 key |
| `addProviderModel` | 给已有提供商添加模型名 | 不写 API key、baseUrl 或 endpoint |
| `generateRoleplayConfigDraft` | 生成扮演配置草案 | 由策划 Agent 主动调用，不依赖前端单独按钮 |

这些能力解决的是“AI 策划对话中自然维护资料”的问题，但仍然保持边界：

1. 提供商和模型可以脱敏检索；AI 可切换槽位或添加模型名，但不能读取或写入完整 API key、baseUrl、接口类型和鉴权配置。
2. 已采纳正文不能被直接覆盖；只能新建修订草稿。未采纳草稿可以由 skill 编辑或废弃。
3. 原始扮演记录不能被直接改写；只能追加审查注释，或通过行文页的单角色重跑产生替换输出。
4. 记忆条目不做物理删除；可精确编辑、更新或退役为 `outdated/contradicted`。
5. 删除能力只开放给独立世界书条目和角色/场景/线索档案条目，并且必须带原因。

本地文件能力属于策划 Agent 的工具，不是用户手动检索流程。每本小说都会在项目内自动创建固定 Agent 工作区，它相当于 Codex 打开的文件夹，是 Agent 默认环境 / workspace / cwd；用户可以在抽屉中更换工作区，额外资料文件夹只作为补充检索来源。当任务提到本地资料、旧稿、文件夹或某个文件时，策划 Agent 应先输出 `searchLocalFiles`，命中文件后再用 `readLocalFile` 读取必要片段。若用户明确给出工作区外绝对路径，通用文件工具会生成 `externalAccess` 审批摘要，批准后才继续执行。读取结果会作为 observation 回到下一步，随后 Agent 再决定是否沉淀为档案、记忆、世界书或扮演配置。

当前 `searchLocalFiles` 已支持 `keyword`、`semantic`、`hybrid` 三种检索模式。“Agent 设置 / 上下文检索配置”启用向量后，Agent 本地资料检索会使用 `data/local-file-indexes` 下按小说隔离的本地向量索引；embedding 复用 OpenAI 兼容 `/embeddings` 配置，未配置时使用本地 hash embedding 兜底，排序会继续经过本地或 AI rerank，不再简单按文件更新时间覆盖相关性。

当前 `indexLocalFiles` 是轻量结构化资料索引，不是完整 LSP server。它能提取 Markdown 标题、JSON 顶层键、JS/TS/Python/PowerShell 的函数和类等符号，用于让 Agent 先看项目结构再决定后续 `grepFiles` 或 `readFile`。当参数带 `buildVector:true` 时，它也会刷新当前小说的本地资料向量索引。如果后续要真正接入 LSP，需要在这个工具之上增加语言服务器进程、诊断缓存和符号跳转协议。

工作区写入和命令执行必须走更严格的链路：`writeFile`、`previewPatchFile`、`patchFile`、`revertFilePatch`、`runShell` 的 preflight 会解析当前小说 Agent 工作区；目标路径或 cwd 位于工作区外时，必须是明确绝对路径，并进入人工确认。`writeFile` 不允许静默覆盖已有文件；必须先 `readFile` 确认内容并显式 `overwrite:true`，否则后端会要求 Agent 修正工具参数。局部文本修改建议先 `previewPatchFile` 查看 diff，再 `patchFile` 应用；`patchFile` 和 `writeFile` 返回的 `patchId` 可交给 `revertFilePatch` 回滚，回滚前会校验当前文件 hash，避免覆盖后续手工修改。

后端已把 `skillOps` 升级成注册式工具表。`/api/novels/:id/planning-tools` 会返回每个工具的 `name`、风险等级、分类、开关状态、简化 input schema、严格 JSON schema、权限元数据 `permission`、重试策略 `retry`、展示策略 `display`、结果合同 `resultSchema` 和原生 `tool_calls` function 定义。模型既可以使用原生工具调用，也可以继续输出 JSON `skillOps`；后端会统一归一化、校验 schema、执行权限策略，再进入工具执行器。自定义工具和 MCP 工具也必须通过这个入口，不能绕过 Agent 工具层直接执行。

`/planning-tools` 也会返回固定子 Agent profile。策划 Agent 如果需要拆分任务，只能通过 `spawnSubAgent` 选择这些 profile，而不是临时发明一个拥有未知权限的子程序。当前固定类型是资料考据、世界书审查、角色一致性审查、正文风格审查和扮演记录整理，全部属于 `read_only_novel_domain` 权限画像。

工具失败也不再只是 skipped 文本。执行器会分类为 `schema_error`、`permission_required`、`file_not_found`、`conflict`、`ai_provider_error`、`verifier_failed` 或 `tool_error`，并给出 action：修参数、先检索、读证据、请求确认、换模型或说明阻塞。只要存在可修正失败，Agent 不会被允许直接标成完成。

工具执行还会写入线程版本节点。`tool_call`、`tool_read`、`tool_write` 和 `tool_error` 会挂到当前 message/run 下面，`GET /planning-version-graph` 会再合并 branch、message、run item、checkpoint 和 context compaction version，形成可审计 DAG。`GET /planning-response-tree` 会派生可聚焦路径，`GET /planning-response-tree-diff` 可对比两个节点摘要，`POST /planning-response-tree-revert-node` 可回滚带快照的 checkpoint / Agent 回复节点；分支合并采用创建新 merge branch 的方式，避免旧分支被静默覆盖。

权限策略分为全局模式和细粒度规则两层。全局模式负责只读、低风险自动编辑、高风险询问和全自动；细粒度规则负责目录、命令前缀、工具、session grant 和 persistent grant。规则支持 `allow`、`confirm`、`deny`，拒绝优先级最高。外部路径默认仍需要人工确认，只有目录规则或 grant 明确允许时才会跳过确认。

后台 shell 作业也必须经过同一套工具注册表和权限策略。`startShellJob` 会把元数据和 stdout/stderr 日志写入当前小说工作区的 `roleplay-novel-project/planning/shell-jobs/`，`listShellJobs` / `readShellJob` / `stopShellJob` 会优先恢复这些审计记录；这只是受控后台命令管理，不等于 PTY 或交互式 TUI 终端。

### 3.2 preflight 执行前检查

`skillOps` 执行器会对高风险操作做执行前检查。AI 可以先输出 `search`，再把匹配结果 id 填入后续操作的 `evidenceSearchId`；如果 AI 没有提供，后端会自动做一次内部检索。

当前高风险操作包括：

```text
patchMemory
patchLorebook
deleteLorebook
updateCharacterCard
markArchiveRecord
patchArchiveRecord
deleteArchiveRecord
retireMemory
patchProseDraft
annotateTurn
updateAiSlot
writeFile
previewPatchFile
patchFile
revertFilePatch
runShell
customTool
mcpTool
```

preflight 是后端执行器的证据检查，不是给用户手动点击的流程按钮。前端应把它展示成“检索上下文 / 工具审计 / 证据检查”，避免用户误解为额外步骤。

preflight 会检查：

1. 目标是否能在对应范围内检索到。
2. 目标是否唯一，避免同名或近似条目被误改。
3. 删除、退役和路径编辑是否有明确目标。
4. 提供商和模型操作是否只触碰脱敏配置，不接触 API key。
5. 前端会显示对应的检索证据和工具审计，便于用户审计 AI 到底基于什么证据执行。

### 3.3 可观察 Agent 运行

策划聊天现在不是单次模型调用，而是可观察的 Agent 运行：

```text
用户输入
-> 策划 AI 输出 reply/archivePatch/skillOps/stopReason
-> 后端执行 skillOps 和 preflight
-> 后端把 observation 回传给策划 AI
-> 策划 AI 继续检索、修正、编辑或输出 final
```

运行不会把低步数当作产品流程。后端只保留内部保护预算，默认 `PLANNING_AGENT_STEP_BUDGET=50`，可在本地环境变量中调整，硬上限 200。这个预算只用于防止失控消耗、模型空转或服务被长任务拖死；达到预算时运行状态变为 `paused`，前端显示“可继续此任务”，不会把它标记成已完成。

每个运行片段都要求模型输出 `stopReason`：

| stopReason | 含义 |
| --- | --- |
| `continue` | 本步执行了工具，下一步应读取 observation 继续 |
| `need_more_tools` | 还需要继续检索或修正工具操作 |
| `final` | 本轮任务已完成，可以给用户最终回复 |
| `blocked` | 目标不清、风险过高或证据不足，应停止并说明 |

前端会显示折叠的“运行轨迹”，包含阶段回复、工具请求、执行结果、证据检查结果和阶段档案写入。默认只展示事件数、工具数、模型调用数和最新状态，避免把内部运行片段变成用户必须理解的固定流程。

### 3.3.1 任务图、完成判定和恢复队列

策划 Agent 现在不只输出线性 `taskPlan`，复杂任务还要输出 `taskGraph`。任务图节点包含：

| 字段 | 说明 |
| --- | --- |
| `id` | 节点 id，用于依赖和回溯 |
| `title` | 节点目标 |
| `status` | `pending`、`in_progress`、`completed`、`blocked` 或 `skipped` |
| `dependsOn` | 依赖节点 |
| `toolTypes` | 节点预计或已经使用的工具类型 |
| `evidenceIds` | 检索、文件、世界书、记忆或 patch 证据 id |
| `verifier` | 节点完成条件 |

后端会把模型输出的 `taskGraph` 和 `completionCheck` 归一化为运行记录中的 `taskGraph` 与 `completionVerifier`。如果模型声明 `final`，但任务图存在明确 blocked 节点、模型自己的完成检查失败，或者还有高严重度未闭合项，后端完成判定器会阻止该运行被标成已完成，改为 blocked，并生成可恢复入口。

完成判定现在分两层：

1. **确定性 verifier**：后端检查任务图、完成标准、工具失败、阻断节点和模型自检，不依赖第二次模型调用。
2. **模型审查 verifier**：当本轮存在任务图、完成标准、写入操作或工具失败时，后端会启动独立 verifier 模型回合，只审查本次 run 是否真的完成、是否越界写入、是否遗漏工具修正。它不能发起写入或工具调用，只能返回 `passed / warning / failed`、未闭合节点和建议动作。前端提供“审查 AI”槽位；配置后 verifier 使用该独立模型，未配置时才回退到策划模型。

这两层现在由 `verifierRunner` 统一编排。Runner 是独立于策划模型工具循环的后端完成检查链，结果写入 run 的 `verifierChain`：

1. `deterministic`：必选的后端确定性检查，除非在配置中显式关闭。
2. `command`：可选外部命令检查，用于运行项目脚本、资料一致性检查、导出校验等；命令只允许在当前小说 Agent 工作区内运行，且必须先开启 Shell 能力。
3. `model_review`：可选审查模型检查，使用“审查 AI”槽位或回退策划模型。

`verifierRunner.commandSteps` 支持数组配置，每项包含 `id`、`label`、`command`、`cwd`、`when`、`required`、`timeoutMs`、`expectedExitCodes`。`when` 可取 `always`、`final`、`writes`、`tools`、`failure`。如果 required 命令失败，最终完成判定会变成 failed，并阻止 run 被标记为完成。

恢复系统分两层：

1. **运行队列**：同一本小说的策划 Agent 运行串行执行，避免并发写入档案、世界书、记忆和本地文件。
2. **恢复队列**：运行达到内部保护预算、服务重启留下陈旧 running 状态、审批恢复丢失、可重试失败或完成判定阻断时，后端会写入 `planning.resumeQueue`，并给原 run 标记 `resumeState`。前端“继续此任务”会调用恢复接口，由后端生成续跑 prompt，而不是让前端拼一个普通聊天消息。

这套队列不是无限自动重跑。AI 调用本身已有自动重试；对会继续消耗模型费用或涉及写入的恢复，系统默认登记可恢复任务，让用户在同一线程里继续。对于 `provider.transient`、`provider.rate_limited`、`provider.retry_exhausted`、`model.invalid_json` 这类可重试且已经回滚的失败，后端会按 `PLANNING_AUTO_RESUME_MAX_ATTEMPTS` 做有限自动恢复，默认最多 1 次。这样保留 Codex/opencode 式的运行恢复能力，同时避免后台静默烧钱或反复改资料。

相关环境变量：

| 变量 | 含义 |
| --- | --- |
| `PLANNING_EXTERNAL_VERIFIER=0` | 关闭模型审查 verifier，只保留确定性完成判定 |
| `PLANNING_AUTO_RESUME=0` | 关闭后台有限自动恢复，只保留人工继续入口 |
| `PLANNING_AUTO_RESUME_MAX_ATTEMPTS` | 每个安全失败恢复 ticket 的最大自动续跑次数，默认 1，最大 3 |
| `PLANNING_AUTO_RESUME_DELAY_MS` | 安全失败后自动续跑的延迟，默认 12000ms |

### 3.4 上下文压缩逻辑

当前后端已有一层 token 优先的预算压缩：

```text
完整策划上下文用 js-tiktoken 按模型族估算 token
-> 超过 PLANNING_CONTEXT_BUDGET_TOKENS 或兼容字符预算
-> 压缩较早策划消息为 planning.contextCompaction
-> 压缩 project 和 contextPack
-> 大工具结果落盘为 data/context-assets/<novelId>/ 下的上下文资产
-> Agent 可用 searchContextAssets 定位旧证据，再用 readContextAsset 读取原文
-> prompt 只保留摘要、assetRef、最近策划消息、近期扮演轮次、少量正文和高优先记忆
```

这层压缩本质是输入预算保护，不是前端对话消息。它的触发条件是本轮准备送入模型的 JSON 上下文接近 token 预算，或未摘要旧消息压力过大；压缩方式包括滚动摘要、裁剪 project / contextPack、缩短工具 observation，并把大工具结果转成可追踪 `assetRef`。上下文资产采用“索引 JSON + payload 文件”结构：索引只保存 id、来源、hash、token、短预览和 payloadRef，完整输出保存为旁路 `.payload.json` / `.payload.txt`；搜索优先扫索引，必要时才读 payload 命中片段。Agent 后续需要原文时应先用 `searchContextAssets` 定位旧证据，再调用 `readContextAsset`，而不是让用户复制历史输出。

更接近 Codex/opencode 的目标形态应继续演进为：

1. 最近消息尾巴原文保留。
2. 更早对话由 Agent 生成可更新摘要，摘要记录用户目标、已确认事实、未决问题、工具结果引用和风险。
3. 大型工具输出只保留摘要、命中片段和 `assetRef`，原文落在上下文资产、项目资料、记忆、世界书或运行审计中。
4. 旧内容优先沉淀到档案、结构化记忆和世界书，下一轮通过 RAG / 触发规则召回，而不是把整段历史继续塞进 prompt。
5. 压缩失败或摘要不确定时才需要用户介入；正常压缩只进入折叠审计，不占用独立对话框。

当前已落地的压缩状态保存到 `planning.contextCompaction`。它是一份内部滚动摘要，不会作为新的聊天消息显示，也不会自动写入档案、记忆或世界书。压缩记录包含 `version`、`sourceRange`、`tokenStats`、`assetRefs`、`versionChain` 和 `qualityReview`；每次压缩快照也会落盘为 `context_compaction` 资产，前端可回到有快照的旧版本。压缩后模型仍会收到最近消息原文，旧消息通过 `conversationCompaction` 进入上下文，大型工具结果通过 `searchContextAssets` / `readContextAsset` 按需读取。它仍是工程化上下文治理层，不应宣称与 Codex 内部机制完全一致。

### 3.5 模型上下文画像与继续任务召回

策划 Agent 的上下文预算不再只使用固定常量。后端会按优先级解析：

1. AI 槽位上的 `contextWindowTokens`。
2. 提供商 `modelProfiles[model].contextWindowTokens`。
3. 模型名推断，例如 200k、128k、32k 等常见窗口。
4. 默认兜底窗口。

预算记录会写入 `contextWindowTokens`、`promptBudgetTokens`、`responseReserveTokens` 和 `tokenBudgetSource`。这仍不是模型服务商原生 context API，只是本地预算画像；未知模型需要用户或提供商配置显式覆盖。

每个 Agent observation 会生成 `contextRecall`：包含本轮产生的 `assetRefs`、失败工具、建议检索词和继续任务说明。下一轮 Agent 会把这份召回计划作为运行状态的一部分读取，优先 `readContextAsset` 补证，而不是要求用户重新粘贴历史输出。这是项目级历史证据调度，不等同 Codex 内部不可见历史调度。

### 3.6 Verifier Runner 集群

Verifier Runner 链路由三类检查组成：

1. 确定性检查：任务图、完成标准、工具失败、阻断状态。
2. 外部命令检查：只允许在当前小说 Agent 工作区中运行，stdout/stderr 通过 SSE 进入前端实时面板。
3. 模型审查器：可配置多个 `modelReviewers`，也可回退到 verifier 槽位或 planner 槽位。每个模型审查器独立输出 `status/summary/openIssues`，最终合并为完成判定。

该机制适合做世界书审查、风格审查、角色一致性审查等项目级 verifier；不应该被理解为后台无限自动重跑系统，恢复队列仍需要受控触发。

### 3.5 写入不是默认动作

策划 Agent 每轮都要能回复，但不是每轮都要写入。当前写入边界调整为：

1. 普通聊天、解释、发散、追问、未确认灵感：`archivePatch` 为空，`skillOps` 通常为空。
2. 档案写入：只有存在稳定且必要的设定、角色、场景、线索或写法原则时，才使用 `archivePatch` 或档案类 `skillOps`。
3. 记忆和世界书写入：只能通过 `upsertMemory`、`patchMemory`、`upsertLorebook`、`patchLorebook` 等显式工具完成，不再因为一次普通策划回复自动投影。
4. 角色卡、正文草稿、扮演记录注释同样必须由对应工具显式操作。
5. 档案、记忆、世界书仍会进入 RAG 检索源，但这是读取和召回，不等于每轮对话都新增资料。

### 3.5.1 意图路由和写入边界

策划 skill 已加入输入意图路由，不再只靠“普通聊天模型自己悟”。后端的 `agentState.decisionHints` 现在只提供输入结构信号、上下文状态和工具能力清单，例如长文本、路径、文件名、URL、压缩资产是否存在、工作区是否可用；它不再用一组业务关键词替模型判定“本轮属于什么任务”。

这些信号不替代模型判断，但会强制模型在 `toolUseDecision` 中说明：

1. 本轮该不该调用工具。
2. 调用哪些工具，为什么。
3. 不调用工具或不写入的原因。
4. 如果写入，应该写到 archive、memory、lorebook、character card、prose draft 还是 project file。

写入边界如下：

| 目标 | 应写内容 | 不应写内容 |
| --- | --- | --- |
| `archivePatch` | 项目级稳定档案：核心命题、世界背景、大纲、风格、角色档案、场景档案、线索档案 | 普通回复摘要、未确认脑洞、整段资料搬运 |
| `upsertMemory` | 会影响后续 Agent 行为的结构化长期事实：用户稳定意图、世界规则、角色状态变化、关系变化、时间线节点、开放伏笔、场景事实、写法偏好、从已采纳正文中提取出的坐实事实 | 临时想法、全文摘要、草稿正文、模型猜测、角色不可见幕后信息、已废弃设定、角色/场景/线索档案整块文本、工具报告、测试输出、已采纳正文原文 |
| `upsertLorebook` | 需要关键词触发的世界规则、组织、地点、术语、角色私有可见设定 | 短期剧情状态、普通背景总结、角色永久人格 |
| `updateCharacterCard` | 角色永久扮演输入：身份、人格、反应模型、语气、场景、示例对话、系统提示 | 当前阶段临时状态、刚发生事件、未来真相 |
| `upsertProseDraft` / `patchProseDraft` | 未采纳正文草稿和修订版本 | 已采纳正文直接覆盖、原始扮演记录改写 |
| `writeFile` / `patchFile` / `applyPatchSet` | 当前小说 Agent 工作区内的 UTF-8 项目文件、脚本、导出资料 | 业务档案的首选写入通道、API key/baseUrl |

记忆和世界书现在有后端写入约束：`upsertMemory` 必须有 `subject`、`field`、`value`、`visibility` 和 `evidence`，且 active 记忆不能用 `draft_evidence` 当兜底分类；单条记忆过长会被拒绝，避免把长文档摘要塞进长期记忆。记忆写入还会拒绝 `archive`、`scene`、`clue` 这类整块档案字段；AI 来源的 active 记忆会额外拦截明显占位主体、待确认占位语、JSON/YAML 和工具输出块，但不再维护固定样板文本黑名单。`upsertLorebook` 必须有 `name`、`content`，非 always 条目还必须有 `keys`，单条内容过长会被拒绝，要求拆条或放入 RAG 资料层。

策划 Agent 的分层判断必须先做，而不是写完再补救：

1. 能作为项目总设定稳定存在的，写 `archivePatch`。
2. 需要关键词触发、类似 SillyTavern World Info 的，写 `upsertLorebook`。
3. 会在后续阶段持续改变 Agent 行为，但不是完整档案的单条事实，写 `upsertMemory`。
4. 原文、长资料、检索证据和工具输出，写本地资料、上下文资产或 RAG 证据层，不写长期记忆。
5. 运行审计、verifier、shell、patch 结果只进审计和历史，不进记忆。

### 3.6 Agent 运行控制

策划聊天现在把一次用户发送视为一个可控 Agent run：

```text
用户发送
-> 前端生成 runId
-> 后端注册运行和 AbortController
-> 后端在写入前保存回滚快照
-> 用户可终止正在运行的 Agent
-> 完成后用户可回退快照，并编辑或重发原消息
```

回退不是简单删除聊天消息，而是恢复本轮开始前的关键项目状态：档案、策划消息、记忆、世界书、角色卡、AI 槽位和行文会话。快照不会暴露给前端，前端只拿到 `canRollback` 标记和回退后返回的原用户消息。

## 4. 如果写成 Codex skill

适用场景：

1. 让 Codex 专门维护这个项目。
2. 让 Codex 根据用户小说素材生成档案、角色卡、扮演配置或章节定位。
3. 让 Codex 在文件系统里处理长篇项目资料。

建议目录：

```text
roleplay-novel-planner/
├── SKILL.md
├── references/
│   ├── archive-contract.md
│   ├── character-card.md
│   ├── roleplay-orchestration.md
│   └── writing-adapter.md
└── scripts/
    └── validate_archive_patch.js
```

`SKILL.md` 只写核心流程和何时读取 reference，不放长模板。模板和合同放进 `references/`，校验器放进 `scripts/`。

触发描述应该明确写：

```yaml
name: roleplay-novel-planner
description: 通过 AI 策划对话、档案沉淀、酒馆式角色卡和多角色扮演配置辅助中文小说创作。用于整理小说素材、生成角色卡、规划背景大纲、设计扮演配置、把扮演记录改写成小说正文片段。
```

## 5. 如果写成插件

适用场景：

1. 需要分发一整套能力，而不只是一个 skill。
2. 需要带脚本、模板、前端面板或本地数据链。
3. 需要同时提供“初始化、策划、扮演、改写、审查、记忆”多个入口。

建议结构：

```text
roleplay-novel-plugin/
├── .codex-plugin/
│   └── marketplace.json
├── skills/
│   ├── roleplay-novel-init/
│   ├── roleplay-novel-plan/
│   ├── roleplay-novel-act/
│   ├── roleplay-novel-adapt/
│   └── roleplay-novel-review/
├── references/
├── templates/
└── scripts/
```

插件不要一开始就做。当前项目更需要先把本地工作台跑稳；当 skill 包、档案合同、扮演配置和正文改写都稳定后，再抽成插件。

## 6. 角色卡合同

本项目持久化字段保持克制：

```json
{
  "name": "",
  "roleType": "major",
  "description": "",
  "personality": "",
  "scenario": "",
  "firstMessage": "",
  "exampleDialog": "",
  "systemPrompt": "",
  "postHistoryInstructions": "",
  "lorebook": "",
  "tags": []
}
```

同时支持酒馆 V2 输入字段：

| 酒馆字段 | 本项目字段 |
| --- | --- |
| `name` | `name` |
| `description` | `description` |
| `personality` | `personality` |
| `scenario` | `scenario` |
| `first_mes` | `firstMessage` |
| `mes_example` | `exampleDialog` |
| `system_prompt` | `systemPrompt` |
| `post_history_instructions` | `postHistoryInstructions` |
| `character_book.entries[]` | 同步为角色 `lorebook` 文本，并额外生成 `scope=private`、`ownerId=角色 id` 的独立世界书条目 |
| `tags` | `tags` |

这样既能参考酒馆生态，又不把 UI 做成“用户和单角色聊天”。

## 7. 自检

1. 核心目标仍然是“先策划沉淀，再启动扮演，再改写正文”，没有被插件形态带偏。
2. skill 包已被后端真实调用，不只是文档概念。
3. 角色卡映射支持酒馆 V2，但没有为了兼容而新增一堆持久化字段。
4. 插件化被放在后续阶段，避免当前版本过早复杂化。
5. 当前设计能继续接入更强的记忆系统、章节定位和审查链，而不需要推翻现有编排。
