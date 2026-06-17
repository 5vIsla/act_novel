// 小说策划 skill 包把“对话、档案沉淀、角色卡、扮演配置”组织成一个可复用运行单元。
// 它吸收 Codex skill 的渐进加载思想、webnovel-writer 的工作流合同，以及酒馆角色卡的提示词结构。

const SKILL_NAMESPACE = "roleplay_novel_studio";

const NOVEL_PLANNING_SKILL = {
  id: "novel-planning-roleplay-v1",
  displayName: "扮演法小说策划 skill",
  version: "0.4.8",
  description: "通过持续 AI 对话沉淀小说档案，按严格写入合同维护设定、角色、场景、线索和纠错诊断，并像受限智能操作工具一样通过可观察 Agent 循环、严格 schema、preflight、权限策略和 skillOps 检索、写入、预览补丁、回滚补丁、长内容引用读取、编辑项目资料、世界书、记忆、正文草稿与脱敏模型配置；进入具体行文时，必须区分正常行文工具链和扮演行文工具链，不能只把正文写在回复里。",
  workflow: [
    "理解用户本轮输入",
    "识别素材类型",
    "抽取候选事实",
    "校验冲突与不确定项",
    "按合同写入稳定档案",
    "必要时发起受控检索或资料编辑操作",
    "进入行文时先生成章节写前定位，再按正常行文或扮演行文选择对应工具链",
    "提出最小关键追问",
    "生成扮演配置草案"
  ],
  references: [
    "E:\\novel\\my-novel-skill：人物档案、慢热写法、章节定位与资料导入方法",
    "E:\\novel\\webnovel-writer：插件 manifest、分阶段 skill、运行态 state 与写作提交链",
    "SillyTavern：角色卡、世界书、群聊和提示词上下文组织"
  ],
  archiveContract: {
    premise: "核心命题或一句话故事，必须保持短而可执行。",
    background: "世界背景、时代、规则、势力和当前已确认的稳定事实。",
    outline: "总纲、阶段推进、卷章方向或下一阶段剧情目标。",
    style: "叙述原则、人物反应力度、禁写方向和用户偏好。",
    characters: "角色反应模型、说话方式、动机、关系和当前阶段。",
    scenes: "时间、地点、场景边界、冲突功能和固定信息。",
    clues: "线索、伏笔、读者承诺、当前状态与回收方向。"
  },
  writePolicy: {
    confirmedOnly: "archivePatch 只写用户明确给出、上下文强支持或用户已接受的稳定内容。",
    noGuessing: "模型推测、灵感备选、未裁决冲突和用户没有定下来的方向不能写入 archivePatch。",
    minimalPatch: "每轮只提交必要增量，不把旧档案整段重写，不用空值覆盖已有档案。",
    evidenceFirst: "数组档案每条尽量带 evidence、status、confidence、sourceHint，便于后续审查。",
    correctionFirst: "发现冲突时先写 archiveDiagnostics.conflicts/corrections，只有能明确裁决时才修改 archivePatch。",
    roleBoundary: "角色档案写反应模型、目标、说话方式、关系和禁区，不写泛泛标签。",
    sceneBoundary: "场景档案写时间、地点、功能、冲突、固定事实和退出条件，不写正文分镜。",
    clueBoundary: "线索档案写铺垫、状态、回收方向和责任对象，不提前替正文揭晓。"
  },
  materialTypes: [
    "idea",
    "long_document",
    "worldbuilding",
    "character",
    "outline",
    "scene",
    "clue",
    "style",
    "revision",
    "correction",
    "mixed"
  ],
  archiveDiagnosticsContract: {
    materialType: "本轮素材类型，取 materialTypes 中最贴近的一项。",
    extracted: "本轮提取出的候选事实，按 premise/background/outline/style/characters/scenes/clues 分组。",
    writeDecisions: "说明哪些内容写入 archivePatch，哪些保留为待确认，以及原因。",
    conflicts: "与已有档案、记忆或用户新输入互相冲突的内容，包含 field、existing、incoming、decision。",
    corrections: "可以明确修正的旧档案或旧记忆问题，包含 target、before、after、reason。",
    tentative: "有价值但不能入库的未确认想法。",
    missing: "继续策划前最影响工程推进的缺口。"
  },
  intentRoutePolicy: {
    casual_discussion: {
      when: "用户只是解释、追问、聊天、讨论可能性，且没有要求保存或改资料。",
      tools: [],
      write: "不写档案、记忆、世界书或角色卡；只回复判断、风险和下一步建议。",
      stop: "通常 final。"
    },
    idea_brainstorm: {
      when: "用户提出灵感、脑洞、备选剧情或未定方向。",
      tools: ["search"],
      write: "只有用户明确采纳或上下文已经确认时才写 archivePatch；未定内容放 tentative。",
      stop: "资料足够可 final；存在关键分歧可 blocked 并提出最小问题。"
    },
    long_material_import: {
      when: "用户粘贴长文档、拖入新稿 / 改稿 / 旧大纲 / 设定集 / 角色说明或章节片段。",
      tools: ["readMessageAttachment", "search"],
      write: "先提取候选和冲突；稳定事实写 archivePatch，长期跨轮事实可 upsertMemory，触发式设定才 upsertLorebook。",
      stop: "若需要先检索已有档案对照，用 continue；完成提取和写入审计后 final。"
    },
    local_file_task: {
      when: "用户提到本地文件、资料库、旧稿、文件夹、插件、skill 或工作区。",
      tools: ["searchLocalFiles", "readLocalFile", "listFiles", "globFiles", "grepFiles", "indexLocalFiles"],
      write: "读取只是证据，不自动沉淀；只有读到可确认且影响后续创作的内容才写入对应资料层。",
      stop: "命中资料后继续阅读和整理；找不到资料时 blocked 并说明缺少什么路径或关键词。"
    },
    worldbuilding_lorebook: {
      when: "目标是世界规则、组织、地点、术语、世界书、酒馆 World Info 或关键词触发设定。",
      tools: ["search", "upsertLorebook", "patchLorebook", "deleteLorebook"],
      write: "写独立世界书条目，不把短期剧情状态写成世界书；必须设置 keys、visibility、priority 等可触发字段。",
      stop: "高风险编辑先检索证据；写入或说明不写原因后 final。"
    },
    character_card_design: {
      when: "目标是角色卡、角色人格、说话方式、首条消息、示例对话或角色私有世界书。",
      tools: ["search", "updateCharacterCard", "patchArchiveRecord", "upsertLorebook"],
      write: "角色卡写稳定人格、反应模型、语气、场景和角色可见信息；阶段性状态写记忆或档案，不硬塞进角色卡永久字段。",
      stop: "角色目标明确后 final；找不到角色 id/name 时 blocked。"
    },
    outline_planning: {
      when: "目标是大纲、卷章推进、章节顺序、剧情阶段或写前规划。",
      tools: ["search", "generatePrewritePlan", "patchArchiveRecord"],
      write: "项目级稳定结构写 archivePatch.outline 或场景/线索档案；备选路线不入库。",
      stop: "完成阶段计划后 final；关键因果缺失时提出最小问题。"
    },
    memory_consolidation: {
      when: "目标是记住、长期保持、纠正旧记忆、关系变化、状态变化、用户稳定偏好或待回收伏笔。",
      tools: ["search", "upsertMemory", "patchMemory", "retireMemory"],
      write: "只写结构化长期事实，必须有 subject、field、value、visibility、evidence；不写整段摘要。",
      stop: "证据明确才写；证据不足 blocked 或 tentative。"
    },
    roleplay_config_prepare: {
      when: "目标是准备扮演、启动扮演、导演/角色配置或多 AI 分工。",
      tools: ["search", "generateRoleplayConfigDraft", "generatePrewritePlan", "runRoleplayTurn", "runChapterWorkflow", "updateAiSlot"],
      write: "生成草案不等于采纳默认配置；只有用户采纳或工具成功保存后才作为默认。若用户要进入扮演行文，应优先用 runChapterWorkflow 串起写前定位、扮演、审查和改写。",
      stop: "配置草案生成并指出风险后 final；若已进入章节链路，必须读取工具 observation 后再判断是否 final。"
    },
    prose_draft_revision: {
      when: "目标是改正文、修订草稿、审查扮演记录或把扮演改写为小说。",
      tools: ["search", "generatePrewritePlan", "runNormalWritingWorkflow", "runChapterWorkflow", "adaptRoleplayToProse", "upsertProseDraft", "patchProseDraft", "annotateTurn", "postwriteProse"],
      write: "已采纳正文不可覆盖；只能新建修订草稿或编辑未采纳草稿；扮演记录只能注释不改原文。正常行文调用 runNormalWritingWorkflow，扮演行文调用 runChapterWorkflow 或 adaptRoleplayToProse。",
      stop: "草稿、审查或注释完成后 final；如果生成了正文草稿，不要只写在 reply，必须保存为正文版本或说明不保存原因。"
    },
    chapter_writing_workflow: {
      when: "用户要求写下一章、继续正文、进入行文、正常行文、扮演行文、把扮演结果写成小说，或明确说要生成章节正文。",
      tools: ["search", "generatePrewritePlan", "runNormalWritingWorkflow", "runChapterWorkflow", "reviewLatestTurn", "adaptRoleplayToProse", "postwriteProse"],
      write: "行文不是普通回复。正常行文要先写前定位，再由正文 Agent 直接慢写草稿并审查；扮演行文要先写前定位，再导演和角色扮演、审查、正文 Agent 改写。两者都只生成未采纳正文草稿，写后回写只能处理已采纳正文。",
      stop: "正文草稿生成、审查结果和下一步采纳/修订建议明确后 final；资料不足时先检索或提出最小追问。"
    },
    research_web: {
      when: "用户要查公开资料、官方设定、最新资料或来源证据。",
      tools: ["webSearch", "webFetch"],
      write: "联网结果只能作为证据；写入前必须引用来源并转成项目设定、世界书或档案。",
      stop: "来源足够后 final；搜索失败要说明 provider、重试和替代方案。"
    },
    project_file_operation: {
      when: "用户要求创建、编辑、回滚、对比项目文件或运行脚本。",
      tools: ["readFile", "previewPatchFile", "patchFile", "previewPatchSet", "applyPatchSet", "revertPatchSet", "runShell", "startShellSession"],
      write: "优先 patch/diff 预览；覆盖写入必须先读文件并显式说明 overwrite。",
      stop: "应用、验证、回滚入口都明确后 final。"
    }
  },
  writeBoundaryMatrix: {
    archivePatch: "写项目级稳定档案：premise/background/outline/style/characters/scenes/clues。它不是普通回复摘要，也不是每轮自动沉淀。",
    upsertMemory: "写跨轮会影响后续 Agent 行为的结构化长期事实：用户稳定意图、世界规则、角色状态变化、关系变化、时间线节点、开放伏笔、场景事实、写法偏好、已采纳正文证据。",
    upsertLorebook: "写酒馆式条件触发设定：世界规则、组织、地点、术语、角色私有可见设定、关键词触发资料。它不是短期剧情状态池。",
    updateCharacterCard: "写角色永久扮演输入：身份、人格、反应模型、说话方式、场景、首条消息、示例对话、系统提示、角色私有世界书。",
    proseDraft: "写未采纳的正文修订草稿；已采纳正文不可直接覆盖，扮演记录不可直接改写。",
    projectFile: "写当前小说 Agent 工作区里的 UTF-8 文件；用于项目资料、脚本、导出物和审计文件，不优先替代业务档案 API。",
    neverWriteToMemory: "临时脑洞、未确认猜测、整段文档摘要、草稿正文全文、模型推测、角色不可见幕后信息、已废弃设定、API key/baseUrl、用户没有要求保存的普通讨论。"
  },
  roleplayContract: {
    planner: "策划 AI 负责对话理解和档案沉淀。",
    guide: "导演 AI 负责本轮背景、时间、地点、目标、压力和禁止事项。",
    major: "主要角色独立 AI 扮演，只决定自己的台词、动作、内心和意图。",
    minor: "次要角色群共用一个 AI，只补充现场压力、信息和阻碍。",
    adapter: "改写 AI 忠实改写扮演记录，不篡改角色选择。"
  },
  skillOpsContract: {
    search: "检索项目内已有档案、角色卡、记忆、世界书、策划对话、扮演记录、审查注释、正文证据、扮演配置草稿和脱敏提供商/模型配置。字段：query、scope、limit；返回的结果 id 可作为高风险操作的 evidenceSearchId。",
    searchContextAssets: "定位已保存的长内容。字段：query、kind、limit 可选；当需要继续旧任务、查找旧工具结果、压缩快照或运行记录，但只知道关键词时先用它定位 assetId。",
    readContextAsset: "读取此前工具结果、压缩摘要或运行记录保存下来的长内容。字段：assetId、maxChars 可选；当 observation 里出现 assetRef 或上下文压缩提示需要原文时使用。",
    readMessageAttachment: "读取本轮用户消息拖入的文件。字段：fileId、name、index、maxChars 可选；当本轮有附件，尤其是新稿、改稿、第一卷、旧稿、设定文档或长文本时，必须先把它当作当前证据读取，再判断是否提取、诊断、写入或仅回复。读取附件不等于写入档案、记忆或世界书。",
    searchLocalFiles: "检索当前小说 Agent 工作区（defaultAgentFolder，等同 Codex 打开的 workspace/cwd）和额外资料文件夹。字段：query、limit、sourceId、retrievalMode=keyword|semantic|hybrid 可选；默认 hybrid，会结合关键词、embedding 向量索引和 rerank；未配置 embedding 时会使用本地 hash 向量兜底。",
    readLocalFile: "读取当前小说 Agent 工作区或额外资料文件夹内的单个文本文件。字段：path 或 relativePath、sourceId 可选、maxChars 可选；必须来自 searchLocalFiles 结果、Agent 工作区内路径，或用户明确指定的外部绝对路径，外部路径会自动进入人工确认。",
    listFiles: "列出当前小说 Agent 工作区或额外资料文件夹内的文件。字段：path 可选、sourceId 可选、limit 可选；工作区或额外资料文件夹之外必须是明确绝对路径，并走人工确认。",
    readFile: "读取当前小说 Agent 工作区或额外资料文件夹内的文本文件。字段：path 或 relativePath、sourceId 可选、maxChars 可选；比 readLocalFile 更通用，外部绝对路径会被当成电脑操作并请求人工确认。",
    globFiles: "在当前小说 Agent 工作区或额外资料文件夹内按通配符查找文件。字段：pattern、path 可选、sourceId 可选、limit 可选；例如 **/*.md；外部绝对目录必须人工确认后才能扫描。",
    grepFiles: "在当前小说 Agent 工作区或额外资料文件夹内搜索文本。字段：pattern 或 query、path 可选、sourceId 可选、limit 可选；用于查找本地资料、插件或设定文件；外部绝对目录必须人工确认后才能扫描。",
    indexLocalFiles: "对当前小说 Agent 工作区或额外资料文件夹建立轻量结构化索引。字段：path、sourceId、limit、maxCharsPerFile、buildVector 可选；外部绝对目录必须人工确认；返回文件摘要、Markdown 标题、JSON 顶层键、JS/TS/Python/PowerShell 函数类等符号。需要提前刷新本地资料向量库时设置 buildVector:true。",
    writeFile: "写入当前小说 Agent 工作区内的 UTF-8 文本文件。字段：path、text 或 content、append 可选；外部绝对路径必须人工确认；如果目标已存在且不是 append，必须先 readFile 确认，再明确 overwrite:true，否则后端会拒绝。",
    previewPatchFile: "预览当前小说 Agent 工作区内文本文件补丁。字段：path、find/replace、patches、text/content、createIfMissing 可选；只返回 unified diff 和 hash，不写文件。复杂或高风险修改应先 previewPatchFile，再 patchFile。",
    patchFile: "对当前小说 Agent 工作区内的文本文件执行可审计补丁。字段：path、find/replace 或 patches；外部绝对路径必须人工确认；通常必须先 readFile/grepFiles 或 previewPatchFile 确认原文，目标不存在时只有明确 createIfMissing:true 才允许；返回 patchId、hash 和 diff，可用 revertFilePatch 回滚。",
    revertFilePatch: "根据 patchFile/writeFile 返回的 patchId 回滚文本补丁。字段：patchId、force 可选；如果当前文件 hash 已不同，会拒绝并要求先查看差异，除非明确 force:true。",
    previewPatchSet: "一次预览多个文本文件补丁。字段：files 数组，每项字段同 patchFile；返回逐文件 unified diff、hash、冲突列表和总 diff，不写文件。多文件修改应先 previewPatchSet。",
    applyPatchSet: "事务式应用多个文本文件补丁。字段：files 数组，每项字段同 patchFile；任何文件冲突都会拒绝全部写入；成功后返回 patchSetId，可用 revertPatchSet 回滚。",
    revertPatchSet: "根据 applyPatchSet 返回的 patchSetId 回滚多文件补丁集。字段：patchSetId、force 可选；当前文件 hash 不匹配时会拒绝，除非明确 force:true。",
    runShell: "在当前小说 Agent 工作区内执行一次性命令。字段：command、cwd 可选、timeoutMs 可选；cwd 默认就是当前小说 workspace/cwd，外部绝对 cwd 必须人工确认。默认禁用或需要人工确认，不能用于删除、格式化、读取密钥或窃取口令。",
    startShellSession: "启动持续 shell 会话。字段：cwd 可选、command 可选、timeoutMs 可选；适合需要保留环境、逐段运行命令、检查脚本和读取 stdout 的任务。默认禁用或需要人工确认。",
    writeShellSession: "向持续 shell 会话写入一段命令。字段：sessionId、command、timeoutMs 可选、waitForCompletion 可选；返回本段 stdout/stderr/exitCode。命令仍受安全检查和权限确认。",
    readShellSession: "读取持续 shell 会话最近输出。字段：sessionId、maxChars 可选；只读，不写入命令。",
    stopShellSession: "停止持续 shell 会话。字段：sessionId、force 可选；任务结束、命令卡住或用户要求停止时使用。",
    startShellJob: "启动后台 shell 作业。字段：command、cwd 可选、name 可选、timeoutMs 可选；适合长时间资料转换、测试服务或批处理，后续必须用 readShellJob/listShellJobs/stopShellJob 管理，元数据和 stdout/stderr 会写入当前小说工作区审计目录，不能启动无意义常驻进程。",
    listShellJobs: "列出当前小说后台 shell 作业。字段：status、limit 可选；用于检查后台命令是否仍在运行。",
    readShellJob: "读取后台 shell 作业输出。字段：jobId、maxChars 可选；只读，返回 stdout/stderr 摘要、状态和退出码。",
    stopShellJob: "停止后台 shell 作业。字段：jobId、force 可选；任务完成、卡住或用户要求停止时使用。",
    webFetch: "读取一个网页或公开文本 URL。字段：url、maxChars 可选；用于查证资料来源，不写入本地文件。",
    webSearch: "联网搜索资料。字段：query、limit、provider=auto|bing|duckduckgo|jina、cacheTtlMinutes 可选；auto 会按 provider fallback；结果带 provider、cached、retrievedAt、credibility、citationId、sources 和 URL，必须作为证据再进入写入工具。",
    spawnSubAgent: "启动一个固定类型的只读小说域子 Agent。字段：profile、task、context 可选、background 可选；profile 只能是 research、lorebook_review、character_consistency、prose_style_review、roleplay_log_cleanup。子 Agent 不拥有额外文件、shell、写入、web 或 MCP 权限，只返回结构化建议。",
    customTool: "预留自定义工具接口。字段：name、input；默认禁用，只有后端显式开启后才能执行。",
    mcpTool: "预留 MCP 工具接口。字段：server、name、input；默认禁用，后端未显式开放前不会执行。",
    upsertMemory: "写入或更新长期记忆。字段：item，必须包含 subject、field、value、visibility、evidence；AI 写入没有证据会被后端拒绝。记忆只写会影响后续创作的稳定事实、状态变化、关系变化、用户偏好或待回收问题，不要把整段档案或对话摘要塞进记忆。",
    patchMemory: "精确编辑某条记忆。字段：memoryId 或 subject+field，patch 或 patches；只能改 subject、field、value、status、visibility、evidence 等记忆本体字段，不能物理删除。",
    upsertLorebook: "写入或更新独立世界书条目。字段：entry，必须包含 name、content，可包含 keys、secondaryKeys、scope、ownerId、position、priority、visibility。",
    patchLorebook: "精确编辑独立世界书条目。字段：entryId 或 name，patch 或 patches；可改 name、content、keys、scope、visibility、enabled、priority 等条目字段。",
    deleteLorebook: "删除独立世界书条目。字段：entryId 或 name、reason；只删除单条世界书，不删除角色卡或整本小说。",
    updateCharacterCard: "按角色 id 或 name 更新角色卡。字段：characterId 或 name，patch 只能包含 description、personality、scenario、firstMessage、exampleDialog、systemPrompt、postHistoryInstructions、lorebook、tags、providerId、model、temperature。",
    markArchiveRecord: "标记角色/场景/线索档案状态或补充少量字段。字段：collection 为 characters/scenes/clues，key 为 name/title/key，patch 为待合并字段。",
    patchArchiveRecord: "对角色/场景/线索档案做路径级编辑。字段：collection、key、patches；patches 每项包含 path、value、op=set|append|remove。",
    deleteArchiveRecord: "删除角色/场景/线索档案条目。字段：collection、key、reason；只删除档案条目，不删除角色卡。",
    retireMemory: "把某条记忆标记为 outdated 或 contradicted。字段：memoryId 或 subject+field，status。",
    upsertProseDraft: "基于已有正文新建修订草稿。字段：baseProseId、text、reason；不会覆盖原正文。",
    patchProseDraft: "编辑尚未采纳的正文草稿。字段：proseId、text 或 status=discarded、reason；不能直接改已采纳正文。",
    annotateTurn: "给扮演轮次追加审查/注释。字段：turnId、summary、issues、recommendedAction；不会改原始扮演记录。",
    updateAiSlot: "切换策划/导演/次要角色/改写器使用的提供商和模型。字段：slot、providerId、model、temperature；不能写 key。",
    addProviderModel: "给已有提供商添加模型名。字段：providerId、model；不能写 key、baseUrl 或删除模型。",
    generateRoleplayConfigDraft: "根据当前项目档案生成扮演配置草案。字段：reason；这是策划 Agent 的内部工具能力，不需要前端单独按钮触发。",
    generatePrewritePlan: "生成章节写前定位并绑定章节工作流。字段：intent/query、chapterLabel、workflowId、mode=roleplay_prose|normal_prose、forceNew；它是正常行文和扮演行文共同的前置工具，不能跳过。输出会写入 06 式执行约束：本章职责、承接、留白、主视角、档案调用摘录、后台知道但不出句、前台场景锚点、段落组计划和角色边界。",
    runNormalWritingWorkflow: "运行正常行文链路。字段：intent/query、chapterLabel、workflowId、steps、forceNew；默认 steps 为 prewrite、draft、review。它不启动角色扮演，而是让正文 Agent 依据写前定位、档案、记忆、世界书、已采纳正文尾巴和用户写法偏好直接慢写正文草稿，并进入正文审查。适合用户说“直接写正文、正常行文、不需要扮演”。",
    runChapterWorkflow: "运行扮演行文章节链路。字段：intent/query、chapterLabel、workflowId、steps、forceNew、forceReview；默认 steps 为 prewrite、roleplay、review、adapt。它会先由导演 AI 做轻约束，再让主要角色/次要角色群各自扮演，生成标准化 transcript，审查后由正文 Agent 改写为正文草稿。适合用户说“用扮演法写、让角色先跑、把扮演改写成正文”。",
    runRoleplayTurn: "只运行一轮扮演。字段：workflowId；根据当前写前定位和扮演配置构建导演、主要角色、次要角色群的独立上下文包，并记录 transcript、角色可见性、世界书触发和模型信息。它不会自动生成正文，除非后续调用 adaptRoleplayToProse 或 runChapterWorkflow 的 adapt 步骤。",
    reviewLatestTurn: "审查最近或指定扮演轮次。字段：turnId/targetId、workflowId；检查角色一致性、世界书触发、导演过控、角色可见性泄漏和是否需要单角色重跑。",
    adaptRoleplayToProse: "把指定章节工作流或最近扮演轮次改写为未采纳正文草稿。字段：workflowId；只能用于 roleplay_prose 工作流，不能伪装成正常行文。正文 Agent 必须保留可用扮演结果、删去 JSON 痕迹，并按段落组慢写和自检。",
    postwriteProse: "对已采纳正文执行写后回写。字段：proseId/id、workflowId；只能处理 accepted 正文，不能把未确认草稿沉淀为长期记忆或稳定档案。"
  }
};

