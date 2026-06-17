# 记忆与 RAG 设计

## 1. 结论

本项目需要 RAG，但不能只做 RAG。

更准确的设计是：**稳定档案 + 事件日志 + 结构化长期记忆 + 检索召回 + 上下文预算 + 角色可见性控制**。RAG 只负责从大量资料、历史对话和历史扮演里找相关证据，不能承担“事实真源”的职责。

如果只接一个向量库，会出现四类问题：

1. 向量相似不等于事实正确，可能召回过期设定。
2. 策划、导演、角色、改写器需要的记忆不同，不能共用同一包上下文。
3. 角色 AI 不能看到自己不该知道的全局真相，否则扮演会穿帮。
4. 长篇写作需要冲突、废弃、暂定、确认等状态，纯 RAG 没法表达事实生命周期。

所以，RAG 应作为检索层接入，而不是替代档案、角色卡和事件日志。

## 2. 参考系统对照

### 2.1 酒馆

酒馆的记忆能力不是单一 RAG，而是几套机制叠加：

1. **角色卡**：保存角色名称、描述、性格、场景、首条消息、示例对话、系统提示、后置指令、标签和角色书。
2. **World Info / Lorebook**：按关键词、过滤条件、插入顺序和插入位置动态注入背景设定。
3. **Data Bank / Vector Storage**：把文档切块、向量化，按相似度召回相关片段注入 prompt。
4. **Chat Vectorization**：从远处聊天历史里召回相关消息，并把它们重新放入上下文重点位置。
5. **上下文预算**：世界书和资料库都有预算，不会无限塞入。

对本项目的启发：

1. 角色卡用于稳定角色身份，不应该塞完整世界观。
2. 世界书式条目适合做“条件触发设定”。
3. RAG 适合召回长文档、旧对话、旧扮演、旧正文中的相关证据。
4. 酒馆默认是聊天场景，本项目是小说生产，需要额外加入导演统筹、角色信息屏蔽和改写忠实性。
5. 当前实现已经把世界书从“间接记忆”提升为独立数据结构；角色扮演使用接近酒馆的上下文触发，策划和导演仍使用更适合长篇统筹的项目级检索。

### 2.2 `webnovel-writer`

`E:\novel\webnovel-writer` 的记忆系统更接近本项目需要的长篇写作结构。

它的核心不是“向量库优先”，而是：

1. `memory_scratchpad.json` 保存长期语义记忆。
2. `index.db` 保存结构化历史证据。
3. `summaries/` 保存近期摘要。
4. `state.json` 保存运行状态。
5. `MemoryOrchestrator` 组装 `working_memory`、`episodic_memory`、`semantic_memory`、`active_constraints`、`recent_changes`、`warnings`。
6. `MemoryWriter` 从章节结果里抽取角色状态、故事事实、世界规则、时间线、伏笔、读者承诺和关系。
7. `ScratchpadManager` 通过统一 key 做去重，新事实进入后旧事实降为 `outdated`，保留审计痕迹。
8. `RAGAdapter` 支持向量、BM25、混合检索和图谱增强检索，向量失败时可回退到 BM25。
9. `QueryRouter` 按人物、场景、设定、剧情、关系等意图选择检索策略。
10. `budget.py` 和 `compactor.py` 控制注入预算和长期压缩。

对本项目的启发：

1. 记忆要有状态，不能只有文本片段。
2. 写入链路要比读取链路更重要，因为脏记忆会污染后续所有调用。
3. 检索结果要经过任务类型和预算裁剪，不是搜到什么就塞什么。
4. RAG 结果最好带来源证据，方便用户判断是否可信。

### 2.3 `my-novel-skill`

`E:\novel\my-novel-skill` 的重点不是向量检索，而是创作档案分层：

1. **稳定档案**：大纲、人物、物件、线索、场景。
2. **漂移档案**：改稿偏好，区分候选、暂行、已确认、已废弃。
3. **模仿档案**：作者写法画像、融合写法总控。
4. **过程档案**：每章写前定位。
5. **调用原则**：开写前必须把本章真正生效的档案条目摘成执行约束，不能只说“注意一致性”。

对本项目的启发：

1. RAG 召回的内容不能直接进入正文，应先压成本轮生效约束。
2. 场景档案是边界，不是素材池。
3. 人物档案要记录反应模型、说话方式、禁区行为和阶段变化，不是堆性格标签。
4. 用户明确修改和稳定档案的优先级必须高于自动召回内容。

## 3. 本项目记忆分层

建议采用五层：

