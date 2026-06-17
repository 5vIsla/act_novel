# 策划 Agent Runtime 设计

## 目标

策划 Agent 不是普通聊天窗口，而是小说项目里的受控操作型 Agent。用户只提交任务、资料或修改目标，Agent 自行决定是否检索历史、读取本地文件、写入记忆、编辑世界书、生成配置或启动子 Agent。内部上下文管理不应该变成一堆手动按钮，但审计层必须能追踪它读了什么、为什么读。

## 运行协议

- 优先使用模型原生 `tools/tool_choice` 协议。
- 原生工具模式也保持模型流式输出；后端会聚合 Chat Completions 的 `delta.tool_calls` 和 Responses 的 `function_call_arguments.delta`，直到恢复出完整工具名与参数后再执行工具。
- 如果提供商不支持原生工具，后端只在可识别的工具协议兼容错误上降级到 JSON `skillOps`。
- `skillOps` 保留为 fallback 和旧模型兼容层，不再作为主流程心智。
- 模型完成工具调用后，仍必须输出结构化 JSON 结果，包含回复、任务图、完成判定、工具决策和停止原因。

## 统一工具注册表

所有工具通过 `getPlanningToolRegistry()` 注册，注册表统一提供：

- `name`：模型原生 tool call 使用的稳定工具名。
- 工具标签和风险等级。
- 权限元数据 `permission`。
- 自动重试和模型修正策略 `retry`。
- 前端折叠和结果展示建议 `display`。
- 结构化工具结果合同 `resultSchema`。
- JSON schema 与原生 tool schema。
- 权限检查和高风险审批。
- 执行函数。
- 运行 item、event、diagnostic 审计。
- 失败分类和可修正错误提示。

工具覆盖小说域、工作区文件、上下文资产、联网检索、shell、补丁编辑、子 Agent、自定义工具和 MCP 白名单入口。默认仍优先开放小说域工具，危险工具受权限模式和目录策略限制。

章节行文链路也进入同一注册表，不走页面按钮旁路：

| 工具 | 作用 |
| --- | --- |
| `generatePrewritePlan` | 由导演 AI 生成章节写前定位，并绑定章节工作流 |
| `runRoleplayTurn` | 运行导演、主要角色和次要角色群扮演，生成上下文审计 |
| `reviewLatestTurn` | 对指定或最近扮演轮次运行审查链 |
| `adaptRoleplayToProse` | 把最近扮演改写为正文草稿 |
| `postwriteProse` | 对已采纳正文执行写后回写 |
| `runChapterWorkflow` | 按步骤串行运行章节链路 |

这些工具默认属于小说域低风险写入，但仍受运行锁、模型配置检查、写入审计和工具结果 schema 约束。`postwriteProse` 只允许已采纳正文，不能把草稿沉淀成长期记忆。

章节工具必须保持工作流绑定一致：当模型或前端传入 `workflowId` 时，`runRoleplayTurn`、`adaptRoleplayToProse` 和 `runChapterWorkflow` 只能读写该章节工作流的产物。指定工作流还没有扮演轮次时，改写必须阻断，不能退回到全局最近三轮扮演。`runChapterWorkflow` 会复用本轮扮演已经自动生成的审查结果，只有显式 `forceReview` 才会再次审查，避免把工作流做成重复消耗模型的按钮链。

## 扮演运行时任务表

扮演运行时是项目核心，当前按以下任务验收：

| 任务 | 后端实现 | 前端 / 审计 |
| --- | --- | --- |
| 角色上下文构建器 | `buildAgentContextPack`、`createAgentContextPack` 和 `buildRuntimeDirectiveForTask` 会为导演、主要角色、次要角色群、改写器生成不同上下文包。角色包固定包含角色卡、触发世界书、可见记忆、检索证据、最近扮演、当前场景、角色当前目标、禁知和禁行。 | 行文页上下文审计展示运行时指令、触发世界书、结构化记忆和 RAG 证据数量。 |
| 角色可见性隔离 | 角色上下文使用 `tavern_context`，先按角色可见性过滤记忆和世界书，再按预算排序。后台设定、全局大纲、其他角色内心和作者隐藏信息不进入角色包。 | 诊断器和审查链会检查角色输出泄漏导演元信息、其他角色内心或后台信息。 |
| 导演轻约束 | 写前定位和导演输出只给局势、压力、边界、观察重点和禁止事项，不给角色台词或硬性行为命令。 | 固定评审链包含 `director_overcontrol`，用于发现“导演替角色做人”的输出。 |
| 单角色重跑 | `rerunTurnCharacter` 只重跑指定主要角色，保留同轮导演和其他角色输出，并刷新 `modelTrace`、context audit、transcript 和审查。 | 行文页可对某个角色输出触发重跑，重跑次数和原因进入 transcript。 |
| 标准 transcript | `buildRoleplayTranscriptFromTurn` 会记录导演输入、每个角色的上下文包摘要、模型、输出、审查、采纳状态、重跑状态和风险计数。 | 工作区投影 `session/transcripts.json` 与 `session/turns.md`；行文页新增 Transcript 标签页。 |