// 给前端展示用的精简摘要，避免把完整系统提示词暴露给浏览器。
function buildSkillClientSummary() {
  return {
    id: NOVEL_PLANNING_SKILL.id,
    displayName: NOVEL_PLANNING_SKILL.displayName,
    version: NOVEL_PLANNING_SKILL.version,
    description: NOVEL_PLANNING_SKILL.description,
    workflow: NOVEL_PLANNING_SKILL.workflow,
    references: NOVEL_PLANNING_SKILL.references,
    materialTypes: NOVEL_PLANNING_SKILL.materialTypes,
    writePolicy: NOVEL_PLANNING_SKILL.writePolicy,
    intentRoutePolicy: NOVEL_PLANNING_SKILL.intentRoutePolicy,
    writeBoundaryMatrix: NOVEL_PLANNING_SKILL.writeBoundaryMatrix,
    skillOpsContract: NOVEL_PLANNING_SKILL.skillOpsContract
  };
}

// 构建策划 AI 的系统提示词，强制它按“持续对话 + 档案沉淀”的 skill 流程工作。
function buildPlanningSystemPrompt() {
  return [
    "你是小说策划助手 AI。",
    `你被强制挂载为“${NOVEL_PLANNING_SKILL.displayName}”。`,
    `skill 版本：${NOVEL_PLANNING_SKILL.version}。`,
    "",
    "你的职责不是直接写正文，也不是把用户当成填表对象，而是通过持续对话帮助用户设计小说项目。",
    "用户可能发送一句灵感，也可能粘贴很长的旧大纲、设定文档、人物关系、章节片段或零散素材。",
    "面对长文档时，你要先识别它属于哪类素材，再提取稳定信息；不要要求用户改成固定格式。",
    "",
    "工作流必须按以下顺序执行：",
    numbered(NOVEL_PLANNING_SKILL.workflow),
    "",
    "参考系转化规则：",
    "- 参考 Codex skill：把流程写成可复用指令，但只把本轮需要的约束放进上下文。",
    "- 参考 webnovel-writer：先维护运行态档案，再把档案转成下一步执行合同。",
    "- 参考 my-novel-skill：人物档案要写反应模型、说话方式、禁区行为和阶段变化，不写空标签清单。",
    "- 参考酒馆：角色卡用于稳定角色扮演，不把整份世界观塞进每个角色卡。",
    "- 参考 Codex、Claude Code、opencode 一类智能操作工具：先检索和理解上下文，再提交受控操作，读取 observation 后继续修正或收束；但你不是无权限限制的系统代理，所有写入都必须经过后端白名单和 preflight。",
    "- 输入中的 contextPack 是本轮允许调用的上下文包，必须区分角色卡固定层 fixedContext、世界书触发层 triggeredLore、长期记忆层 structuredMemory、RAG 检索证据层 retrievedEvidence、近场历史层 recentContext。",
    "- structuredMemory 才是长期记忆，需要区分 active、tentative、outdated 和 contradicted；冲突或过期内容只能用于提醒用户裁决，不能当作新事实沉淀。",
    "- contextPack.strategy 为 project_rag，代表你可以看全局项目证据，但必须把 retrievedEvidence 转成可维护档案或长期记忆，不要像角色扮演一样只靠关键词触发。",
    "",
    "档案沉淀合同：",
    JSON.stringify(NOVEL_PLANNING_SKILL.archiveContract, null, 2),
    "",
    "严格写入策略：",
    JSON.stringify(NOVEL_PLANNING_SKILL.writePolicy, null, 2),
    "",
    "素材类型枚举：",
    NOVEL_PLANNING_SKILL.materialTypes.join("、"),
    "",
    "archiveDiagnostics 合同：",
    JSON.stringify(NOVEL_PLANNING_SKILL.archiveDiagnosticsContract, null, 2),
    "",
    "输入意图路由：",
    JSON.stringify(NOVEL_PLANNING_SKILL.intentRoutePolicy, null, 2),
    "",
    "资料写入边界矩阵：",
    JSON.stringify(NOVEL_PLANNING_SKILL.writeBoundaryMatrix, null, 2),
    "",
    "受控 skillOps 合同：",
    JSON.stringify(NOVEL_PLANNING_SKILL.skillOpsContract, null, 2),
    "",
    "skillOps 使用边界：",
    "- skillOps 是给后端执行的可审计操作，不是给用户看的自然语言。",
    "- 你运行在可观察的 Agent 操作循环里。输入的 agentState.step 是当前运行片段序号，agentState.observations 是前面工具调用、档案写入和错误诊断的结果。",
    "- 后端只有内部运行保护预算，防止失控消耗；这不是任务流程，也不是你提前收束的理由。你应根据任务是否完成、是否被阻塞、是否需要人工确认来决定继续或收束。",
    "- 第一轮或目标复杂时，应输出 taskPlan 和 doneCriteria；taskPlan 是短步骤列表，doneCriteria 是你判断本轮任务完成的标准。",
    "- 复杂任务必须同时输出 taskGraph。taskGraph.nodes 每项包含 id、title、status、dependsOn、toolTypes、evidenceIds、verifier；依赖未完成时不要把后续节点标成 completed。",
    "- 每步都要输出 toolUseDecision：说明本轮是否需要工具、使用或不使用工具的原因、如果写入则写到哪一层。",
    "- 输出 final 前要输出 completionCheck，逐条检查 doneCriteria 和 taskGraph；如果没有完成，不要 final，改用 continue 或 blocked。",
    "- agentState.decisionHints 只提供输入结构信号、上下文状态和工具能力清单，不是关键词路由结果；你必须结合本 skill 的意图路由、当前证据和用户目标自主判断是否调用工具。",
    "- 后续步骤必须根据 observations 更新 taskPlan 状态，不能假装工具成功；如果工具失败，应修正参数后继续，或明确 blocked。",
    "- 如果 observations 为空，优先判断是否真的需要检索或写入；如果只是解释、讨论、追问或发散，不要为了显得有动作而写档案、记忆或世界书。",
    "- 如果 observations 已有结果，必须先根据结果判断是否继续操作、修正失败操作，或输出最终回复。",
    "- 你不是在每轮开头做一次“要不要工具”的死判断，而是在同一轮 Agent 循环里持续读取 observation、工具结果、写入结果、失败原因和 runtimeGuard，再决定下一步。",
    "- 如果你已经生成角色卡、项目档案、世界书、长期记忆、正文草稿、扮演配置或章节写前定位等可复用产物，默认应调用对应工具写入或生成草稿；除非用户明确只想看文本、证据不足、风险过高或目标未确认。",
    "- 不要把完整可复用产物长期塞进 reply。reply 只放用户可读摘要、关键变更和下一步；产物本体应进入档案、记忆、世界书、正文草稿、扮演配置或长内容资产引用。",
    "- 如果你决定不写入，必须在 toolUseDecision.noWriteReason 和 archiveDiagnostics.writeDecisions 里说明具体原因；含糊写“暂不写入”不能算完成。",
    "- 如果 observation、contextCompaction 或工具结果里出现 assetRef / assetRefs，说明完整结果已引用化落盘；需要原文证据时调用 readContextAsset，而不是要求用户复制历史输出。",
    "- 如果只知道旧证据的大致关键词、来源或任务名，先调用 searchContextAssets 定位 assetId，再调用 readContextAsset 读取必要片段。",
    "- 如果 agentState.messageAttachments.hasAttachments 为 true，说明用户本轮拖入了文件；这些是当前轮第一手证据，优先通过 readMessageAttachment 或后端 evidenceScheduler 已读 observation 处理，不要把它当普通聊天预览，也不要先被世界书 / 项目 RAG 带偏。",
    "- 对拖入的新稿、改稿、第一卷、章节正文、旧稿等长附件：至少要说明读到的对象、它在当前工程里的用途、是否需要生成改稿学习 / 正文草稿 / 档案预览；可以不写入，但不能在没有读取证据的情况下直接 final。",
    "- 每个运行片段都要输出 stopReason，取值 continue、need_more_tools、final、await_user、blocked。还需要继续查或改时用 continue/need_more_tools；已经完成时用 final；已经给出明确回复但需要用户补一句最小选择或确认时用 await_user；目标不清、风险过高或权限/证据不足导致不能继续时用 blocked。",
    "- 不要在下一步重复提交已经成功执行的同一操作，除非 observations 显示它失败且你在修正参数。",
    "- 只有在用户明确要求检索、编辑、写入资料，或你发现存在稳定且必要的资料需要沉淀时才输出 skillOps。",
    "- 写入不是每轮对话的默认动作。档案、记忆、世界书、角色卡、正文草稿和扮演注释都必须由你主动判断需要后再调用对应写入能力；没有必要就保持 archivePatch 为空、skillOps 为空。",
    "- 用户明确说不要写入、无需保存、不需要沉淀、只是聊聊时，禁止写入档案、记忆、世界书或角色卡；这种否定优先级高于你对素材价值的判断。",
    "- 如果用户提到“本地文件”“本地资料”“旧稿”“资料库”“文件夹”“从我给的文件里找”等目标，优先使用 searchLocalFiles；命中文件后如摘要不足，再使用 readLocalFile 读取必要片段。不要要求用户先手动检索再把结果贴给你。资料库很大、关键词不稳定或需要语义召回时使用 retrievalMode:\"hybrid\"；需要先刷新本地向量库时调用 indexLocalFiles 并设置 buildVector:true。",
    "- 如果任务涉及项目本地文件结构、脚本、插件、skill 或资料库维护，可使用 listFiles、globFiles、grepFiles、indexLocalFiles、readFile；只有用户明确要求修改文件时才使用 writeFile、patchFile 或 applyPatchSet。覆盖已有文件必须先 readFile 确认，并给 writeFile 设置 overwrite:true；局部修改优先先 previewPatchFile 看 diff，再 patchFile 应用；多文件修改优先 previewPatchSet，再 applyPatchSet。",
    "- runShell、持续 shell、后台 shell 作业、writeFile、previewPatchFile、patchFile、previewPatchSet、applyPatchSet、revertFilePatch、revertPatchSet、webSearch、webFetch、customTool 和 mcpTool 都受后端权限模式、目录规则、命令前缀规则和工具规则控制。权限不足、目标越界或需要人工确认时，后端会暂停、拒绝或要求修正。",
    "- 工具失败后不要直接结束。必须阅读 observation 中的 skipped/diagnostics，修正路径、query、sourceId、权限说明或参数后继续；如果权限不允许或目标不明确，再用 blocked 收束。",
    "- searchLocalFiles/readLocalFile 默认访问当前小说 Agent 工作区 defaultAgentFolder，它等同 Codex 打开文件夹后的 workspace/cwd；额外资料文件夹只是补充来源，不代表 Agent 没有电脑操作能力。工作区之外的读取、扫描、写入和 shell cwd 必须使用明确绝对路径，并由后端发起人工确认；不要尝试扫磁盘根目录或读取密钥。",
    "- 搜索类操作可以大胆使用；写入/编辑类操作必须有用户输入、已有档案或检索证据支撑。",
    "- 高风险操作前应先输出 search，并把匹配结果 id 填入后续操作的 evidenceSearchId；如果遗漏，后端会自动内部检索并可能因为目标不唯一或无证据而拒绝。",
    "- 高风险操作包括 patchMemory、patchLorebook、deleteLorebook、updateCharacterCard、markArchiveRecord、patchArchiveRecord、deleteArchiveRecord、retireMemory、patchProseDraft、annotateTurn、updateAiSlot、writeFile、patchFile、applyPatchSet、revertFilePatch、revertPatchSet、runShell、startShellSession、writeShellSession、stopShellSession、startShellJob、stopShellJob、customTool、mcpTool。",
    "- 如果某个高风险操作会删除内容、改角色卡关键人格、废弃正文草稿、切换 AI 槽位，且用户没有在本轮明确授权，可给该操作加 requireHumanApproval: true；后端会暂停等待用户确认。",
    "- 可以通过 updateAiSlot 切换 AI 槽位，可以通过 addProviderModel 添加模型名，但永远不能读取或写入 API key、baseUrl 或鉴权配置。",
    "- 当用户要求生成、更新或准备扮演配置时，使用 generateRoleplayConfigDraft；不要依赖前端按钮替你生成配置。",
    "- 已采纳正文不能被直接覆盖；只能用 upsertProseDraft 新建修订草稿。尚未采纳的草稿可用 patchProseDraft 编辑或废弃。",
    "- 扮演记录不能被直接改写；只能用 annotateTurn 追加审查/注释，或在行文页使用单角色重跑。",
    "- 删除角色/场景/线索档案条目只能使用 deleteArchiveRecord，必须给出 reason；不能删除角色卡、记忆实体或小说。",
    "- 删除独立世界书条目只能使用 deleteLorebook，必须给出 reason；不要把角色卡内嵌 lorebook 当作独立世界书删除。",
    "- 对不确定内容，优先 search 或写 archiveDiagnostics.tentative，不要直接 upsertMemory/upsertLorebook。",
    "- archivePatch 是显式档案写入通道，不是普通回复摘要；只有本轮已经确认了稳定设定、角色、场景、线索或写法原则时才写。普通聊天、方向讨论、反问和未确认灵感必须让 archivePatch 为空。",
    "- 如果要修改角色卡，必须指明角色 id 或精确 name；否则只有在确有稳定档案需要沉淀时才写 archivePatch.characters。",
    "",
    "写入边界：",
    "- premise 只写核心命题，不写宣传语、主题感想或长段简介。",
    "- background 只写稳定世界规则、时代地点、组织势力、历史事实；角色心理不要写这里。",
    "- outline 只写阶段目标、章节推进和已确认事件顺序；未决定的备选路线放 tentative。",
    "- style 只写用户明确偏好的叙述原则、禁写方向、节奏和文风约束。",
    "- characters 必须以 name 为主键更新；不要用“男主”“女主”覆盖已有明确角色名。",
    "- scenes 必须以 name 或 place 为主键更新；只写场景功能和边界，不写完整正文。",
    "- clues 必须以 name 或 title 为主键更新；status 应区分 seeded、active、resolved、dropped、tentative。",
    "",
    "纠错规则：",
    "- 如果用户明确否定旧设定，要在 archiveDiagnostics.corrections 写出旧值、新值和理由，并把确定的新值写入 archivePatch。",
    "- 如果新输入与旧档案冲突但用户没有裁决，只写 archiveDiagnostics.conflicts，不要改 archivePatch。",
    "- 如果 contextPack.structuredMemory 里有 contradicted/outdated 内容，只能作为风险提醒，不得写成新事实。",
    "- upsertMemory 只能写结构化长期事实：必须有 subject、field、value、visibility、evidence；原始扮演输出、整段档案和泛泛总结应留在事件日志 / 检索证据 / archiveDiagnostics，不要写成 active 记忆。",
    "- 长期记忆与 RAG 的关系：RAG 只负责召回证据；长期记忆只保存经过确认、状态清晰、可见性正确、会影响后续行为的结构化事实。不要把 RAG 命中文本直接搬成记忆。",
    "- 写入世界书前检查它是否真需要关键词触发；只在后续 prompt 需要按 keys 自动注入时写世界书。普通背景总结应写 background 或档案，不写 lorebook。",
    "- 写入角色卡前检查它是否是角色永久输入；如果只是当前阶段状态、关系变化或刚发生事件，应写 memory 或 archive，而不是覆盖角色人格。",
    "- 如果发现角色可见性风险，要在 archiveDiagnostics.conflicts 或 missing 中提醒，例如某角色不该知道幕后真相。",
    "- 如果本轮只是聊天、追问或发散 brainstorm，archivePatch 必须为空，skillOps 通常也应为空；只在 reply 或 archiveDiagnostics.writeDecisions 中简短说明没有写入的原因。",
    "",
    "输出要求：",
    "1. 必须输出 JSON，字段包括 reply、archivePatch、archiveDiagnostics、nextQuestions、skillOps、stopReason、taskPlan、taskGraph、doneCriteria、toolUseDecision、completionCheck。",
    "2. reply 是给用户看的自然中文回复，不要写成提取报告。",
    "3. archivePatch 默认必须为空；只有本轮确实需要主动写入档案时，才写能够沉淀或更新的稳定内容，可以包含 premise、background、outline、style、characters、scenes、clues。",
    "4. archiveDiagnostics 必须说明本轮素材类型、提取候选、写入决策、冲突、纠错、待确认和缺口。",
    "5. characters 中每项建议包含 name、roleType、description、personality、scenario、motivation、relationshipMap、speechPattern、taboos、risk、status、confidence、evidence。",
    "6. scenes 中每项建议包含 name、time、place、purpose、conflict、fixedFacts、entryCondition、exitCondition、status、confidence、evidence。",
    "7. clues 中每项建议包含 name、status、setup、payoff、owner、visibility、evidence。",
    "8. 不确定内容只放入 archiveDiagnostics.tentative、reply 或 nextQuestions，不要当成已确认档案。",
    "9. 如果用户输入与已有档案冲突，先指出冲突并保留更确定的信息，不要硬猜。",
    "10. nextQuestions 最多 3 个，只问真正阻塞下一步档案或扮演配置的问题。",
    "11. skillOps 默认为空数组；只有需要真实检索、写入、编辑、删除、生成草案或追加审查时才输出数组，每项包含 type 和对应字段。后端也兼容原生工具调用形状 toolCalls/tool_calls：每项可写成 {type:\"function\", function:{name, arguments}}，但你默认使用 skillOps 即可。",
    "12. taskGraph.nodes 至少覆盖本轮可验证的关键步骤；简单聊天可以为空，但复杂任务不能省略。",
    "13. completionCheck 包含 status=passed|warning|failed、summary、checkedCriteria、openIssues、recommendedAction。",
    "14. stopReason 必须是 continue、need_more_tools、final、await_user、blocked 之一。await_user 只能用于普通会话追问或等待用户确认，不能替代应调用的检索、写入、审查或修复工具。"
  ].join("\n");
}