| 层级 | 作用 | 第一阶段做法 | 后续升级 |
| --- | --- | --- | --- |
| 稳定档案层 | 大纲、角色卡、世界规则、场景、线索 | 保存到小说 `archives` 和 `characters` | 拆成 SQLite 表 |
| 事件日志层 | 记录策划对话、扮演轮次、改写、用户编辑 | 继续使用 `session.events` | 事件溯源和版本回放 |
| 结构化记忆层 | 可被确认、废弃、过期的长期事实 | JSON 记忆项 | SQLite + 状态审计 |
| 检索层 | 从档案、历史、正文、文档召回证据 | 关键词 / BM25 | Embedding + rerank + 图谱 |
| 上下文组包层 | 按 AI 角色生成不同上下文包 | 后端统一组包 | 动态预算、冲突告警 |

## 4. 统一记忆项

不要给每个 AI 乱加几十个状态字段。建议用统一 `MemoryItem`：

```json
{
  "id": "mem_xxx",
  "scope": "planner | director | character | prose | global",
  "ownerId": "角色 id，可为空",
  "category": "user_intent | world_rule | character_state | relationship | timeline | open_loop | scene_fact | style_preference | draft_evidence",
  "subject": "条目主体",
  "field": "变化字段或事实类型",
  "value": "当前有效内容",
  "status": "active | tentative | outdated | contradicted | resolved",
  "visibility": ["planner", "director", "character:xxx", "adapter"],
  "source": {
    "type": "planning_chat | imported_doc | roleplay_turn | prose_part | manual_edit",
    "id": "来源 id"
  },
  "evidence": ["可回看的原文片段"],
  "updatedAt": "ISO 时间"
}
```

关键点：

1. `scope` 表示属于哪类工作。
2. `ownerId` 表示角色私有记忆。
3. `visibility` 负责角色信息屏蔽。
4. `status` 负责生命周期，旧设定不删除，而是降级。
5. `evidence` 保留来源，方便审计。

### 4.1 长期记忆与 RAG 写入边界

记忆不是“把每轮对话总结一下”。RAG 负责召回证据，记忆负责保存经过确认、状态清晰、可见性正确、会影响后续行为的结构化事实。

策划 Agent 允许写入记忆的内容：

| 分类 | 应写内容 |
| --- | --- |
| `user_intent` | 用户长期目标、明确否定过的方向、项目级稳定要求 |
| `world_rule` | 已确认且会反复影响剧情的世界规则 |
| `character_state` | 角色阶段性状态变化、可见知识、伤病、目标变化 |
| `relationship` | 已发生或已确认的关系变化 |
| `timeline` | 已确认时间线节点、事件顺序、章节阶段 |
| `open_loop` | 需要回收的伏笔、未解决承诺、待确认冲突 |
| `scene_fact` | 场景边界、地点状态、已发生且后续要承接的现场事实 |
| `style_preference` | 用户明确且稳定的写法偏好、禁写方向 |
| `draft_evidence` | 已采纳正文或可回看的证据索引，不作为 active 策划记忆的兜底分类 |

不应写入记忆的内容：

1. 临时脑洞、还没确认的备选路线。
2. 整段文档摘要、世界书全文、角色卡全文。
3. 草稿正文全文或原始扮演记录全文。
4. 模型猜测、没有证据的补完。
5. 某角色不该知道的幕后真相。
6. 已废弃或被用户否定的设定，除非用 `outdated` 或 `contradicted` 状态保存审计。
7. 提供商 key、baseUrl、鉴权信息。

后端写入约束：

1. `upsertMemory` 必须包含 `subject`、`field`、`value`、`visibility`、`evidence`。
2. 策划 Agent 写 active 记忆时，不能用 `draft_evidence` 作为兜底分类。
3. 单条记忆 `value` 过长会被拒绝，要求压成单条事实或放入本地资料/RAG。
4. `patchMemory` 编辑后仍要满足同样的合同。
5. 旧事实不物理删除，优先改成 `outdated` 或 `contradicted`。

## 5. 各 AI 的上下文包

### 5.1 策划 AI

策划 AI 需要全局记忆，但重点不是历史扮演细节，而是“创作决策链”：

1. 用户明确意图。
2. 用户否定过的方向。
3. 已确认档案。
4. 待定问题。
5. 大纲版本变化。
6. 导入文档的证据片段。
7. 与用户文风和偏好的长期记录。

策划 AI 可以看到全局真相，但必须区分：

1. 已确认。
2. 暂定。
3. 被废弃。
4. 与旧设定冲突。

### 5.2 导演 AI

导演 AI 需要统筹记忆：