关键边界：角色包借鉴酒馆，但不是完整复刻酒馆 UI；策划和导演仍使用项目级 RAG 与结构化档案，不能把角色扮演式关键词触发当成所有 Agent 的唯一检索方式。

## 写作闭环

章节级写作闭环已经固定为：

```mermaid
flowchart LR
  A["策划 Agent"] --> B["章节写前定位"]
  B --> C["导演 AI 生成本章扮演配置 / 运行时指令"]
  C --> D["多角色 AI 扮演"]
  D --> E["扮演审查"]
  E --> F["正文改写 Agent"]
  F --> G["正文审查"]
  G --> H["档案 / 记忆 / 世界书回写"]
```

写前定位至少会进入这些字段：本章职责、承接上一章、留给下一章、主视角、角色关系压力、调用档案 / 记忆 / 世界书、后台知道但本章不写、前台可出句锚点、角色不能做什么、扮演观察重点、改写阶段保留项和角色运行时指令。

正文改写不再是“把扮演总结成小说”。`adaptRoleplayToProse` 要求正文 Agent 先输出 `adaptationPlan`，再输出 `paragraphGroups`。每个段落组保存目的、来源轮次、保留的角色输出、正文文本和功能检 / 角色检 / 场景检 / 承接检 / 风格检。后续如果某组失败，应整组重写，而不是只做换词修饰。

## 记忆和改稿学习

记忆层新增 `layer`，用于区分：

| layer | 含义 |
| --- | --- |
| `stable_fact` | 用户确认、正文采纳、档案确认后的稳定事实 |
| `tentative_judgment` | Agent 推测但未确认的判断 |
| `character_visible` | 某个角色知道、相信、误解或遗忘的内容 |
| `author_memory` | 用户偏好、文风要求、禁写项、项目目标 |
| `run_audit` | Agent 写入原因、证据和替换审计 |
| `roleplay_state` | 某次扮演形成的临时状态，不一定升为长期记忆 |

写入约束没有放松：普通对话不会自动写记忆；只有会影响后续策划、扮演、改写或审查的稳定内容，才值得通过工具写入。改稿学习也只是候选，用户确认后才会进入 `author_memory`。

档案写入现在也走统一工具层。模型仍可为了兼容旧输出返回 `archivePatch`，但后端会把它转换成 `applyArchivePatch` 工具调用，再执行 schema 校验、权限、审计、resultSchema 和写入报告；旧的“提取档案”接口也只作为兼容入口，内部同样调用工具执行器。

通用文件工具现在保留两套命名：本项目原有的 `searchLocalFiles / patchFile / revertFilePatch` 仍可用，同时新增标准别名 `searchFiles / applyPatch / revertPatch`，全部进入同一个执行器。`writeFile / applyPatch / patchFile / applyPatchSet / revertPatch / revertFilePatch / revertPatchSet` 都会生成 diff、patch 历史、checkpoint 和审计记录；覆盖、工作区外路径和删除类动作仍受权限策略控制。

`customTool` 已从空预留升级为后端白名单执行器，当前只内置 `jsonSchemaValidate`、`markdownHeadingIndex`、`jsonShapeSummary` 三个只读工具；外层走统一工具权限，内层再按注册工具的 input schema 校验。`mcpTool` 是可配置 JSON-RPC 桥，只调用 `PLANNING_MCP_TOOLS_JSON` 注册的 server/name/endpoint/method，默认目录为空，不会让模型任意发现或执行外部 MCP。

## 结构化错误分类

工具失败会归一化为 `category` 和 `action`：