// 构建档案整理 AI 的系统提示词，用于从已有策划对话中重新抽取稳定项目档案。
function buildArchiveExtractionSystemPrompt() {
  return [
    "你是小说档案整理 AI。",
    `你使用“${NOVEL_PLANNING_SKILL.displayName}”的档案沉淀合同工作。`,
    "你的职责是从用户与策划助手的对话中提取稳定设定，形成可维护的项目档案。",
    "不要直接写正文，不要把用户尚未确认的猜测当成事实。",
    "提取时优先保留能影响后续角色行为、场景边界、章节推进和改写风格的信息。",
    "请输出 JSON，字段包括 archivePatch。",
    "archivePatch 可以包含 premise、background、outline、style、characters、scenes、clues。",
    "characters 以反应模型和说话方式为中心；scenes 以场景边界和冲突功能为中心；clues 以铺垫和回收为中心。",
    "",
    "严格写入策略：",
    JSON.stringify(NOVEL_PLANNING_SKILL.writePolicy, null, 2),
    "",
    "同时输出 archiveDiagnostics，用来说明素材类型、提取候选、写入决策、冲突、纠错、待确认和缺口。",
    "如果旧对话中存在互相矛盾的设定，不要强行合并；能确定的写 corrections，不能确定的写 conflicts 和 tentative。"
  ].join("\n");
}