1. 当前章节或场景目标。
2. 时间线。
3. 场景状态。
4. 世界规则。
5. 未回收伏笔。
6. 角色当前可见状态。
7. 本轮禁止事项。
8. 上轮扮演产生的未解决冲突。

导演 AI 可以看到比角色更多的信息，但它不应该替角色做决定。它的输出应该是“可执行约束”，不是正文或角色内心。

### 5.3 主要角色 AI

角色 AI 需要私有、主观、可见的记忆：

1. 自己的角色卡。
2. 自己经历过的事件。
3. 自己知道的世界事实。
4. 自己对其他角色的关系判断。
5. 最近几轮互动。
6. 当前场景里自己能观察到的信息。
7. 自己不知道但导演允许作为边界的限制。

角色 AI 不应该看到：

1. 幕后真相。
2. 其他角色内心。
3. 未来大纲。
4. 作者为了结构安排的伏笔回收计划。
5. 被标记为其他角色私有的信息。

### 5.4 次要角色群 AI

次要角色群 AI 需要的是“局部角色池记忆”：

1. 本轮允许出场的次要角色。
2. 每个次要角色的简短卡片。
3. 他们在当前场景知道什么。
4. 他们能制造的信息、阻碍、误会或氛围。
5. 他们不能抢走的主线选择。

它不需要完整全局 RAG，否则容易让路人角色说出超出身份的信息。

### 5.5 改写 AI

改写 AI 需要忠实改写记忆：

1. 本轮导演约束。
2. 本轮各角色实际输出。
3. 最近正文尾部。
4. 本章文风和叙事视角约束。
5. 不允许新增的设定。
6. 必须保留的角色选择。

改写 AI 可以看到角色内心，但只能把“角色 AI 已输出的内心”改写成正文，不能替角色补新的关键决定。

## 6. 写入链路

### 6.1 策划对话写入

每轮 AI 策划对话结束后，后端应执行：

1. 保存原始对话。
2. 让策划 skill 输出 `archivePatch`。
3. 从 `archivePatch` 中提取候选 `MemoryItem`。
4. 对与旧记忆同 key 的条目做状态裁决。
5. 用户可在档案页确认或修正。

### 6.2 文档导入写入

用户粘贴或导入长文档时：

1. 原文进入资料库。
2. AI 提取候选档案。
3. 文档被切块，进入检索索引。
4. 结构化事实必须带证据片段。
5. 不直接把整段原文塞进角色卡。

### 6.3 扮演轮次写入

每轮扮演结束后：

1. 原始扮演输出进入事件日志。
2. AI 或规则提取角色状态、关系变化、时间线事件、伏笔状态。
3. 角色私有信息写入角色可见记忆。
4. 导演可见信息写入导演统筹记忆。
5. 有冲突的条目标记为 `tentative` 或 `contradicted`，不悄悄覆盖。

### 6.4 正文改写写入

正文被用户采纳后：

1. 正文片段进入可检索资料。
2. 与扮演输出建立来源关联。
3. 从采纳正文中抽取坐实事实。
4. 未采纳正文不应进入稳定记忆。

### 6.5 写后回写

写后回写是章节闭环的最后一步，不等于“把正文全文存成记忆”。它只处理已采纳正文，目标是把后续必须承接的状态变化沉淀出来：

1. 调用记忆整理 AI，从已采纳正文和近期扮演中提取单条事实。
2. 每条事实仍必须满足 `subject`、`field`、`value`、`visibility`、`evidence`。
3. 同时触发正文一致性审查，把审查 id、记忆写入数量和状态写回 `prose.postwriteBack` 与对应 `chapterWorkflow.writeBack`。
4. 如果记忆整理失败，正文仍保持已采纳，但工作流会标为 blocked 或 warning，便于用户重新回写。
5. 未采纳草稿不能执行写后回写，避免草稿污染长期记忆。

## 7. 读取链路

每次调用 AI 前，后端统一走 `MemoryOrchestrator`：

1. 判断任务类型：策划、导演、角色、次要角色群、改写。
2. 生成查询：当前用户输入、场景目标、角色名、地点、涉及线索。
3. 先按 `visibility`、`scope`、`ownerId` 过滤结构化记忆。
4. 再从档案、历史、正文、资料库里做关键词 / BM25 / 向量召回。
5. 召回结果按任务重排。
6. 冲突记忆进入告警，不默认注入。
7. 按预算组装 prompt。
8. 在前端保留“本次注入了哪些记忆”的可查看列表。

## 8. 第一阶段落地顺序

当前项目已经先把结构化记忆接口和可见性合同做稳，再接入本地文件型向量索引；后续外部向量数据库只应替换存储层，不应绕过可见性过滤。