| category | 典型原因 | 默认动作 |
| --- | --- | --- |
| `schema_error` | 参数缺失、字段不在 schema、空补丁 | 要求模型修复参数后重试 |
| `permission_required` | 只读模式、web/shell/MCP 未开启、需要人工确认 | 请求用户确认或调整权限 |
| `file_not_found` | 文件、patch、目标 id 不存在 | 先检索或列目录再重试 |
| `conflict` | preflight 冲突、patch hash 不匹配、目标歧义 | 先读取证据或预览 diff |
| `ai_provider_error` | 提供商、模型、tool_choice 兼容问题 | 自动重试或切换协议/模型 |
| `verifier_failed` | 完成判定器、命令 verifier 或审查模型失败 | 读取 verifier 输出并修正 |
| `tool_error` | 未归类工具错误 | 诊断后说明阻塞或重试 |

有可修正工具失败时，Agent 不会直接把 run 标为完成；它必须进入下一轮修正，或者明确阻断原因。

## 线程分支

策划线程现在有最小版 branch/fork 结构：

- `planning.branches` 保存分支 id、父分支、fork 来源消息和来源 run。
- 每条 planning message 和 run 都带 `branchId`。
- `GET /planning-messages` 默认只返回当前 active branch；也可传 `branchId` 查询指定分支。
- `GET /planning-branches` 返回分支列表、消息数和运行数。
- `POST /planning-branches/switch` 切换当前显示分支。
- 前端“回到此处编辑”不会覆盖原线程，而是发送时创建新分支。

后端另有派生版线程版本图和响应树路径：

- `planning.versionNodes` 保存运行时追加的工具调用、工具写入和工具失败节点。
- `GET /planning-version-graph` 会把 branch、message、run、run item、tool、checkpoint 和 context compaction version 合并成 DAG 视图。
- `GET /planning-response-tree` 会在 DAG 上为指定 `nodeId` 派生主父节点、旁路父节点、子节点、当前路径、根节点和分叉摘要。
- `GET /planning-response-tree-diff` 会对任意两个可见节点生成摘要负载 diff 和截断 unified diff，供前端审计节点变化。
- `POST /planning-response-tree-revert-node` 支持回滚带业务快照的 checkpoint 节点和 Agent 回复节点；普通 run item / 工具结果节点没有独立业务快照，只能审计不能直接业务回滚。
- 分支合并采用“创建合并分支”策略：预览来源分支新增消息、目标分支尾部消息和写入风险，应用时创建新的 merge branch，让后续 Agent 在新分支中显式审查和继续执行，不静默覆盖旧分支。
- 前端“运行历史与版本”抽屉展示版本节点列表，也展示 response tree 当前路径、最近分叉节点、节点 diff、单节点回滚入口和分支合并面板；用户可以点击任意节点聚焦它的路径。
- 版本图和 response tree 都只暴露摘要和元数据，不把 rollback snapshot 或上下文资产全文塞给前端。

这仍不是 Codex 内部完整 response tree。当前版本已经能追踪用户任务、Agent run、run item、工具调用 / 结果 / 失败、checkpoint 和压缩版本之间的父子关系，并能按节点聚焦、对比、回滚带快照节点和创建合并分支；但无快照节点不能凭空回滚业务状态，分支合并也不是复杂冲突编辑器。

## Message / Turn / Item 运行模型

一次 Agent 任务会产生 run。run 内部统一记录 item：

- `model_call`：模型调用。
- `tool_call` / `tool_result`：工具开始、完成或失败。
- `evidence_plan` / `evidence_read`：自动证据调度和读取。
- `sub_agent`：子 Agent session。
- 审批、checkpoint、诊断和 verifier 仍保留在 run 的专门字段里，并通过事件流暴露。

前端对过程默认折叠，只展示摘要标签；展开后可看 item 和事件细节。

## 自动历史证据调度

每轮 Agent 启动后，先由后端自动调度证据：

- `project_rag`：检索档案、角色卡、记忆、世界书、正文、扮演记录和策划对话。
- `context_assets`：检索已落盘的大工具结果、压缩摘要和运行审计资产。
- `context_asset_reads`：按相关资产 id 读取旧证据原文片段。
- `workspace_files`：当任务提到文件、本地资料、插件、skill 或工作区时，检索当前小说 Agent 工作区。

这些结果作为 `evidenceScheduler` observation 进入 Agent，但不代表 Agent 已经执行了本轮工具操作。Agent 仍要根据用户目标决定是否继续调用工具。

## 小说域 RAG 路由

项目检索默认遵从小说记忆设置：

- 支持 `bm25`、`vector`、`hybrid`。
- 支持向量索引过期提醒。
- 支持 rerank。
- 前端审计显示证据层、读取原因、工具类型、命中 id 和资产引用。