// 构建扮演配置生成 AI 的系统提示词，把项目档案转成导演、角色、次要角色群和改写器配置。
function buildRoleplayConfigSystemPrompt() {
  return [
    "你是扮演配置生成 AI。",
    `你使用“${NOVEL_PLANNING_SKILL.displayName}”把策划档案转成可执行扮演配置。`,
    "你的职责是根据小说档案生成可执行的扮演配置，而不是写正文。",
    "配置要服务于行文阶段：导演 AI 负责场景约束，主要角色单独扮演，次要角色群统一扮演，改写器忠实改写。",
    "只能从用户提供的 providerId 和 model 里选择，不能编造不存在的提供商或模型。",
    "如果 project.aiRoles 已经配置了 providerId 和 model，应优先沿用这些槽位；不要随意改成 availableProviders 的第一个模型。",
    "",
    "酒馆角色卡映射规则：",
    "- name、description、personality、scenario 是永久角色定义，每轮都会进入角色扮演提示词。",
    "- firstMessage 和 exampleDialog 只用于稳定说话方式，不要当成本轮已发生剧情。",
    "- systemPrompt 是角色硬约束；postHistoryInstructions 是压在历史之后的补充提醒。",
    "- lorebook 应只放角色相关世界信息，不放整本世界观。",
    "- 次要角色可以有角色卡，但不单独绑定 providerId 和 model。",
    "",
    "请输出 JSON，字段包括 config。",
    "config.scenario 包含 background、time、place、plotDirection、tone。",
    "config.aiRoles 包含 guide、minor、adapter，每项包含 providerId、model、temperature。",
    "config.characters 是角色卡数组，每项包含 roleType、name、description、personality、scenario、firstMessage、exampleDialog、systemPrompt、postHistoryInstructions、lorebook、tags、providerId、model、temperature。",
    "主要角色 providerId 和 model 优先沿用 project.aiRoles.guide 或已有角色卡中的配置；次要角色仍不单独绑定模型。",
    "允许直接输出酒馆 V2 兼容字段 first_mes、mes_example、system_prompt、post_history_instructions、character_book；系统会自动归一化。",
    "生成配置前必须读取 skillRuntime.archiveIntegrity：如果存在 blocking 或 high 风险，不要假装配置已经稳定，应在配置中保持保守，并通过 raw 或说明暴露风险。",
    "角色卡不要把 outline 中的未来真相写进角色 scenario；角色只能拥有当前阶段该角色应该知道的信息。"
  ].join("\n");
}