建议顺序：

1. **结构化记忆 JSON**：在小说数据里增加 `memory.items`，先支持手动和 AI 提取写入。
2. **角色可见性**：每次运行角色 AI 前，只注入该角色可见记忆。
3. **关键词/BM25 检索**：先用本地文本检索覆盖大部分中文小说场景。
4. **记忆注入预览**：前端显示本次每个 AI 收到了哪些记忆。
5. **采纳后写入**：只有用户采纳的扮演或正文进入稳定记忆。
6. **Embedding 配置**：在“Agent 设置 / 上下文检索配置”中配置 embedding/rerank 槽位。
7. **向量索引**：对长文档、旧正文、旧扮演做切块向量化。
8. **混合检索**：BM25 + vector + rerank，而不是只用 vector。

## 9. 自检

### 是否需要 RAG

需要。策划对话、长文档、历史正文和旧扮演会越来越长，靠完整上下文不现实。

### 是否只靠 RAG 就够

不够。RAG 找的是相关文本，不负责判断当前事实是否有效，也不负责角色是否应该知道。

### 是否偏离扮演法写小说

没有。记忆系统服务于扮演法：导演拿统筹记忆，角色拿私有记忆，改写器拿忠实改写记忆。

### 最大风险

最大风险是“记忆污染”。解决方式不是加更多硬编码规则，而是：

1. 写入带证据。
2. 事实有状态。
3. 角色有可见性。
4. 注入有预算。
5. 用户能看到和修正本次注入内容。

### 当前实现修正

当前实现已经把结构化记忆和事件日志进一步拆开：

1. 扮演原始输出保留在 `session.turns` 和检索文档中，不再默认写成 `active` 长期记忆。
2. 结构化记忆必须有 `subject`、`field`、`value`、`visibility` 和 `evidence`。
3. 档案、角色卡和正文不再机械投影到记忆；它们分别进入固定上下文、世界书/RAG 证据层和正文库。
4. 每本小说创建时都会在项目内生成固定文件夹 `novels/<书名>-<小说id>/`，并在这个 Agent 工作区里生成 `roleplay-novel-project/`，把档案、世界书、记忆、扮演配置、扮演记录、正文和审查投影成可检索文件。
5. 工作区文件当前是只读投影，权威数据仍在后端 store 中；后续如果做双向同步，必须增加合并、冲突检测和审计。

### 工程判断

当前实现选择本地文件型向量索引，而不是一开始接复杂外部向量库。结构化记忆和可见性过滤仍是地基：没有这个地基，向量召回越强，越可能把不该出现的信息塞给错误的 AI。

## 10. 第一阶段实现规格

第一阶段的目标不是“把所有历史都塞进提示词”，而是让每次 AI 调用前都有一个可检查的上下文包。上下文包由后端统一生成，前端只负责展示和允许用户修正。

### 10.1 数据结构

小说对象增加：

```json
{
  "memory": {
    "items": [],
    "lastInjection": null,
    "settings": {
      "enabled": true,
      "maxStructuredItems": 12,
      "maxRetrievedItems": 8,
      "maxEvidenceChars": 900,
      "retrievalMode": "hybrid",
      "vectorEnabled": false,
      "embeddingProviderId": "",
      "embeddingModel": "",
      "rerankEnabled": true,
      "rerankProviderId": "",
      "rerankModel": "",
      "maxVectorCandidates": 40,
      "vectorChunkChars": 900
    },
    "vectorIndex": {
      "documents": [],
      "sourceHash": "",
      "embeddingBackend": "local_hash",
      "documentCount": 0,
      "chunkCount": 0,
      "stale": true,
      "updatedAt": ""
    },
    "updatedAt": "ISO 时间"
  },
  "lorebook": {
    "entries": [],
    "settings": {
      "scanDepth": 4,
      "maxTriggeredEntries": 8,
      "maxCharsPerEntry": 900,
      "recursiveScanning": false
    },
    "updatedAt": "ISO 时间"
  }
}
```

记忆项使用统一结构：

```json
{
  "id": "mem_xxx",
  "scope": "planner | director | character | prose | global",
  "ownerId": "",
  "category": "user_intent | world_rule | character_state | relationship | timeline | open_loop | scene_fact | style_preference | draft_evidence",
  "subject": "",
  "field": "",
  "value": "",
  "status": "active | tentative | outdated | contradicted | resolved",
  "visibility": ["planner", "director", "adapter", "character:char_xxx", "minor"],
  "source": {
    "type": "planning_chat | archive | roleplay_turn | prose_part | manual_edit",
    "id": ""
  },
  "evidence": [],
  "updatedAt": "ISO 时间"
}
```