角色扮演、导演、策划和改写继续使用不同 memory strategy；策划 Agent 侧重全局统筹和可审计写入，角色侧重可见性过滤和酒馆式触发。

## 子 Agent

`spawnSubAgent` 现在会创建 `subAgentSession`，记录父 run、任务、状态、结果和错误。同步模式会等待子 Agent 结束并把结果作为工具 observation 返回；后台模式会先返回 session id，再由持久后台队列更新 session 状态和 run 审计。

子 Agent 不是开放式通用 Agent。后端固定了几种小说域 profile，并通过 `/planning-tools` 暴露给前端和模型：

| profile | 用途 | 权限画像 |
| --- | --- | --- |
| `research` | 资料考据、来源核验、证据链整理 | `read_only_novel_domain` |
| `lorebook_review` | 世界书关键词、触发边界、覆盖关系审查 | `read_only_novel_domain` |
| `character_consistency` | 角色年龄、称呼、身份、记忆和配置一致性审查 | `read_only_novel_domain` |
| `prose_style_review` | 正文风格、事实连续性、扮演改写忠实度审查 | `read_only_novel_domain` |
| `roleplay_log_cleanup` | 扮演轮次、角色输出、审查注释和重跑候选整理 | `read_only_novel_domain` |

`spawnSubAgent` 的 schema 会约束 `profile`，session 会保存 `profile`、`permissionProfile`、`allowedTools` 和 `outputSchema`。这意味着子 Agent 可以像后台任务一样被追踪，但默认不会获得 shell、写文件、web、MCP 或任意电脑操作能力。

后台队列不是单纯内存 `Map`：session 会保存执行模型、尝试次数、租约、心跳和重试时间。服务重启后会扫描 queued 或租约过期的 running session，重新领取任务并继续执行；失败会按结构化错误判断是否有限重试，取消父 run 时会同步取消关联后台子 Agent。

当前子 Agent 仍限定为只读小说域分析，适合资料考据、世界书审查、角色一致性审查、正文风格审查和扮演记录整理，不默认开放无边界通用操作。

## 小说资料诊断器

本项目不照搬代码 LSP，而是实现小说资料诊断器 `inspectNovelDiagnostics`。它是只读工具，检查范围包括：

- 档案核心字段缺失。
- 角色、场景、线索档案缺少稳定主键。
- 角色、场景、线索档案主键重复。
- 记忆缺 evidence、visibility 或内容过长。
- 同一 subject/field 的长期记忆存在未退役事实冲突。
- 世界书非 alwaysOn 条目缺关键词。
- 世界书关键词重复。
- 世界书关键词短词遮蔽长词，导致触发范围过宽。
- 世界书绑定不存在角色。
- 世界书内容与角色卡/档案稳定事实冲突。
- 主要角色缺独立模型配置。
- 角色年龄冲突。
- 角色称呼、别名或代号指向多个角色。
- 扮演配置结构缺少 scenario 或角色项缺 name/roleType。
- 扮演配置引用不存在角色。
- 扮演配置归一化不再自动生成占位角色，也不把次要角色强行改成主要角色；缺角色时由诊断和运行前校验暴露问题。
- 扮演轮次或章节写前定位引用不存在角色。
- 角色输出泄漏导演元信息、其他主要角色内心或照抄导演引导。
- 导演引导硬性命令过多，疑似替角色做决定。
- 角色上下文策略不是 `tavern_context`，或世界书触发可见性异常。
- 正文写出了写前定位中标记为“后台知道但不出句”的信息。
- 已采纳正文缺少写后回写。
- 已采纳正文缺少扮演轮次来源范围。
- 已采纳正文缺少审查记录或上下文注入摘要，无法追踪章节事实来源。
- 已采纳正文事实与角色卡/档案不一致。

诊断器输出进入普通工具 result，不直接改资料。Agent 需要根据诊断结果决定是否调用写入工具、请求用户确认或只说明风险。

## OS Sandbox 边界

当前项目没有 Codex 那种完整 OS sandbox。它是 Node 本地工作台，已实现的是应用层权限：