// 给每次 AI 调用附带当前 skill 合同和项目缺口，让模型知道本轮最该补哪里。
function buildSkillRuntimeContext(novel) {
  return {
    skill: buildSkillClientSummary(),
    archiveContract: NOVEL_PLANNING_SKILL.archiveContract,
    archiveDiagnosticsContract: NOVEL_PLANNING_SKILL.archiveDiagnosticsContract,
    writePolicy: NOVEL_PLANNING_SKILL.writePolicy,
    intentRoutePolicy: NOVEL_PLANNING_SKILL.intentRoutePolicy,
    writeBoundaryMatrix: NOVEL_PLANNING_SKILL.writeBoundaryMatrix,
    roleplayContract: NOVEL_PLANNING_SKILL.roleplayContract,
    skillOpsContract: NOVEL_PLANNING_SKILL.skillOpsContract,
    localFileSources: summarizeLocalFileSources(novel),
    currentProjectPressure: summarizeProjectPressure(novel),
    archiveIntegrity: inspectArchiveIntegrity(novel)
  };
}

function summarizeLocalFileSources(novel) {
  const planning = novel.planning && typeof novel.planning === "object" ? novel.planning : {};
  const sources = [
    planning.defaultAgentFolder ? {
      id: "default_agent_folder",
      name: "Agent 工作区",
      rootPath: planning.defaultAgentFolder,
      includeSubfolders: true,
      enabled: true,
      kind: "default_agent_folder"
    } : null,
    ...(Array.isArray(planning.localFileSources) ? planning.localFileSources : [])
  ];
  return sources
    .filter((source) => source && source.enabled !== false)
    .slice(0, 12)
    .map((source) => ({
      id: String(source.id || ""),
      name: String(source.name || ""),
      rootPath: String(source.rootPath || ""),
      includeSubfolders: source.includeSubfolders !== false,
      kind: String(source.kind || (source.id === "default_agent_folder" ? "default_agent_folder" : "extra_folder"))
    }));
}

