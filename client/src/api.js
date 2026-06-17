const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? jsonHeaders : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, message: text || "接口返回无法解析" };
  }
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.message || `请求失败：${response.status}`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

function body(value) {
  return JSON.stringify(value || {});
}

export const api = {
  getState: () => request("/api/state"),
  getStateShell: () => request("/api/state-shell"),
  heartbeat: () => request("/api/client-heartbeat", { method: "POST" }),
  saveBackgroundSettings: (settings) => request("/api/background-settings", { method: "POST", body: body({ settings }) }),
  uploadBackgroundAsset: (payload) => request("/api/background-assets", { method: "POST", body: body(payload) }),
  listBackgroundAssets: () => request("/api/background-assets"),
  openBackgroundAssetFolder: () => request("/api/background-assets/open", { method: "POST" }),
  scanBackgroundFolder: (payload) => request("/api/background-folder/scan", { method: "POST", body: body(payload) }),
  scanBackgroundFolders: (payload) => request("/api/background-folders/scan", { method: "POST", body: body(payload) }),
  openBackgroundFolder: (folderPath) => request("/api/background-folder/open", { method: "POST", body: body({ folderPath }) }),
  pickBackgroundFolder: (initialPath, options = {}) => request("/api/background-folder/pick", { method: "POST", body: body({ initialPath }), ...options }),
  searchLocalFiles: (payload) => request("/api/local-files/search", { method: "POST", body: body(payload) }),
  readLocalFile: (payload) => request("/api/local-files/read", { method: "POST", body: body(payload) }),
  openLocalFile: (payload) => request("/api/local-files/open", { method: "POST", body: body(payload) }),
  pickLocalFileRoot: (initialPath, options = {}) => request("/api/local-files/pick-root", { method: "POST", body: body({ initialPath }), ...options }),

  createNovel: (title) => request("/api/novels", { method: "POST", body: body({ title }) }),
  selectNovel: (id) => request("/api/active-novel", { method: "POST", body: body({ id }) }),
  deleteNovel: (id) => request(`/api/novels/${id}`, { method: "DELETE" }),
  patchNovel: (id, patch) => request(`/api/novels/${id}`, { method: "PATCH", body: body(patch) }),

  planningChat: (id, payload) => request(`/api/novels/${id}/planning-chat`, { method: "POST", body: body(payload) }),
  startPlanningChat: (id, payload) => request(`/api/novels/${id}/planning-chat/start`, { method: "POST", body: body(payload) }),
  cancelPlanning: (id, runId) => request(`/api/novels/${id}/planning-chat-cancel`, { method: "POST", body: body({ runId }) }),
  revertPlanning: (id, payload) => request(`/api/novels/${id}/planning-chat-revert-last`, { method: "POST", body: body(payload) }),
  planningRun: (id, runId) => request(`/api/novels/${id}/planning-runs/${runId}`),
  planningRunEventsUrl: (id, runId) => `/api/novels/${id}/planning-runs/${runId}/events`,
  resumePlanningRun: (id, runId, payload) => request(`/api/novels/${id}/planning-runs/${runId}/resume`, { method: "POST", body: body(payload) }),
  steerPlanningRun: (id, runId, payload) => request(`/api/novels/${id}/planning-runs/${runId}/steer`, { method: "POST", body: body(payload) }),
  planningMessages: (id, params) => request(`/api/novels/${id}/planning-messages?${new URLSearchParams(params || {})}`),
  planningBranches: (id, params) => request(`/api/novels/${id}/planning-branches?${new URLSearchParams(params || {})}`),
  planningVersionGraph: (id, params) => request(`/api/novels/${id}/planning-version-graph?${new URLSearchParams(params || {})}`),
  planningResponseTree: (id, params) => request(`/api/novels/${id}/planning-response-tree?${new URLSearchParams(params || {})}`),
  planningResponseTreeDiff: (id, params) => request(`/api/novels/${id}/planning-response-tree-diff?${new URLSearchParams(params || {})}`),
  revertPlanningResponseTreeNode: (id, nodeId) => request(`/api/novels/${id}/planning-response-tree-revert-node`, { method: "POST", body: body({ nodeId }) }),
  planningBranchMergePreview: (id, params) => request(`/api/novels/${id}/planning-branch-merge-preview?${new URLSearchParams(params || {})}`),
  switchPlanningBranch: (id, branchId) => request(`/api/novels/${id}/planning-branches/switch`, { method: "POST", body: body({ branchId }) }),
  mergePlanningBranch: (id, payload) => request(`/api/novels/${id}/planning-branches/merge`, { method: "POST", body: body(payload) }),
  createPlanningBranch: (id, payload) => request(`/api/novels/${id}/planning-branches`, { method: "POST", body: body(payload) }),
  updatePlanningBranch: (id, branchId, payload) => request(`/api/novels/${id}/planning-branches/${encodeURIComponent(branchId)}`, { method: "PATCH", body: body(payload) }),
  deletePlanningBranch: (id, branchId) => request(`/api/novels/${id}/planning-branches/${encodeURIComponent(branchId)}`, { method: "DELETE" }),
  forkPlanningBranch: (id, branchId, payload) => request(`/api/novels/${id}/planning-branches/${encodeURIComponent(branchId)}/fork`, { method: "POST", body: body(payload) }),
  clearPlanningBranch: (id, branchId, payload) => request(`/api/novels/${id}/planning-branches/${encodeURIComponent(branchId)}/clear`, { method: "POST", body: body(payload) }),
  cleanupPlanningBranches: (id, payload) => request(`/api/novels/${id}/planning-branches/cleanup`, { method: "POST", body: body(payload) }),
  planningTools: (id) => request(`/api/novels/${id}/planning-tools`),
  planningDoctor: (id) => request(`/api/novels/${id}/planning-doctor`),
  planningShellJobs: (id, params) => request(`/api/novels/${id}/planning-shell-jobs?${new URLSearchParams(params || {})}`),
  planningShellJob: (id, jobId, params) => request(`/api/novels/${id}/planning-shell-jobs/${encodeURIComponent(jobId)}?${new URLSearchParams(params || {})}`),
  stopPlanningShellJob: (id, jobId, payload) => request(`/api/novels/${id}/planning-shell-jobs/${encodeURIComponent(jobId)}/stop`, { method: "POST", body: body(payload) }),
  planningRunTranscript: (id, runId, params) => request(`/api/novels/${id}/planning-runs/${runId}/transcript?${new URLSearchParams(params || {})}`),
  planningContextAssets: (id, params) => request(`/api/novels/${id}/planning-context-assets?${new URLSearchParams(params || {})}`),
  revertPlanningContextCompaction: (id, payload) => request(`/api/novels/${id}/planning-context-compaction-revert`, { method: "POST", body: body(payload) }),
  revertPlanningCheckpoint: (id, runId, checkpointId) => request(`/api/novels/${id}/planning-runs/${runId}/checkpoints/${checkpointId}/revert`, { method: "POST" }),
  decidePlanningApproval: (id, runId, approvalId, decision, options = {}) => request(`/api/novels/${id}/planning-runs/${runId}/approvals/${approvalId}`, { method: "POST", body: body({ decision, ...options }) }),
  extractArchives: (id) => request(`/api/novels/${id}/extract-archives`, { method: "POST" }),
  generateRoleplayConfig: (id) => request(`/api/novels/${id}/generate-roleplay-config`, { method: "POST" }),
  applyRoleplayConfig: (id, payload) => request(`/api/novels/${id}/apply-roleplay-config`, { method: "POST", body: body(payload) }),
  chapterWorkflow: (id, params) => request(`/api/novels/${id}/chapter-workflow?${new URLSearchParams(params || {})}`),
  modelStrategy: (id) => request(`/api/novels/${id}/model-strategy`),
  proseVersionTree: (id) => request(`/api/novels/${id}/prose-version-tree`),
  proseDiff: (id, proseId, params) => request(`/api/novels/${id}/prose/${proseId}/diff?${new URLSearchParams(params || {})}`),
  revertProse: (id, proseId, payload) => request(`/api/novels/${id}/prose/${proseId}/revert`, { method: "POST", body: body(payload) }),
  qualityGate: (id, payload) => request(`/api/novels/${id}/quality-gate`, { method: "POST", body: body(payload) }),
  ragQuality: (id) => request(`/api/novels/${id}/rag-quality`),
  ragBenchmark: (id, payload) => request(`/api/novels/${id}/rag-benchmark`, { method: "POST", body: body(payload) }),
  runChapterWorkflow: (id, payload) => request(`/api/novels/${id}/chapter-workflow/run`, { method: "POST", body: body(payload) }),
  runNormalWritingWorkflow: (id, payload) => request(`/api/novels/${id}/normal-writing-workflow/run`, { method: "POST", body: body(payload) }),
  prewritePlan: (id, payload) => request(`/api/novels/${id}/prewrite-plan`, { method: "POST", body: body(payload) }),
  review: (id, payload) => request(`/api/novels/${id}/review`, { method: "POST", body: body(payload) }),
  runTurn: (id) => request(`/api/novels/${id}/run-turn`, { method: "POST" }),
  rerunTurnCharacter: (id, turnId, characterId) => request(`/api/novels/${id}/turns/${turnId}/characters/${characterId}/rerun`, { method: "POST" }),
  adapt: (id) => request(`/api/novels/${id}/adapt`, { method: "POST" }),
  resetSession: (id) => request(`/api/novels/${id}/reset-session`, { method: "POST" }),
  updateProse: (id, proseId, text) => request(`/api/novels/${id}/prose/${proseId}`, { method: "PUT", body: body({ text }) }),
  acceptProse: (id, proseId) => request(`/api/novels/${id}/prose/${proseId}/accept`, { method: "POST" }),
  postwriteProse: (id, proseId, payload) => request(`/api/novels/${id}/prose/${proseId}/postwrite`, { method: "POST", body: body(payload) }),
  discardProse: (id, proseId) => request(`/api/novels/${id}/prose/${proseId}/discard`, { method: "POST" }),
  updateRevisionLearning: (id, learningId, payload) => request(`/api/novels/${id}/revision-learnings/${learningId}`, { method: "POST", body: body(payload) }),

  createCharacter: (id, payload) => request(`/api/novels/${id}/characters`, { method: "POST", body: body(payload) }),
  updateCharacter: (id, characterId, payload) => request(`/api/novels/${id}/characters/${characterId}`, { method: "PUT", body: body(payload) }),
  deleteCharacter: (id, characterId) => request(`/api/novels/${id}/characters/${characterId}`, { method: "DELETE" }),
  importTavernCards: (id, payload) => request(`/api/novels/${id}/tavern-cards`, { method: "POST", body: body(payload) }),
  importTavernCardPngs: (id, payload) => request(`/api/novels/${id}/tavern-card-pngs`, { method: "POST", body: body(payload) }),

  contextPack: (id, params) => request(`/api/novels/${id}/context-pack?${new URLSearchParams(params || {})}`),
  memoryPack: (id, params) => request(`/api/novels/${id}/memory-pack?${new URLSearchParams(params || {})}`),
  updateMemorySettings: (id, payload) => request(`/api/novels/${id}/memory/settings`, { method: "PUT", body: body(payload) }),
  rebuildMemory: (id) => request(`/api/novels/${id}/memory/rebuild`, { method: "POST" }),
  rebuildVector: (id) => request(`/api/novels/${id}/memory/vector/rebuild`, { method: "POST" }),
  consolidateMemory: (id) => request(`/api/novels/${id}/memory/consolidate`, { method: "POST" }),
  createMemory: (id, payload) => request(`/api/novels/${id}/memory/items`, { method: "POST", body: body(payload) }),
  updateMemory: (id, memoryId, payload) => request(`/api/novels/${id}/memory/items/${memoryId}`, { method: "PUT", body: body(payload) }),
  deleteMemory: (id, memoryId) => request(`/api/novels/${id}/memory/items/${memoryId}`, { method: "DELETE" }),

  updateLorebookSettings: (id, payload) => request(`/api/novels/${id}/lorebook/settings`, { method: "PUT", body: body(payload) }),
  exportLorebook: (id) => request(`/api/novels/${id}/lorebook/export`),
  importLorebook: (id, payload) => request(`/api/novels/${id}/lorebook/import`, { method: "POST", body: body(payload) }),
  createLorebookEntry: (id, payload) => request(`/api/novels/${id}/lorebook/entries`, { method: "POST", body: body(payload) }),
  updateLorebookEntry: (id, entryId, payload) => request(`/api/novels/${id}/lorebook/entries/${entryId}`, { method: "PUT", body: body(payload) }),
  deleteLorebookEntry: (id, entryId) => request(`/api/novels/${id}/lorebook/entries/${entryId}`, { method: "DELETE" }),

  upsertProvider: (payload) => request("/api/providers", { method: "POST", body: body(payload) }),
  deleteProvider: (id) => request(`/api/providers/${id}`, { method: "DELETE" }),
  queryProviderDraftModels: (payload) => request("/api/providers/models/query", { method: "POST", body: body(payload) }),
  queryModels: (id) => request(`/api/providers/${id}/models/query`, { method: "POST" }),
  addProviderModel: (id, model) => request(`/api/providers/${id}/models`, { method: "POST", body: body({ model }) }),
  removeProviderModel: (id, model) => request(`/api/providers/${id}/models/remove`, { method: "POST", body: body({ model }) }),

  // MCP 调用：供 Codex/ZCode 等外部 Agent 通过本服务调用核心扮演引擎
  mcpCall: (tool, args) => request("/api/mcp", { method: "POST", body: body({ tool, args }) }),
  mcpTools: () => request("/api/mcp"),

  // 获取运行模式
  getMode: () => request("/api/mode")
};