- 每本小说固定 Agent 工作区。
- 工作区外路径需要权限策略或人工确认。
- shell 默认关闭。
- 危险命令、密钥探测和外部 cwd 有拦截。
- 持续 shell 会话会记录命令分段、每段状态、退出码、耗时、stdout/stderr 和停止原因，并通过 SSE 推送输出。
- 后台 shell 作业支持 start/list/read/stop，记录 pid、状态、退出码、耗时、stdout/stderr 字节数和最近输出；前端权限面板可刷新并停止仍在运行的作业。作业元数据和 stdout/stderr 日志会写入当前小说工作区 `roleplay-novel-project/planning/shell-jobs/`，服务重启后可恢复历史审计记录；如果重启后没有可控进程句柄，运行中记录会被标记为已停止并保留原因。
- 权限面板支持持久命令前缀授权，允许 / 确认 / 拒绝都会进入后端权限策略；它不会绕过危险命令拦截或工作区外 cwd 审批。
- 文件写入有 preflight、diff、patch 历史和回滚检查。

这不能等价替代系统级隔离，也不是完整终端复刻。真正 OS sandbox 需要独立受限用户、容器、Windows Job Object/AppContainer、文件系统 ACL 或外部隔离进程；完整终端还需要 PTY 和交互式 TUI。小说策划 Agent 默认也不应该拥有强 shell；shell 只作为资料处理、转换、批量修复和测试时的高级工具开放。

Windows 下的隔离路线按四层推进，不把文档设计伪装成已实现能力：

1. 应用层权限，当前已实现。所有 Agent 工具先经过工作区、工具风险、命令前缀、人工确认、diff 和审计记录检查。这一层解决“小说 Agent 默认不该乱写文件和乱跑 shell”，但挡不住 Node 进程或子进程逃逸。
2. 低权限本地用户 + ACL，下一步准 OS 沙箱。为 Agent 子进程创建专用 Windows 用户或服务账户，只给当前小说工作区、临时目录和必要缓存目录 ACL，工作区外默认拒绝。优点是能直接限制文件系统访问，和当前每本书固定工作区天然匹配；缺点是进程生命周期、网络和 CPU/内存还要靠其它机制补齐。
3. Windows Job Object，下一步进程树治理。用 Job Object 绑定 Agent 启动的 shell、脚本和转换子程序，限制进程树生命周期、CPU/内存、子进程逃逸和服务关闭后的孤儿进程。它适合补齐“长期后台进程管理”，但不是文件系统安全边界。
4. AppContainer / Windows Sandbox / WSL2 或容器，作为重隔离方案。AppContainer 适合封装受限 Win32 工具，但接入成本高；Windows Sandbox 可通过 `.wsb` 映射当前小说工作区，适合运行不可信转换工具或批处理；WSL2/容器适合 Linux 工具链和批量资料处理。重隔离默认不进入小说策划主流程，只作为高级 shell profile 启用。

因此第一版不追求 Codex 完整 OS sandbox，而是先让 Agent 写入、文件和 shell 工具都能被审计、阻断和回滚；再把危险执行迁移到低权限用户 + Job Object；最后把少数高风险批处理放进 Windows Sandbox 或容器。

## 测试

`npm test` 会启动隔离数据目录的临时后端，运行默认 smoke 套件，覆盖：

- 启动任务。
- 原生工具调用。
- 原生工具流式 `tool_call delta` 解析。
- 工具目录 `name/schema/permission/retry/display/resultSchema` 元数据。
- 自动证据调度。
- `applyArchivePatch` 档案写入工具。
- 小说资料诊断器 `inspectNovelDiagnostics` 的基础工具链。
- 正文版本树、正文 diff、质量门禁和 RAG 质量评估 API。
- 线程版本图，包含 Agent run、工具写入、父子边和基础 response tree。
- 写入带证据记忆。
- 回退最近一轮写入。

完整回归按套件拆分，避免默认测试再次超时：

- `npm run test:e2e:agent` 覆盖原生工具流、customTool、记忆污染拒绝、fork / response tree / merge、失败诊断、子 Agent、取消、后台恢复和上下文压缩续跑。
- `npm run test:e2e:writing` 覆盖章节工作流 API 和 `runChapterWorkflow` 工具，包含写前定位、扮演、审查、改写、上下文审计、单角色重跑、采纳正文、写后回写、正文版本树、质量门禁、RAG 质量、改稿学习和小说诊断器高风险断言。
- `npm run test:e2e:runtime` 覆盖持续 shell、stdout/stderr 分段审计和后台 shell 作业。
- `npm run test:e2e:all` 只用于全量回归。

测试使用临时 `ROLEPLAY_DATA_DIR` 和 `ROLEPLAY_NOVELS_DIR`，不会污染真实小说数据。