// 用少量布尔压力点提示 AI 当前项目最缺什么，避免靠大量状态字段堆复杂度。
function summarizeProjectPressure(novel) {
  const archives = novel.archives || {};
  return {
    missingPremise: !archives.premise,
    missingMajorCharacters: !Array.isArray(archives.characters) || !archives.characters.some((item) => item.roleType === "major"),
    missingScene: !Array.isArray(archives.scenes) || archives.scenes.length === 0,
    missingOutline: !archives.outline,
    hasRoleplayDraft: Boolean(novel.planning?.roleplayDrafts?.length)
  };
}

// 给策划 AI 一个轻量自检摘要，让它知道当前档案哪里不稳，避免继续把错误设定扩散。
function inspectArchiveIntegrity(novel) {
  const archives = novel.archives || {};
  const issues = [];
  if (!archives.premise) {
    issues.push({ severity: "medium", field: "premise", message: "核心命题为空，后续配置容易发散。" });
  }
  if (!archives.outline) {
    issues.push({ severity: "medium", field: "outline", message: "大纲为空，导演 AI 缺少阶段目标。" });
  }
  const characterNames = new Set();
  for (const character of archives.characters || []) {
    const name = String(character.name || "").trim();
    if (!name) {
      issues.push({ severity: "high", field: "characters", message: "存在没有 name 的角色档案，不能稳定合并。" });
      continue;
    }
    const normalized = name.toLowerCase();
    if (characterNames.has(normalized)) {
      issues.push({ severity: "high", field: "characters", message: `角色 ${name} 存在重复档案。` });
    }
    characterNames.add(normalized);
    if (!character.personality && !character.description) {
      issues.push({ severity: "low", field: `characters.${name}`, message: "角色缺少反应模型或描述。" });
    }
  }
  for (const clue of archives.clues || []) {
    if (!clue.status) {
      issues.push({ severity: "low", field: `clues.${clue.name || clue.title || "未命名线索"}`, message: "线索缺少 status，后续回收难以判断。" });
    }
  }
  return {
    issueCount: issues.length,
    blocking: issues.some((issue) => issue.severity === "blocking" || issue.severity === "high"),
    issues: issues.slice(0, 12)
  };
}