设计取舍：

1. 不给每个 Agent 增加私有状态表，而是用统一记忆项表达事实、来源、状态和可见性。
2. 旧事实不直接删除，同 key 新事实写入后旧事实降为 `outdated`，保留来源，避免记忆污染无法追踪。
3. `visibility` 是第一阶段最重要的字段，因为角色 AI 不能看到幕后真相、其他角色内心和未来大纲。

### 10.2 后端 API

新增接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/novels/:id/context-pack?task=director&characterId=` | 预览某类 AI 本轮会收到的上下文包 |
| `GET` | `/api/novels/:id/memory-pack?task=director&characterId=` | 旧版兼容入口，返回同一份 `contextPack` |
| `POST` | `/api/novels/:id/memory/rebuild` | 清理旧版机械投影记忆，并保留人工或 Agent 明确沉淀的长期事实 |
| `POST` | `/api/novels/:id/memory/items` | 手动新增记忆项 |
| `PUT` | `/api/novels/:id/memory/items/:memoryId` | 修改记忆项 |
| `DELETE` | `/api/novels/:id/memory/items/:memoryId` | 删除记忆项 |

新增行为：

1. 策划对话调用前，为策划 AI 生成 `planner` 上下文包，注入用户意图、已确认档案、待定问题、旧对话证据和冲突提示。
2. 策划对话不会自动把每次 `archivePatch` 投影成记忆；只有策划 Agent 显式调用 `upsertMemory`、人工新增记忆，或记忆整理 AI 从证据中提取事实时，才会按写入合同生成结构化记忆。
3. 扮演配置采纳后，角色卡和场景进入固定上下文、档案和世界书触发层，不再机械投影为记忆项。
4. 每次运行扮演前，分别生成导演、主要角色、次要角色群上下文包。
5. 每次改写前，生成改写 AI 上下文包。
6. 每次运行结束，把本次使用的上下文包保存到历史兼容字段 `turn.memoryInjection` 或 `prose.memoryInjection`，供前端审查。
7. 同时生成轻量 `contextAudit` 摘要，记录策略、触发世界书、结构化记忆、RAG 证据、预算和 warnings。前端默认展示审计摘要，完整大包仍按需查看。

长期记忆的正向定义：

1. 存“后续 Agent 必须持续记住且会改变行为的单条事实”，例如角色当前状态变化、关系变化、时间线节点、用户稳定写作偏好、已确认开放伏笔、会影响扮演可见性的事实。
2. 每条记忆必须有 `subject`、`field`、`value`、`visibility`、`evidence`、`source` 和 `status`，其中 `value` 是单条事实，不是档案块。
3. `visibility` 是事实的一部分。角色 AI 不能看到幕后真相、未来大纲或其他角色内心；导演和策划可以看到更完整的统筹层。

长期记忆禁止写入：

1. 角色档案、场景档案、线索档案整块内容，例如带 `name`、`roleType`、`purpose`、`setup` 等字段的整块档案文本。
2. 明显占位语，例如尚未确认、待补充、后续再明确等没有稳定事实含量的内容。
3. 工具运行报告、verifier 测试输出、检索结果 JSON、shell 输出、patch diff、上下文资产全文。
4. 普通对话摘要、未确认脑洞、模型猜测、为了凑上下文生成的泛化总结。
5. 已有档案的机械镜像。项目背景、大纲、角色永久设定优先留在档案、角色卡或世界书；记忆只记录它们之外需要跨阶段持续召回的事实变化。

### 10.3 上下文包结构

```json
{
  "task": "director",
  "strategy": "orchestration_rag",
  "characterId": "",
  "query": "本次检索查询",
  "lorebookScan": {
    "depth": 4,
    "sourceCount": 3,
    "text": "用于触发世界书的扫描文本"
  },
  "fixedContext": [],
  "triggeredLore": [],
  "structuredMemory": [],
  "retrievedEvidence": [],
  "recentContext": [],
  "promptSections": [],
  "layers": {
    "fixedContext": [],
    "triggeredLore": [],
    "structuredMemory": [],
    "retrievedEvidence": [],
    "recentContext": []
  },
  "warnings": [],
  "budget": {
    "structuredMemory": 12,
    "retrievedEvidence": 8,
    "evidenceChars": 900,
    "triggeredLore": 8,
    "loreChars": 900
  },
  "builtAt": "ISO 时间"
}
```

`fixedContext` 来自角色卡、项目档案或改写固定约束；`triggeredLore` 来自世界书关键词触发；`structuredMemory` 来自已归一化的长期记忆；`retrievedEvidence` 来自档案、历史扮演和正文的 BM25 / vector 混合检索结果；`recentContext` 来自最近策划对话或最近扮演轮次；`promptSections` 是后端按世界书插入位置整理后的最终组包顺序。向量库只替换检索证据层，不改变上下文包合同。

### 10.4 章节上下文审计

章节工作流里的上下文审计只保存摘要，避免把每个角色的大上下文复制多份：

```json
{
  "director": {
    "strategy": "orchestration_rag",
    "triggeredLoreCount": 2,
    "structuredMemoryCount": 6,
    "retrievedEvidenceCount": 4,
    "triggeredLore": []
  },
  "characters": {
    "char_xxx": {
      "strategy": "tavern_context",
      "triggeredLore": [],
      "structuredMemory": [],
      "retrievedEvidence": []
    }
  }
}
```

审计用途：

1. 验证主要角色是否走 `tavern_context`，而不是策划/导演的全局 RAG。
2. 查看世界书为什么触发，触发词和可见性是否正确。
3. 判断角色是否缺少关键长期记忆或被错误注入幕后信息。
4. 给诊断器提供证据，检查世界书触发异常、角色可见性泄漏和导演过控。

### 10.4 检索策略

当前实现中文友好的 BM25 + vector + rerank 混合检索：

1. 中文按连续汉字二字片段、英数词和完整短词共同分词。
2. 先按任务和可见性过滤，再做检索。
3. 状态为 `contradicted` 的记忆进入告警，不默认注入。
4. 状态为 `outdated` 的记忆只在前端长期记忆视角展示，不进入普通上下文包。
5. 检索结果保留来源、BM25 分数、向量分数、重排分数和召回模式，方便用户判断是否该修正记忆。

本地向量索引用来跑通单机创作工作台的 RAG 链路；超大项目后续可以把存储层替换成 SQLite、LanceDB、Qdrant 等专用方案。

### 10.5 前端页面

侧栏“长期记忆”页只负责长期事实维护：

1. 新增、编辑、删除结构化记忆项，并清理旧版机械投影记忆。
2. 每条长期记忆显示范围、类别、主体、字段、内容、可见性和证据。
3. 页面显示记忆统计和写入边界，提醒用户不要把角色卡、世界书、正文全文或工具输出写成长期记忆。
4. AI 合并记忆只整理稳定事实，不负责展示 RAG 证据。

RAG 检索配置与上下文包预览拆开，避免把“全局配置”和“本轮审计”混在一起：

1. “Agent 设置 / 上下文检索配置”负责 BM25 / vector / hybrid、embedding/rerank、证据预算和向量索引重建。
2. “运行审计与上下文 / 上下文包”负责按预览对象查看策划、导演、主要角色、次要角色群或改写 AI 本轮可能收到的 `contextPack`。
3. “运行审计与上下文 / 证据调度”负责展示 Agent 本轮为什么检索档案、世界书、长期记忆、正文、审计和上下文资产。
4. “运行审计与上下文 / 工具审计”和“上下文资产”负责运行记录，不进入长期记忆页，也不承载配置保存。

行文页新增注入预览：

1. 每轮扮演记录显示导演、每个主要角色、次要角色群收到的记忆摘要。
2. 正文片段显示改写 AI 收到的记忆摘要。

### 10.6 第二阶段已落地的记忆闭环

当前实现已经补上“正文生命周期”和“AI 记忆整理”两个关键环节。这里的重点不是增加更多记忆字段，而是约束写入时机，避免草稿污染后续所有 Agent。

正文片段现在统一有三个状态：

| 状态 | 含义 | 是否进入稳定记忆 |
| --- | --- | --- |
| `draft` | 改写 AI 刚生成、等待用户审阅的草稿 | 否 |
| `accepted` | 用户确认采纳的正文 | 是 |
| `discarded` | 用户明确废弃的正文 | 否 |

旧数据中没有状态的正文按 `accepted` 读取，因为旧版生成正文时已经等同于进入项目正文。

写入规则：

1. `POST /api/novels/:id/adapt` 只生成 `draft`。
2. `POST /api/novels/:id/prose/:proseId/accept` 把正文标记为 `accepted`，并尝试触发 AI 从正文中整理长期事实。
3. `POST /api/novels/:id/prose/:proseId/discard` 把正文标记为 `discarded`，同源 AI 整理记忆会变成 `outdated`。
4. `PUT /api/novels/:id/prose/:proseId` 可以编辑正文；如果正文已采纳，会让旧 AI 整理记忆过期，再重新触发事实整理。

新增接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/novels/:id/memory/consolidate` | 调用策划槽位模型，从近期扮演和已采纳正文中整理候选长期记忆，稳定档案只作为判断背景 |
| `PUT` | `/api/novels/:id/memory/settings` | 保存上下文检索设置；接口名保留 `memory/settings`，前端入口在“Agent 设置 / 上下文检索配置” |
| `POST` | `/api/novels/:id/memory/vector/rebuild` | 使用当前 embedding 配置重建本地向量索引；前端入口同样在“Agent 设置 / 上下文检索配置” |
| `PUT` | `/api/novels/:id/prose/:proseId` | 编辑正文 |
| `POST` | `/api/novels/:id/prose/:proseId/accept` | 采纳正文 |
| `POST` | `/api/novels/:id/prose/:proseId/discard` | 废弃正文 |

