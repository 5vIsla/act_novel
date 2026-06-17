// MCP 工具注册表 —— 把核心扮演引擎暴露为 Codex/ZCode 可调用的 MCP 工具。
//
// 本文件导出一个工厂函数 createMcpHandler(ctx)，ctx 包含 server/index.js
// 注入的核心函数引用，避免循环依赖。
//
// Codex/ZCode 通过 POST /api/mcp 调用，请求体格式：
//   { tool: "toolName", args: { ... } }
// 返回格式：
//   { ok: true, result: { content: [...], isError: false } }

function createMcpHandler(ctx) {
  const {
    findNovel, writeStore, nowIso, createId,
    createDefaultNovel, createDefaultCharacter, createDefaultLorebook, createDefaultMemory,
    normalizeCharacter, sanitizeStoreForClient,
    applyDefaultCharacterAiSetting, projectCharacterToMemory,
    generateRoleplayConfigDraft, applyRoleplayConfig,
    runRoleplayTurn, rerunTurnCharacter, runReviewChain, adaptLatestRoleplay,
    generatePrewritePlan, runChapterWorkflow,
    acceptProsePart, discardProsePart,
    buildPlanningDoctorReport, runNovelQualityGate
  } = ctx;

  // 简化的角色脱敏：去掉内部字段
  function sanitizeCharacterForClient(character) {
    if (!character) return null;
    return {
      id: character.id,
      name: character.name,
      roleType: character.roleType,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      firstMessage: character.firstMessage,
      exampleDialog: character.exampleDialog,
      systemPrompt: character.systemPrompt,
      tags: character.tags,
      avatar: character.avatar,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt
    };
  }

  // 简化的提供商脱敏：隐藏 API key
  function sanitizeProvidersForClient(store) {
    return (store.providers || []).map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      endpointType: p.endpointType,
      models: Array.isArray(p.models) ? p.models : [],
      modelQueryPath: p.modelQueryPath,
      keyMask: p.key ? `${p.key.slice(0, 4)}...${p.key.slice(-4)}` : ""
    }));
  }

  const MCP_TOOLS = {};

  function registerTool(name, definition) {
    MCP_TOOLS[name] = definition;
  }

  // ====== 小说管理 ======

  registerTool("novel_list", {
    description: "列出所有小说及其基本信息",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    handler: async ({ store }) => {
      const novels = (store.novels || []).map((novel) => ({
        id: novel.id,
        title: novel.title,
        createdAt: novel.createdAt,
        updatedAt: novel.updatedAt,
        active: novel.id === store.activeNovelId,
        characterCount: (novel.characters || []).length,
        turnCount: (novel.session?.turns || []).length,
        proseCount: (novel.prose?.parts || []).length,
        memoryCount: (novel.memory?.items || []).length,
        loreEntryCount: (novel.lorebook?.entries || []).length
      }));
      return { novels };
    }
  });

  registerTool("novel_create", {
    description: "创建一本新小说",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "小说标题" }
      },
      required: ["title"]
    },
    handler: async ({ store, args }) => {
      if (!store.activeNovelId && store.novels.length === 0) {
        store.activeNovelId = "";
      }
      const novel = createDefaultNovel(args.title);
      store.novels.push(novel);
      if (!store.activeNovelId) {
        store.activeNovelId = novel.id;
      }
      await writeStore(store);
      return { novel: { id: novel.id, title: novel.title, createdAt: novel.createdAt } };
    }
  });

  registerTool("novel_delete", {
    description: "删除一本小说及其所有数据",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const idx = store.novels.findIndex((n) => n.id === args.novelId);
      if (idx === -1) throw new Error(`未找到小说: ${args.novelId}`);
      store.novels.splice(idx, 1);
      if (store.activeNovelId === args.novelId) {
        store.activeNovelId = store.novels[0]?.id || null;
      }
      await writeStore(store);
      return { deleted: true, novelId: args.novelId };
    }
  });

  registerTool("novel_select", {
    description: "切换当前活动小说",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = store.novels.find((n) => n.id === args.novelId);
      if (!novel) throw new Error(`未找到小说: ${args.novelId}`);
      store.activeNovelId = args.novelId;
      await writeStore(store);
      return { activeNovelId: args.novelId, title: novel.title };
    }
  });

  // ====== 状态查看 ======

  registerTool("novel_get_state", {
    description: "获取小说完整状态摘要",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return sanitizeStoreForClient({ ...store, novels: [novel] });
    }
  });

  registerTool("novel_get_characters", {
    description: "获取小说所有角色卡",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { characters: (novel.characters || []).map(sanitizeCharacterForClient) };
    }
  });

  registerTool("novel_get_lorebook", {
    description: "获取小说所有世界书条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { entries: novel.lorebook?.entries || [] };
    }
  });

  registerTool("novel_get_memories", {
    description: "获取小说长期记忆条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { memories: novel.memory?.items || [] };
    }
  });

  registerTool("novel_get_prose", {
    description: "获取小说已采纳正文片段",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { prose: (novel.prose?.parts || []).filter((p) => p.status === "accepted") };
    }
  });

  registerTool("novel_get_turns", {
    description: "获取小说的扮演轮次记录",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        limit: { type: "number", description: "最多返回条数，默认 20" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const turns = novel.session?.turns || [];
      const limit = Math.min(args.limit || 20, 100);
      return { turns: turns.slice(-limit).reverse() };
    }
  });

  registerTool("novel_get_roleplay_config", {
    description: "获取当前扮演配置",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { roleplayConfig: novel.roleplayConfig || null };
    }
  });

  registerTool("novel_get_archives", {
    description: "获取小说结构化档案",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      return { archives: novel.archives || {} };
    }
  });

  registerTool("novel_get_providers", {
    description: "获取已配置的 AI 提供商列表（脱敏）",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    handler: async ({ store }) => {
      return { providers: sanitizeProvidersForClient(store) };
    }
  });

  // ====== 角色管理 ======

  registerTool("character_create", {
    description: "创建新角色",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        name: { type: "string", description: "角色名称" },
        roleType: { type: "string", description: "major（主要角色）或 minor（次要角色）", enum: ["major", "minor"] },
        description: { type: "string", description: "角色描述" },
        personality: { type: "string", description: "角色性格" },
        scenario: { type: "string", description: "初始场景" },
        firstMessage: { type: "string", description: "首条消息" },
        exampleDialog: { type: "string", description: "示例对话" },
        systemPrompt: { type: "string", description: "系统提示词覆盖" }
      },
      required: ["novelId", "name", "roleType"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const character = normalizeCharacter({
        ...createDefaultCharacter(args.roleType),
        name: args.name,
        description: args.description || "",
        personality: args.personality || "",
        scenario: args.scenario || "",
        firstMessage: args.firstMessage || "",
        exampleDialog: args.exampleDialog || "",
        systemPrompt: args.systemPrompt || "",
        id: createId("char"),
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      applyDefaultCharacterAiSetting(store, novel, character);
      novel.characters.push(character);
      projectCharacterToMemory(novel, character, { type: "character_card", id: character.id });
      await writeStore(store);
      return { character: sanitizeCharacterForClient(character) };
    }
  });

  registerTool("character_update", {
    description: "更新角色卡信息",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        characterId: { type: "string", description: "角色 ID" },
        patch: { type: "object", description: "要更新的字段" }
      },
      required: ["novelId", "characterId", "patch"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const character = novel.characters.find((c) => c.id === args.characterId);
      if (!character) throw new Error(`未找到角色: ${args.characterId}`);
      Object.assign(character, args.patch, { updatedAt: nowIso() });
      await writeStore(store);
      return { character: sanitizeCharacterForClient(character) };
    }
  });

  registerTool("character_delete", {
    description: "删除角色",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        characterId: { type: "string", description: "角色 ID" }
      },
      required: ["novelId", "characterId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const idx = novel.characters.findIndex((c) => c.id === args.characterId);
      if (idx === -1) throw new Error(`未找到角色: ${args.characterId}`);
      novel.characters.splice(idx, 1);
      await writeStore(store);
      return { deleted: true, characterId: args.characterId };
    }
  });

  // ====== 世界书管理 ======

  registerTool("lorebook_create_entry", {
    description: "创建世界书条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        keys: { type: "array", items: { type: "string" }, description: "触发关键词" },
        content: { type: "string", description: "条目内容" },
        secondaryKeys: { type: "array", items: { type: "string" }, description: "二级关键词" },
        priority: { type: "number", description: "优先级（默认 10）" },
        visibility: { type: "string", description: "public/private" },
        roleIds: { type: "array", items: { type: "string" }, description: "角色可见性限制" },
        insertPosition: { type: "string", description: "插入位置" },
        budget: { type: "number", description: "token 预算上限" }
      },
      required: ["novelId", "keys", "content"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const entry = {
        id: createId("lore"),
        keys: args.keys,
        content: args.content,
        secondaryKeys: args.secondaryKeys || [],
        priority: args.priority ?? 10,
        visibility: args.visibility || "public",
        roleIds: args.roleIds || [],
        insertPosition: args.insertPosition || "before_context",
        budget: args.budget || 500,
        recursiveScan: args.recursiveScan || false,
        cooldownTurns: args.cooldownTurns || 0,
        mutualExclusionGroup: args.mutualExclusionGroup || "",
        overwrites: args.overwrites || [],
        expiresAt: args.expiresAt || "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        triggerCount: 0,
        lastTriggeredAt: ""
      };
      if (!novel.lorebook) novel.lorebook = createDefaultLorebook();
      novel.lorebook.entries.push(entry);
      await writeStore(store);
      return { entry };
    }
  });

  registerTool("lorebook_update_entry", {
    description: "更新世界书条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        entryId: { type: "string", description: "条目 ID" },
        patch: { type: "object", description: "要更新的字段" }
      },
      required: ["novelId", "entryId", "patch"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const entry = (novel.lorebook?.entries || []).find((e) => e.id === args.entryId);
      if (!entry) throw new Error(`未找到世界书条目: ${args.entryId}`);
      Object.assign(entry, args.patch, { updatedAt: nowIso() });
      await writeStore(store);
      return { entry };
    }
  });

  registerTool("lorebook_delete_entry", {
    description: "删除世界书条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        entryId: { type: "string", description: "条目 ID" }
      },
      required: ["novelId", "entryId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const entries = novel.lorebook?.entries || [];
      const idx = entries.findIndex((e) => e.id === args.entryId);
      if (idx === -1) throw new Error(`未找到世界书条目: ${args.entryId}`);
      entries.splice(idx, 1);
      await writeStore(store);
      return { deleted: true, entryId: args.entryId };
    }
  });

  // ====== 记忆管理 ======

  registerTool("memory_create", {
    description: "创建长期记忆条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        subject: { type: "string", description: "记忆主体" },
        field: { type: "string", description: "字段名" },
        value: { type: "string", description: "记忆内容" },
        visibility: { type: "string", description: "public/author/character" },
        layer: { type: "string", description: "stable_fact/tentative/judgment" },
        evidence: { type: "string", description: "证据来源" },
        roleIds: { type: "array", items: { type: "string" }, description: "角色可见性限制" }
      },
      required: ["novelId", "subject", "field", "value"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const item = {
        id: createId("mem"),
        subject: args.subject,
        field: args.field,
        value: args.value,
        visibility: args.visibility || "public",
        layer: args.layer || "stable_fact",
        status: "active",
        evidence: args.evidence || `mcp:${nowIso()}`,
        roleIds: args.roleIds || [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      if (!novel.memory) novel.memory = createDefaultMemory();
      if (!novel.memory.items) novel.memory.items = [];
      novel.memory.items.push(item);
      await writeStore(store);
      return { memory: item };
    }
  });

  registerTool("memory_update", {
    description: "更新记忆条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        memoryId: { type: "string", description: "记忆 ID" },
        patch: { type: "object", description: "要更新的字段" }
      },
      required: ["novelId", "memoryId", "patch"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const item = (novel.memory?.items || []).find((m) => m.id === args.memoryId);
      if (!item) throw new Error(`未找到记忆条目: ${args.memoryId}`);
      Object.assign(item, args.patch, { updatedAt: nowIso() });
      await writeStore(store);
      return { memory: item };
    }
  });

  registerTool("memory_delete", {
    description: "删除记忆条目",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        memoryId: { type: "string", description: "记忆 ID" }
      },
      required: ["novelId", "memoryId"]
    },
    handler: async ({ store, args }) => {
      const novel = findNovel(store, args.novelId);
      const items = novel.memory?.items || [];
      const idx = items.findIndex((m) => m.id === args.memoryId);
      if (idx === -1) throw new Error(`未找到记忆条目: ${args.memoryId}`);
      items.splice(idx, 1);
      await writeStore(store);
      return { deleted: true, memoryId: args.memoryId };
    }
  });

  // ====== 扮演与写作 ======

  registerTool("roleplay_generate_config", {
    description: "根据当前档案自动生成扮演配置草案",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel }) => {
      const result = await generateRoleplayConfigDraft(store, novel);
      await writeStore(store);
      return { draft: result };
    }
  });

  registerTool("roleplay_apply_config", {
    description: "应用扮演配置（必须传入完整的扮演配置 JSON）",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        config: { type: "object", description: "扮演配置" }
      },
      required: ["novelId", "config"]
    },
    handler: async ({ store, novel, args }) => {
      const result = await applyRoleplayConfig(store, novel, args.config);
      await writeStore(store);
      return { applied: result.applied, turn: result.turn || null };
    }
  });

  registerTool("roleplay_run_turn", {
    description: "运行一轮角色扮演（需先应用扮演配置）",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel }) => {
      const result = await runRoleplayTurn(store, novel);
      await writeStore(store);
      return { turn: result };
    }
  });

  registerTool("roleplay_rerun_character", {
    description: "对指定轮次中的单个角色重跑",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        turnId: { type: "string", description: "轮次 ID" },
        characterId: { type: "string", description: "角色 ID" }
      },
      required: ["novelId", "turnId", "characterId"]
    },
    handler: async ({ store, novel, args }) => {
      const result = await rerunTurnCharacter(store, novel, args.turnId, args.characterId);
      await writeStore(store);
      return { turn: result.turn, review: result.review };
    }
  });

  registerTool("roleplay_review", {
    description: "对最新扮演轮次或正文片段进行一致性审查",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        target: { type: "string", description: "latest_turn / latest_prose / 或具体 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel, args }) => {
      const body = args.target ? { target: args.target } : {};
      const review = await runReviewChain(store, novel, body);
      await writeStore(store);
      return { review };
    }
  });

  registerTool("roleplay_adapt_to_prose", {
    description: "将最近三轮扮演记录改写为正文片段",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel }) => {
      const result = await adaptLatestRoleplay(store, novel);
      await writeStore(store);
      return { prose: result };
    }
  });

  registerTool("roleplay_prewrite_plan", {
    description: "生成章节级写前定位",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        workflowId: { type: "string", description: "工作流 ID（可选）" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel, args }) => {
      const plan = await generatePrewritePlan(store, novel, args);
      await writeStore(store);
      return { plan };
    }
  });

  registerTool("roleplay_run_chapter_workflow", {
    description: "运行完整章节工作流",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        workflowId: { type: "string", description: "工作流 ID（可选）" },
        forceReview: { type: "boolean", description: "是否强制重新审查" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel, args }) => {
      const result = await runChapterWorkflow(store, novel, args);
      await writeStore(store);
      return { workflow: result };
    }
  });

  // ====== 正文管理 ======

  registerTool("prose_accept", {
    description: "采纳正文草稿为正式版本",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        proseId: { type: "string", description: "正文片段 ID" }
      },
      required: ["novelId", "proseId"]
    },
    handler: async ({ store, novel, args }) => {
      const prose = (novel.prose?.parts || []).find((p) => p.id === args.proseId);
      if (!prose) throw new Error(`未找到正文: ${args.proseId}`);
      await acceptProsePart(store, novel, prose);
      await writeStore(store);
      return { accepted: true, proseId: args.proseId };
    }
  });

  registerTool("prose_discard", {
    description: "废弃正文草稿",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" },
        proseId: { type: "string", description: "正文片段 ID" }
      },
      required: ["novelId", "proseId"]
    },
    handler: async ({ store, novel, args }) => {
      const prose = (novel.prose?.parts || []).find((p) => p.id === args.proseId);
      if (!prose) throw new Error(`未找到正文: ${args.proseId}`);
      await discardProsePart(novel, prose);
      await writeStore(store);
      return { discarded: true, proseId: args.proseId };
    }
  });

  // ====== 质量与诊断 ======

  registerTool("novel_diagnostics", {
    description: "对小说进行资料诊断",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel }) => {
      const report = await buildPlanningDoctorReport(store, novel);
      return { diagnostics: report };
    }
  });

  registerTool("novel_quality_gate", {
    description: "运行质量门禁检查",
    inputSchema: {
      type: "object",
      properties: {
        novelId: { type: "string", description: "小说 ID" }
      },
      required: ["novelId"]
    },
    handler: async ({ store, novel }) => {
      const gate = runNovelQualityGate(novel);
      return { gate };
    }
  });

  // ====== 工具注册表元信息 ======

  function getToolCatalog() {
    const catalog = {};
    for (const [name, def] of Object.entries(MCP_TOOLS)) {
      catalog[name] = {
        description: def.description,
        inputSchema: def.inputSchema
      };
    }
    return catalog;
  }

  // ====== MCP 请求处理 ======

  async function handleMcpRequest(store, body) {
    const { tool, args = {} } = body || {};
    if (!tool) {
      return {
        result: {
          content: [{ type: "text", text: "缺少 tool 参数" }],
          isError: true
        },
        tools: getToolCatalog()
      };
    }

    const def = MCP_TOOLS[tool];
    if (!def) {
      return {
        result: {
          content: [{ type: "text", text: `未知工具: ${tool}\n可用工具: ${Object.keys(MCP_TOOLS).join(", ")}` }],
          isError: true
        }
      };
    }

    try {
      let novel = null;
      if (args.novelId) {
        novel = findNovel(store, args.novelId);
      }

      const raw = await def.handler({ store, novel, args });

      return {
        result: {
          content: [{ type: "text", text: JSON.stringify(raw, null, 2) }],
          isError: false
        }
      };
    } catch (error) {
      return {
        result: {
          content: [{ type: "text", text: `工具 "${tool}" 执行失败: ${error.message}` }],
          isError: true
        }
      };
    }
  }

  return {
    getToolCatalog,
    handleMcpRequest
  };
}

module.exports = { createMcpHandler };