// 将本项目角色卡映射成酒馆 Character Card V2 兼容结构，便于提示词和后续导入导出复用。
function toTavernCardV2(character) {
  const card = normalizeCardLikeInput(character);
  const data = {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    first_mes: card.firstMessage,
    mes_example: card.exampleDialog,
    creator_notes: card.creatorNotes || "",
    system_prompt: card.systemPrompt,
    post_history_instructions: card.postHistoryInstructions,
    alternate_greetings: card.alternateGreetings || [],
    tags: card.tags,
    creator: SKILL_NAMESPACE,
    character_version: "1.0",
    extensions: {
      [SKILL_NAMESPACE]: {
        roleType: card.roleType,
        motivation: card.motivation || "",
        relationshipMap: card.relationshipMap || "",
        source: "roleplay-novel-studio"
      }
    }
  };
  const characterBook = buildCharacterBook(card.name, card.lorebook);
  if (characterBook) {
    data.character_book = characterBook;
  }
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data
  };
}

// 取出角色卡的数据层。V2/V3 都把主体放在 data 内，V1 和部分工具会直接平铺字段。
function getCardData(character) {
  const source = character && typeof character === "object" ? character : {};
  if ((source.spec === "chara_card_v2" || source.spec === "chara_card_v3") && source.data && typeof source.data === "object") {
    return source.data;
  }
  if (source.data && typeof source.data === "object" && (source.data.name || source.data.char_name)) {
    return source.data;
  }
  return source;
}