世界书接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `PUT` | `/api/novels/:id/lorebook/settings` | 保存世界书扫描深度、触发条数、单条预算和递归扫描 |
| `POST` | `/api/novels/:id/lorebook/entries` | 新增世界书条目 |
| `PUT` | `/api/novels/:id/lorebook/entries/:entryId` | 修改世界书条目 |
| `DELETE` | `/api/novels/:id/lorebook/entries/:entryId` | 删除世界书条目 |
| `POST` | `/api/novels/:id/lorebook/import` | 导入常见酒馆 World Info / Lorebook JSON |
| `GET` | `/api/novels/:id/lorebook/export` | 导出当前世界书为酒馆兼容 JSON |

酒馆角色卡接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/novels/:id/tavern-card-pngs` | 批量导入 PNG 元数据角色卡 |
| `POST` | `/api/novels/:id/characters/:characterId/tavern-card-png` | 把 PNG 元数据角色卡覆盖导入到当前角色 |

导入角色卡时，酒馆 `character_book` 不再只合并进角色 `lorebook` 文本，而是同步成 `scope=private`、`ownerId=角色 id` 的独立世界书条目。这样角色 AI 仍按接近酒馆的关键词触发读取，其他角色不会因为全局检索误读到该角色私有信息。世界书支持递归扫描开关：启用后，已触发条目的正文会继续参与下一轮关键词匹配，适合地点、规则、暗号等链式设定。

AI 记忆整理只负责产出候选结构化记忆，仍然走统一 `MemoryItem` 合同。所有条目都要有状态、来源、证据和可见性，不能绕过结构化记忆层直接塞进 prompt。

采纳正文后的整理失败不会阻断采纳。原因是采纳正文是用户决策，远端模型限流或响应异常不应该导致正文无法保存；失败会记录事件，并返回 warning。

前端已经把“长期记忆维护”“跨 Agent 运行配置”和“本轮上下文审计”拆开：侧栏“长期记忆”页只支持查看统计、新增和编辑记忆项、清理旧版投影记忆、AI 整理近期记忆；检索预算、向量索引、权限和 verifier 放在“Agent 设置”页；RAG 证据调度和不同 Agent 的上下文包预览放在 AI 策划页的“运行审计与上下文”抽屉。行文页已经支持章节工作流、上下文审计、正文编辑、采纳、废弃、写后回写和改写上下文注入审查。

这个设计解决的是长篇创作中最危险的“草稿污染”。AI 改写出来的文本未必是事实，只有用户采纳后才进入稳定正文库和后续检索；长期记忆仍只保存从证据中提取出的单条事实。

### 10.7 自检

第一阶段实现必须满足：

1. 记忆不是普通备注，而是会进入实际 AI 调用。
2. 同一个记忆系统能服务策划、导演、角色、次要角色群和改写器。
3. 角色 AI 不能拿到不属于自己的私有记忆。
4. 前端能看到本次到底注入了什么，便于发现污染。
5. 不依赖外部向量库也能跑通，后续再升级 embedding、rerank 和 SQLite。
6. 草稿正文不会进入 `collectRagSources`，已采纳正文也不会被 `projectProseToMemory` 机械投影。
7. 策划和改写提示中的正文尾部只读取已采纳正文。
8. 废弃正文会让同源记忆过期。
9. 已采纳正文被编辑后会重新触发事实整理，旧整理记忆不会继续以 active 状态污染后续调用。
10. 记忆设置不影响事实真源，只影响每次注入的预算。

### 10.8 多策略记忆编排

当前实现不把策划、导演、角色、次要角色群和改写器拆成五套互不相干的 RAG。更合理的工程结构是“统一记忆底座 + 不同组包策略”：

| 任务 | 策略 | 读取重点 |
| --- | --- | --- |
| 策划 AI | `project_rag` | 用户意图、档案、旧策划对话、长文档证据和冲突提醒 |
| 导演 AI | `orchestration_rag` | 场景目标、时间线、世界规则、伏笔、角色可见状态和禁止事项 |
| 主要角色 AI | `tavern_context` | 角色卡固定层、世界书触发、角色私有/可见记忆、最近可观察历史 |
| 次要角色群 AI | `group_tavern_context` | 次要角色池、当前场景可触发世界书、可观察历史和局部信息 |
| 改写 AI | `faithful_adaptation` | 本轮扮演、最近已采纳正文尾部、文风约束和不可新增设定 |

角色扮演为什么要更接近酒馆：

1. 角色 AI 的关键不是全局最优检索，而是“这个角色现在该知道什么”。
2. 世界书关键词触发能把地点、称呼、规则、关系暗线等条件性设定放进上下文，避免每轮塞完整世界观。
3. 最近可见历史必须比远端检索更靠近角色，因为角色扮演需要承接现场互动。

策划和导演为什么不能照搬酒馆：

1. 策划 AI 需要看到用户决策和冲突状态，目标是维护档案，不是进入角色。
2. 导演 AI 需要压缩场景约束，不能被关键词触发的条目牵着走。
3. 改写 AI 要忠实处理已经发生的扮演输出，检索只能补连续性，不能覆盖角色选择。

当前代码已经接入本地向量索引、OpenAI 兼容 `/embeddings`、BM25 + vector 混合召回和重排。向量召回仍然遵守可见性过滤：主要角色不会因为向量相似度看到其他角色私有记忆，策划和导演也不会把角色扮演式关键词触发当成唯一依据。

## 11. 已落地的分层记忆与酒馆式触发

### 11.1 记忆层级

当前 `MemoryItem` 已新增 `layer`，用于表达记忆在创作系统里的角色，而不是再靠更多零散字段掩盖差异：

| layer | 写入来源 | 召回重点 |
| --- | --- | --- |
| `stable_fact` | 用户确认、档案确认、已采纳正文后的事实 | 策划、导演、改写和审查优先召回 |
| `tentative_judgment` | Agent 推测、尚未确认的判断 | 策划和审查可见，角色默认谨慎注入 |
| `character_visible` | 某角色知道、相信、误解或遗忘的内容 | 只给对应角色或可观察范围内的角色 |
| `author_memory` | 用户长期偏好、文风要求、禁写项、项目目标 | 策划和正文 Agent 优先召回 |
| `run_audit` | 写入原因、证据、替换或废弃过程 | 审计和诊断使用，不默认进入角色 prompt |
| `roleplay_state` | 扮演中的临时状态、现场关系压力 | 导演、角色和改写按本章相关性召回 |

后端会按任务偏好层级评分，例如角色扮演优先 `character_visible` 和 `roleplay_state`，正文改写优先 `stable_fact`、`author_memory` 和 `roleplay_state`，策划 Agent 才需要更完整的全局视角。

### 11.2 写入检查

写入或编辑记忆前仍要满足这些条件：

1. 有明确 `subject`、`field`、`value`，不能写整段档案或全文摘要。
2. 有 `evidence`，能说明该记忆从哪里来。
3. 有 `visibility`，避免角色知道不该知道的信息。
4. 有 `status`，冲突、暂定和过期内容不能伪装成 active 稳定事实。
5. 有 `layer`，让后续召回知道它是事实、偏好、角色可见信息还是运行审计。

普通策划对话、普通扮演轮次和普通正文草稿都不会自动变成长期记忆。只有 Agent 判断会影响后续策划、扮演、改写或审查时，才应调用工具写入。

### 11.3 世界书触发

角色扮演阶段更接近酒馆：

1. 角色卡常驻。
2. 当前场景、最近轮次、角色运行时指令和可见历史形成扫描文本。
3. 世界书按主关键词、次关键词、正则 / 模糊 / 精确匹配触发。
4. 递归扫描只在配置开启时进行。
5. 条目按 enabled、过期时间、冷却轮次、角色可见性、互斥组和覆盖关系过滤。
6. 剩余条目按优先级、预算和插入位置进入 promptSections。
7. 每轮触发日志会记录触发 query、角色、轮次、entryId、触发词、预算和插入位置。

策划 Agent 可以使用语义检索和上下文资产调度；角色 AI 则优先用酒馆式触发和可见性隔离。两者目的不同，不能混成一种检索方式。