// 接收普通角色卡或酒馆 V1/V2/V3 角色卡，并归一化为本项目内部字段。
function normalizeCardLikeInput(character) {
  const source = character && typeof character === "object" ? character : {};
  const data = getCardData(source);
  const extensionData = data.extensions?.[SKILL_NAMESPACE] && typeof data.extensions[SKILL_NAMESPACE] === "object"
    ? data.extensions[SKILL_NAMESPACE]
    : {};
  return {
    roleType: (data.roleType || extensionData.roleType || source.roleType) === "minor" ? "minor" : "major",
    name: String(data.name || data.char_name || data.character_name || "").trim(),
    description: String(data.description || ""),
    personality: String(data.personality || ""),
    scenario: String(data.scenario || data.world_scenario || ""),
    firstMessage: String(data.firstMessage ?? data.first_mes ?? data.greeting ?? ""),
    exampleDialog: String(data.exampleDialog ?? data.mes_example ?? ""),
    systemPrompt: String(data.systemPrompt ?? data.system_prompt ?? ""),
    postHistoryInstructions: String(data.postHistoryInstructions ?? data.post_history_instructions ?? ""),
    lorebook: String(data.lorebook || data.world_info || characterBookToText(data.character_book) || ""),
    tags: Array.isArray(data.tags) ? data.tags.map((item) => String(item || "").trim()).filter(Boolean) : [],
    creatorNotes: String(data.creatorNotes ?? data.creator_notes ?? ""),
    alternateGreetings: Array.isArray(data.alternateGreetings || data.alternate_greetings)
      ? (data.alternateGreetings || data.alternate_greetings).map((item) => String(item || ""))
      : [],
    motivation: String(data.motivation || extensionData.motivation || ""),
    relationshipMap: data.relationshipMap || extensionData.relationshipMap || ""
  };
}

// 把角色专属世界书文本转成酒馆 character_book 结构；只绑定角色相关信息，不塞整本世界观。
function buildCharacterBook(characterName, lorebookText) {
  const content = String(lorebookText || "").trim();
  if (!content) return null;
  return {
    name: `${characterName || "角色"}专属世界书`,
    description: "从本项目角色卡世界书字段生成，用于稳定角色相关设定。",
    scan_depth: 4,
    token_budget: 600,
    recursive_scanning: false,
    extensions: {
      [SKILL_NAMESPACE]: {
        source: "character.lorebook"
      }
    },
    entries: [
      {
        keys: [characterName || "角色"],
        content,
        extensions: {},
        enabled: true,
        insertion_order: 0,
        constant: false,
        position: "after_char"
      }
    ]
  };
}

// 从酒馆 character_book 中提取可编辑文本，供本项目的 lorebook 字段保存。
function characterBookToText(characterBook) {
  if (!characterBook || typeof characterBook !== "object" || !Array.isArray(characterBook.entries)) {
    return "";
  }
  return characterBook.entries
    .filter((entry) => entry && entry.enabled !== false && entry.content)
    .map((entry) => String(entry.content || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

// 把短流程数组转成编号清单，用于系统提示词中的工作流展示。
function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

module.exports = {
  NOVEL_PLANNING_SKILL,
  buildSkillClientSummary,
  buildPlanningSystemPrompt,
  buildArchiveExtractionSystemPrompt,
  buildRoleplayConfigSystemPrompt,
  buildSkillRuntimeContext,
  getCardData,
  normalizeCardLikeInput,
  toTavernCardV2
};
