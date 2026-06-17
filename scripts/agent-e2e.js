const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ACTIVE_TEST_SERVERS = new Set();
const ACTIVE_TEST_CLOSERS = new Set();
let CLEANUP_STARTED = false;

function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    childProcess.spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  child.kill("SIGTERM");
}

async function cleanupE2EResources() {
  if (CLEANUP_STARTED) return;
  CLEANUP_STARTED = true;
  for (const child of [...ACTIVE_TEST_SERVERS]) {
    try {
      killProcessTree(child);
    } catch {
      // 测试清理路径不应掩盖原始失败。
    }
  }
  for (const close of [...ACTIVE_TEST_CLOSERS]) {
    try {
      await close();
    } catch {
      // 测试清理路径不应掩盖原始失败。
    }
  }
}

function installE2ECleanupHooks() {
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  signals.forEach((signal) => {
    process.once(signal, () => {
      cleanupE2EResources()
        .finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
    });
  });
  process.once("exit", () => {
    for (const child of [...ACTIVE_TEST_SERVERS]) {
      try {
        killProcessTree(child);
      } catch {
        // 退出阶段只能做同步兜底。
      }
    }
  });
}

installE2ECleanupHooks();

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function assertPublicAgentSteps(run, message = "Agent 过程流必须使用用户可读动作名") {
  const activityText = (run.activityTimeline || [])
    .map((item) => [item.label, item.target, item.summary, item.status].filter(Boolean).join(" "))
    .join("\n");
  const displayText = (run.displaySteps || [])
    .map((item) => item.text || item.summary || item.label || "")
    .join("\n");
  const turnItemText = (run.turnItems || [])
    .map((item) => [item.title, item.text, item.detailText, item.status].filter(Boolean).join(" "))
    .join("\n");
  const publicText = (run.publicParts || [])
    .map((item) => item.text || item.summary || item.label || "")
    .join("\n");
  const processText = (run.processSteps || [])
    .map((item) => [item.label, item.text, item.summary, item.status].filter(Boolean).join(" "))
    .join("\n");
  const turnActionItems = (run.turnItems || []).filter((item) => !/检查|自检|回复/.test(String(`${item.title || ""} ${item.text || ""}`)));
  const turnKinds = new Set((run.turnItems || []).map((item) => String(item.kind || "")));
  const nonReviewDisplaySteps = (run.displaySteps || []).filter((item) => !/检查|自检/.test(String(item.text || item.summary || item.label || "")));
  const nonReviewProcessSteps = (run.processSteps || []).filter((item) => !/检查|自检|回复/.test(String(item.text || item.summary || item.label || "")));
  const reviewDisplaySteps = (run.displaySteps || []).filter((item) => /检查|自检/.test(String(item.text || item.summary || item.label || "")));
  const needsVisibleReview = ["failed", "blocked", "paused"].includes(String(run.status || ""))
    || ["failed", "warning", "blocked"].includes(String(run.completionVerifier?.status || ""))
    || ["failed", "warning", "blocked"].includes(String(run.selfReview?.status || ""));
  const terminalRun = ["completed", "failed", "blocked", "paused", "cancelled"].includes(String(run.status || ""));
  assert((run.activityTimeline || []).length > 0, `${message}：activityTimeline 不能为空`, run);
  assert((run.displaySteps || []).length > 0, `${message}：displaySteps 不能为空`, run);
  assert((run.processSteps || []).length > 0, `${message}：processSteps 不能为空，过程详情第一层必须有自然过程流`, run);
  assert((run.turnItems || []).length > 0, `${message}：turnItems 不能为空，Codex 式会话回合条目必须是一等展示协议`, run);
  assert(turnKinds.has("tool"), `${message}：turnItems 必须包含工具动作 item，不能只靠显示层事后派生`, run.turnItems);
  assert(turnKinds.has("message"), `${message}：turnItems 必须包含模型回复 / 决策 message item，不能把模型段落只放在临时前端流里`, run.turnItems);
  assert(!/native_tool_call|tool_result|tool_call|contextAsset|assetRef|evidence_scheduler|model_call|skillOps/i.test(`${activityText}\n${displayText}\n${publicText}\n${turnItemText}\n${processText}`), `${message}：主过程不应暴露后端协议名`, `${activityText}\n${displayText}\n${publicText}\n${turnItemText}\n${processText}`);
  if (terminalRun) {
    assert(!/(\[running\]|\brunning\b|正在处理这一段|正在定位|正在查找|正在读取|正在整理|正在检查|正在思考)/i.test(`${displayText}\n${publicText}\n${turnItemText}\n${processText}`), `${message}：终态过程不能继续显示“正在”，否则会像卡住`, `${displayText}\n${publicText}\n${turnItemText}\n${processText}`);
  }
  assert(!/思考下一步[:：]|local-roleplay-mock|deepseek|gpt-|claude|gemini/i.test(`${displayText}\n${processText}`), `${message}：完成态公开步骤不应把模型调用当作用户动作`, `${displayText}\n${processText}`);
  assert(!/已建立文件索引|检查通过|自然语言回复已完成|可复用内容还没有闭环|继续读取、写入或说明不写入原因/i.test(`${displayText}\n${publicText}\n${processText}`), `${message}：主过程不应显示索引、成功审查或运行器保护话术`, `${displayText}\n${publicText}\n${processText}`);
  assert(nonReviewDisplaySteps.length > 0, `${message}：公开过程不能只剩审查结论，必须保留至少一条真实动作`, run.displaySteps);
  assert(nonReviewProcessSteps.length > 0, `${message}：过程详情第一层不能只剩审查结论，必须保留至少一条真实动作`, run.processSteps);
  assert(turnActionItems.length > 0, `${message}：turnItems 不能只剩检查和回复，必须保留至少一条真实行动`, run.turnItems);
  if (needsVisibleReview) {
    assert(reviewDisplaySteps.length > 0, `${message}：失败、阻断或提醒态必须在公开过程里显示可理解的检查结论`, run.displaySteps);
  } else {
    assert(!/检查通过|自然语言回复已完成|完成判定器/i.test(displayText), `${message}：成功态检查结论应收进过程详情，不能占主消息流`, displayText);
    assert(turnKinds.has("review"), `${message}：成功态检查结果也应作为 turnItems 进入过程详情，而不是铺在主消息`, run.turnItems);
  }
  const toolTurnItems = (run.turnItems || []).filter((item) => item.kind === "tool");
  assert(toolTurnItems.length > 0, `${message}：工具执行必须形成一等 turnItems，而不是只从 events/items 事后合成`, run.turnItems);
  assert(toolTurnItems.every((item) => item.id && /^turn_item:/.test(String(item.id))), `${message}：工具 turnItem 必须有稳定 id，便于运行中原地更新`, toolTurnItems);
}

function assertProseVersionSnapshots(prose, message) {
  const events = prose?.versionHistory || [];
  assert(events.length > 0, `${message}：缺少正文版本事件`, prose);
  for (const event of events) {
    const previousOk = event.previousLength === 0
      || event.previousSnapshot?.text !== undefined
      || event.previousSnapshot?.assetRef?.id
      || event.previousAssetRef?.id;
    const nextOk = event.nextLength === 0
      || event.nextSnapshot?.text !== undefined
      || event.nextSnapshot?.assetRef?.id
      || event.nextAssetRef?.id;
    assert(previousOk && nextOk, `${message}：正文版本事件必须保存 previous/next 快照或资产引用`, event);
  }
}

// 原生工具 schema 必须满足 strict tool call 的基本约束，避免真实 Provider 拒绝请求。
function assertStrictNativeToolSchema(schema, label = "tool") {
  if (!schema || typeof schema !== "object") {
    throw new Error(`${label}：缺少 native tool schema`);
  }
  assert(!schema.anyOf && !schema.oneOf && !schema.allOf, `${label}：strict native schema 不应包含 anyOf/oneOf/allOf`, schema);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (types.includes("object") || schema.properties) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    assert(Array.isArray(required), `${label}：required 必须是数组`, schema);
    for (const key of Object.keys(properties)) {
      assert(required.includes(key), `${label}：required 必须包含 properties 中的字段 ${key}`, schema);
      assertStrictNativeToolSchema(properties[key], `${label}.${key}`);
    }
    assert(schema.additionalProperties === false, `${label}：对象 schema 必须关闭 additionalProperties`, schema);
  }
  if ((types.includes("array") || schema.items) && schema.items) {
    assertStrictNativeToolSchema(schema.items, `${label}[]`);
  }
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function request(baseUrl, route, options = {}) {
  let response;
  let lastFetchError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(`${baseUrl}${route}`, {
        ...options,
        headers: {
          ...(options.body ? { "content-type": "application/json; charset=utf-8" } : {}),
          ...(options.headers || {})
        }
      });
      lastFetchError = null;
      break;
    } catch (error) {
      lastFetchError = error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  if (lastFetchError) {
    const wrapped = new Error(`请求 ${route} 失败：${lastFetchError.message || lastFetchError}`);
    wrapped.cause = lastFetchError;
    throw wrapped;
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, message: text };
  }
  if (!response.ok || payload?.ok === false) {
    const error = new Error(`${route} 请求失败：${payload?.message || response.status}`);
    error.status = response.status;
    error.details = payload?.details || payload;
    error.request = {
      route,
      method: options.method || "GET",
      body: options.body || ""
    };
    throw error;
  }
  return payload;
}

async function waitForServer(baseUrl, child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) {
      throw new Error(`后端进程提前退出，exitCode=${child.exitCode}`);
    }
    try {
      await request(baseUrl, "/api/state");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw new Error("等待测试后端启动超时");
}

function startTestServer(port, dataDir, novelsDir, logs, extraEnv = {}) {
  const child = childProcess.spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      ROLEPLAY_DATA_DIR: dataDir,
      ROLEPLAY_NOVELS_DIR: novelsDir,
      OPEN_BROWSER: "0",
      AUTO_SHUTDOWN: "0",
      PLANNING_AGENT_STEP_BUDGET: "20",
      PLANNING_CONTEXT_BUDGET_CHARS: "12000",
      PLANNING_CONTEXT_BUDGET_TOKENS: "6000",
      PLANNING_EXTERNAL_VERIFIER: "1",
      PLANNING_AUTO_RESUME: "0",
      PLANNING_SUB_AGENT_QUEUE_SCAN_MS: "500",
      PLANNING_SUB_AGENT_LEASE_MS: "1500",
      PLANNING_SUB_AGENT_HEARTBEAT_MS: "500",
      ...(extraEnv || {})
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  ACTIVE_TEST_SERVERS.add(child);
  child.once("exit", () => ACTIVE_TEST_SERVERS.delete(child));
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  return child;
}

async function stopTestServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killProcessTree(child);
  });
  ACTIVE_TEST_SERVERS.delete(child);
}

function trackTestHttpServer(server) {
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  return () => new Promise((resolve) => {
    for (const socket of sockets) {
      socket.destroy();
    }
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close(() => resolve());
    const timer = setTimeout(resolve, 1000);
    if (typeof timer.unref === "function") timer.unref();
  });
}

async function createStreamingToolProviderServer() {
  const port = await getFreePort();
  const stats = {
    streamToolRequests: 0,
    finalRequests: 0,
    bodies: []
  };
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    stats.bodies.push(body);
    const hasToolResult = (body.messages || []).some((message) => message.role === "tool");
    if (body.stream && Array.isArray(body.tools) && body.tools.length > 0 && !hasToolResult) {
      stats.streamToolRequests += 1;
      writeChatSse(res, [
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_stream_e2e",
                type: "function",
                function: {
                  name: "listFiles",
                  arguments: "{\"path\":\"."
                }
              }]
            }
          }]
        },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: "\",\"limit\":5}"
                }
              }]
            }
          }]
        },
        {
          choices: [{
            delta: {},
            finish_reason: "tool_calls"
          }]
        }
      ]);
      return;
    }
    stats.finalRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const latestUser = [...(body.messages || [])].reverse().find((message) => message.role === "user") || {};
    let planningInput = {};
    try {
      planningInput = JSON.parse(latestUser.content || "{}");
    } catch {
      planningInput = {};
    }
    const steering = Array.isArray(planningInput.agentState?.steering) ? planningInput.agentState.steering : [];
    const latestSteer = steering[steering.length - 1] || null;
    const finalText = JSON.stringify({
      reply: latestSteer?.message
        ? `流式原生工具调用已经执行，并已接收运行中追加指令：${latestSteer.message}`
        : "流式原生工具调用已经执行，已读取工具结果并收束。",
      archivePatch: {},
      archiveDiagnostics: {
        materialType: "e2e_streaming_tool",
        extracted: {},
        writeDecisions: [{ field: "tools", decision: "不写入", reason: "这是流式工具协议测试。" }],
        conflicts: [],
        corrections: [],
        tentative: [],
        missing: []
      },
      skillOps: [],
      taskPlan: [{ id: "stream_tool", title: "验证流式工具调用", status: "completed" }],
      taskGraph: {
        nodes: [{
          id: "stream_tool",
          title: "验证流式工具调用",
          status: "completed",
          dependsOn: [],
          toolTypes: ["listFiles"],
          evidenceIds: [],
          verifier: "工具结果已回传。"
        }]
      },
      doneCriteria: ["流式 tool_call delta 被解析并执行"],
      completionCheck: {
        status: "passed",
        summary: "流式原生工具调用链路通过。",
        checkedCriteria: ["流式 tool_call delta 被解析并执行"],
        openIssues: [],
        recommendedAction: "final"
      },
      toolUseDecision: {
        needTools: false,
        reason: "工具结果已经读取。",
        selectedTools: ["listFiles"]
      },
      stopReason: "final"
    });
    writeChatSse(res, [
      { choices: [{ delta: { content: finalText.slice(0, Math.ceil(finalText.length / 2)) } }] },
      { choices: [{ delta: { content: finalText.slice(Math.ceil(finalText.length / 2)) } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] }
    ]);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const close = trackTestHttpServer(server);
  ACTIVE_TEST_CLOSERS.add(close);
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    stats,
    close: async () => {
      ACTIVE_TEST_CLOSERS.delete(close);
      await close();
    }
  };
}

async function createDelayedChatProviderServer(delayMs = 8000) {
  const port = await getFreePort();
  const stats = {
    requests: 0,
    aborted: 0,
    bodies: []
  };
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    stats.requests += 1;
    stats.bodies.push(body);
    let finished = false;
    const timer = setTimeout(() => {
      if (res.destroyed) return;
      finished = true;
      const finalText = JSON.stringify({
        reply: "延迟测试提供商已完成。这个回复只用于取消测试，正常情况下不应被采纳。",
        archivePatch: {},
        archiveDiagnostics: {
          materialType: "e2e_delayed_provider",
          extracted: {},
          writeDecisions: [{ field: "cancel", decision: "不写入", reason: "这是取消链路测试。" }],
          conflicts: [],
          corrections: [],
          tentative: [],
          missing: []
        },
        skillOps: [],
        taskPlan: [{ id: "delay", title: "延迟测试", status: "completed" }],
        taskGraph: { nodes: [] },
        doneCriteria: ["延迟响应返回"],
        completionCheck: {
          status: "passed",
          summary: "延迟响应返回。",
          checkedCriteria: ["延迟响应返回"],
          openIssues: [],
          recommendedAction: "final"
        },
        toolUseDecision: {
          needTools: false,
          reason: "取消测试不需要工具。",
          selectedTools: []
        },
        stopReason: "final"
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: finalText } }] }));
    }, delayMs);
    res.on("close", () => {
      if (!finished) {
        stats.aborted += 1;
        clearTimeout(timer);
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const close = trackTestHttpServer(server);
  ACTIVE_TEST_CLOSERS.add(close);
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    stats,
    close: async () => {
      ACTIVE_TEST_CLOSERS.delete(close);
      await close();
    }
  };
}

function writeChatSse(res, payloads) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  for (const payload of payloads) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function makeRunId(label) {
  return `run_e2e_${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function waitRun(baseUrl, novelId, runId, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    const result = await request(baseUrl, `/api/novels/${novelId}/planning-runs/${runId}`);
    latest = result.run;
    if (["completed", "failed", "cancelled", "blocked", "paused"].includes(String(latest?.status || ""))) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  const error = new Error(`等待 Agent 运行结束超时：${runId}，最近状态 ${latest?.status || "unknown"}`);
  error.details = latest;
  throw error;
}

async function waitRunStatus(baseUrl, novelId, runId, statuses, options = {}) {
  const expected = new Set(Array.isArray(statuses) ? statuses : [statuses]);
  const timeoutMs = options.timeoutMs || 45000;
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    const result = await request(baseUrl, `/api/novels/${novelId}/planning-runs/${runId}`);
    latest = result.run;
    if (expected.has(String(latest?.status || ""))) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  const error = new Error(`等待 Agent 运行状态超时：${runId}，期望 ${[...expected].join("/")}，最近状态 ${latest?.status || "unknown"}`);
  error.details = latest;
  throw error;
}

async function startRun(baseUrl, novelId, message, label) {
  const runId = makeRunId(label);
  await request(baseUrl, `/api/novels/${novelId}/planning-chat/start`, {
    method: "POST",
    body: JSON.stringify({ message, runId })
  });
  return runId;
}

async function startRunWithPayload(baseUrl, novelId, payload, label) {
  const runId = payload.runId || makeRunId(label);
  await request(baseUrl, `/api/novels/${novelId}/planning-chat/start`, {
    method: "POST",
    body: JSON.stringify({ ...payload, runId })
  });
  return runId;
}

function latestNovel(state) {
  return state.novels.find((item) => item.id === state.activeNovelId) || state.novels[0];
}

function novelFromPlanningStartResponse(baseNovel, response) {
  return {
    ...(baseNovel || {}),
    planning: {
      ...((baseNovel || {}).planning || {}),
      activeBranchId: response.branchState?.activeBranchId || response.activeBranchId || (baseNovel || {}).planning?.activeBranchId || "main",
      branches: response.branchState?.branches || response.branches || (baseNovel || {}).planning?.branches || [],
      branchState: response.branchState || (baseNovel || {}).planning?.branchState || null,
      messages: response.messages || [],
      messagePage: response.messagePage || {},
      runs: response.run ? [response.run, ...(((baseNovel || {}).planning || {}).runs || []).filter((run) => run.id !== response.run.id)] : (((baseNovel || {}).planning || {}).runs || [])
    }
  };
}

function parseSuiteArg(argv = process.argv.slice(2)) {
  const allowed = new Set(["smoke", "agent", "writing", "runtime", "all"]);
  const direct = argv.find((item) => item.startsWith("--suite="));
  const suite = direct ? direct.slice("--suite=".length) : argv[argv.indexOf("--suite") + 1];
  const normalized = suite || "all";
  if (!allowed.has(normalized)) {
    throw new Error(`未知 E2E 套件：${normalized}，可选值：${[...allowed].join(", ")}`);
  }
  return normalized;
}

function shouldRunSuite(activeSuite, ...targetSuites) {
  return activeSuite === "all" || targetSuites.includes(activeSuite);
}

function describeSuiteResult(suite) {
  const summaries = {
    smoke: "Agent E2E 冒烟套件通过：工具目录元数据、原生工具协议基础、自动证据、档案写入工具、诊断器、记忆写入、正文版本树、质量门禁、RAG 质量和基础版本图已验证。",
    agent: "Agent E2E Agent 套件通过：流式工具调用、自定义工具、记忆污染拒绝、fork/response tree/merge、失败诊断、子 Agent、后台恢复、取消和压缩续跑已验证。",
    writing: "Agent E2E 写作套件通过：章节工作流、扮演 transcript、角色上下文、段落组修复、单角色重跑、改稿学习和小说诊断器已验证。",
    runtime: "Agent E2E 运行时套件通过：持续 shell 会话、stdout/stderr 分段审计和后台 shell 作业已验证。",
    all: "Agent E2E 全量套件通过：冒烟、Agent、写作和运行时链路均已验证。"
  };
  return summaries[suite] || summaries.all;
}

function runAllSuitesIsolated() {
  const suites = ["smoke", "agent", "writing", "runtime"];
  for (const suiteName of suites) {
    const result = childProcess.spawnSync(process.execPath, [__filename, "--suite", suiteName], {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        ROLEPLAY_E2E_PARENT_SUITE: "all"
      },
      windowsHide: true
    });
    if (result.status !== 0) {
      process.exitCode = result.status || 1;
      return false;
    }
  }
  console.log(describeSuiteResult("all"));
  return true;
}

async function main() {
  const suite = parseSuiteArg();
  // 全量套件只做编排，不把所有用例塞进同一个临时小说，避免跨套件状态膨胀导致假性超时。
  if (suite === "all" && process.env.ROLEPLAY_E2E_PARENT_SUITE !== "all") {
    runAllSuitesIsolated();
    return;
  }
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "roleplay-agent-e2e-"));
  const dataDir = path.join(tempRoot, "data");
  const novelsDir = path.join(tempRoot, "novels");
  const storePath = path.join(dataDir, "store.json");
  const logs = [];
  let child = startTestServer(port, dataDir, novelsDir, logs);
  let streamingProvider = null;
  let delayedProvider = null;

  try {
    await waitForServer(baseUrl, child);
    const created = await request(baseUrl, "/api/novels", {
      method: "POST",
      body: JSON.stringify({ title: "Agent E2E 临时小说" })
    });
    let novel = created.novel;
    let state = null;
    await fs.mkdir(novel.planning.defaultAgentFolder, { recursive: true });
    await fs.writeFile(path.join(novel.planning.defaultAgentFolder, "notes.md"), "E2E 世界观资料：主角在雨夜发现异常信号。\n", "utf8");
    const mockPlannerSetting = {
      providerId: "provider_mock_local",
      model: "local-roleplay-mock",
      temperature: 0.75
    };
    await request(baseUrl, `/api/novels/${novel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ aiRoles: { planner: mockPlannerSetting } })
    });
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    const providerKindCreate = await request(baseUrl, "/api/providers", {
      method: "POST",
      body: JSON.stringify({
        name: "E2E Provider 类型切换",
        baseUrl: "https://provider-kind.invalid/v1",
        endpointKind: "chat_completions",
        apiKey: "provider-kind-key",
        models: ["provider-kind-model"]
      })
    });
    assert(!Object.hasOwn(providerKindCreate, "state") && Array.isArray(providerKindCreate.providers), "Provider 保存应返回轻量 providers 列表，不能返回完整 state 拖慢设置页", providerKindCreate);
    assert(providerKindCreate.provider?.endpointKind === "chat_completions", "新增 Provider 应保存 chat/completions 类型", providerKindCreate.provider);
    const providerKindEdit = await request(baseUrl, "/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: providerKindCreate.provider.id,
        name: "E2E Provider 类型切换",
        baseUrl: "https://provider-kind.invalid/v1",
        endpointKind: "responses",
        apiKey: "",
        models: ["provider-kind-model"]
      })
    });
    assert(
      providerKindEdit.provider?.endpointKind === "responses"
      && providerKindEdit.provider?.adapterId === "openai_responses"
      && providerKindEdit.provider?.hasKey === true,
      "编辑已有 Provider 时必须允许切换接口类型，并且留空 Key 应保留原 Key",
      providerKindEdit.provider
    );
    const providerModelReplace = await request(baseUrl, "/api/providers", {
      method: "POST",
      body: JSON.stringify({
        id: providerKindCreate.provider.id,
        name: "E2E Provider 类型切换",
        baseUrl: "https://provider-kind.invalid/v1",
        endpointKind: "responses",
        apiKey: "",
        models: ["provider-kind-replaced-model"]
      })
    });
    assert(
      providerModelReplace.provider?.models?.length === 1
      && providerModelReplace.provider.models[0] === "provider-kind-replaced-model",
      "编辑 Provider 的模型列表应以表单最终值为准，不能把旧模型无条件合并回来",
      providerModelReplace.provider
    );
    const providerDraftModels = await request(baseUrl, "/api/providers/models/query", {
      method: "POST",
      body: JSON.stringify({
        name: "E2E 草稿模型查询",
        baseUrl: "mock://local",
        endpointKind: "responses",
        modelQueryPath: "/models",
        apiKey: "local-test-key"
      })
    });
    assert(
      Array.isArray(providerDraftModels.models)
      && providerDraftModels.models.includes("local-roleplay-mock")
      && !Object.hasOwn(providerDraftModels, "state"),
      "Provider 草稿查询应只返回模型候选，不保存 Provider，也不返回完整 state",
      providerDraftModels
    );
    const savedProviderModels = await request(baseUrl, "/api/providers/provider_mock_local/models/query", { method: "POST" });
    assert(
      Array.isArray(savedProviderModels.models)
      && savedProviderModels.models.includes("local-roleplay-mock-fast")
      && !Object.hasOwn(savedProviderModels, "state"),
      "已保存 Provider 查询也应只返回模型候选，避免大项目状态拖慢查询",
      savedProviderModels
    );
    await request(baseUrl, `/api/novels/${novel.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        aiRoles: {
          planner: {
            ...mockPlannerSetting,
            contextWindowTokens: 1000000
          }
        }
      })
    });
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    assert(
      novel.aiRoles?.planner?.promptBudgetTokens === 860000
      && novel.aiRoles?.planner?.compressionTriggerTokens === 619200
      && novel.aiRoles?.planner?.responseReserveTokens === 24000
      && novel.aiRoles?.planner?.safetyTokens === 40000,
      "策划模型只保存上下文窗口时必须自动推导完整预算",
      novel.aiRoles?.planner
    );
    const budgetRunId = await startRun(baseUrl, novel.id, "预算链路测试：请直接完成，不要写入资料。", "budget_profile");
    const budgetRun = await waitRun(baseUrl, novel.id, budgetRunId);
    assert(
      budgetRun.budget?.contextWindowTokens === 1000000
      && budgetRun.budget?.promptBudgetTokens === 860000
      && budgetRun.budget?.compressionTriggerTokens === 619200,
      "策划 Agent 运行时必须实际使用保存的上下文预算",
      budgetRun.budget
    );
    const inlineNoToolRunId = await startRun(baseUrl, novel.id, "轻量对话回归：请只回复“收到”，不要检索、不要读取、不要写入。", "inline_no_tool");
    const inlineNoToolRun = await waitRun(baseUrl, novel.id, inlineNoToolRunId);
    const inlineToolTypes = [
      ...(inlineNoToolRun.skillOpReport?.searches || []),
      ...(inlineNoToolRun.skillOpReport?.applied || []),
      ...(inlineNoToolRun.skillOpReport?.nativeToolCalls || [])
    ].map((item) => String(item.type || item.toolType || item.name || ""));
    const inlinePublicText = [
      inlineNoToolRun.reply,
      ...(inlineNoToolRun.activityTimeline || []).map((item) => [item.label, item.target, item.summary].filter(Boolean).join(" ")),
      ...(inlineNoToolRun.displaySteps || []).map((item) => [item.label, item.text, item.summary].filter(Boolean).join(" ")),
      ...(inlineNoToolRun.publicParts || []).map((item) => [item.label, item.text, item.summary].filter(Boolean).join(" "))
    ].join("\n");
    assert(inlineNoToolRun.status === "completed", "显式只回复的轻量对话必须完成，不能被误判为读取资料后阻断", inlineNoToolRun);
    assert(/收到/.test(String(inlineNoToolRun.reply || "")), "轻量对话应保留模型自然回复", inlineNoToolRun.reply);
    assert(!inlineToolTypes.some((type) => /search|read|write|patch|archive|memory|lorebook/i.test(type)), "显式不要工具时不应触发读取、检索或写入工具", inlineNoToolRun.skillOpReport);
    assert(!(inlineNoToolRun.items || []).some((item) => /search|read|write|patch|archive|memory|lorebook/i.test(String(item.toolType || item.type || ""))), "显式不要工具时不应产生底层工具 item", inlineNoToolRun.items);
    assert(!/读取用户指定资料|还需要先读取资料|需要先读取资料|查找项目资料|查找历史资料|读取文件内容|思考下一步|自然语言回复已完成|已检查\s*\d+\s*项/i.test(inlinePublicText), "轻量对话公开过程不能出现伪造的读取资料、模型审查或检查流水账", inlinePublicText);
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    const inlineNoToolStateRun = (novel.planning?.runs || []).find((run) => run.id === inlineNoToolRunId);
    assert(inlineNoToolStateRun, "刷新 state 后必须还能找到轻量对话 run", novel.planning?.runs);
    assert(
      (inlineNoToolStateRun.displaySteps || []).length === 0
      && (inlineNoToolStateRun.publicParts || []).length === 0
      && (inlineNoToolStateRun.activityTimeline || []).length === 0,
      "刷新 state 后轻量对话也不能重新露出公开过程",
      inlineNoToolStateRun
    );
    const inlineOneSentenceRunId = await startRun(baseUrl, novel.id, "界面验收：请只用一句话回复“收到，界面验收完成”，不要写入档案、记忆或世界书。", "inline_one_sentence");
    const inlineOneSentenceRun = await waitRun(baseUrl, novel.id, inlineOneSentenceRunId);
    const inlineOneSentenceText = [
      inlineOneSentenceRun.reply,
      ...(inlineOneSentenceRun.activityTimeline || []).map((item) => [item.label, item.target, item.summary].filter(Boolean).join(" ")),
      ...(inlineOneSentenceRun.displaySteps || []).map((item) => [item.label, item.text, item.summary].filter(Boolean).join(" ")),
      ...(inlineOneSentenceRun.publicParts || []).map((item) => [item.label, item.text, item.summary].filter(Boolean).join(" "))
    ].join("\n");
    assert(inlineOneSentenceRun.status === "completed", "只用一句话回复应作为轻量对话完成", inlineOneSentenceRun);
    assert(!/查找项目资料|查找历史资料|读取文件内容|自然语言回复已完成|思考下一步|已检查\s*\d+\s*项/i.test(inlineOneSentenceText), "只用一句话回复不能展示自动证据调度或审查流水", inlineOneSentenceText);
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    const inlineOneSentenceStateRun = (novel.planning?.runs || []).find((run) => run.id === inlineOneSentenceRunId);
    assert(inlineOneSentenceStateRun, "刷新 state 后必须还能找到一句话回复 run", novel.planning?.runs);
    assert(
      (inlineOneSentenceStateRun.displaySteps || []).length === 0
      && (inlineOneSentenceStateRun.publicParts || []).length === 0
      && (inlineOneSentenceStateRun.activityTimeline || []).length === 0,
      "刷新 state 后一句话回复也不能显示旧证据调度或检查过程",
      inlineOneSentenceStateRun
    );
    const plannerBudgetSetting = {
      ...mockPlannerSetting,
      contextWindowTokens: 1000000,
      promptBudgetTokens: 860000,
      compressionTriggerTokens: 619200,
      responseReserveTokens: 24000,
      safetyTokens: 20000,
      compactionPressureRatio: 0
    };
    await request(baseUrl, `/api/novels/${novel.id}`, {
      method: "PATCH",
      body: JSON.stringify({ aiRoles: { planner: plannerBudgetSetting } })
    });
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    assert(novel.aiRoles?.planner?.promptBudgetTokens === 860000 && novel.aiRoles?.planner?.compressionTriggerTokens === 619200 && novel.aiRoles?.planner?.responseReserveTokens === 24000, "策划模型槽位必须能保存完整上下文预算", novel.aiRoles?.planner);
    await request(baseUrl, `/api/novels/${novel.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        aiRoles: {
          planner: {
            ...mockPlannerSetting,
            contextWindowTokens: 512000
          }
        }
      })
    });
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    assert(
      novel.aiRoles?.planner?.promptBudgetTokens === 440320
      && novel.aiRoles?.planner?.compressionTriggerTokens === 317030
      && novel.aiRoles?.planner?.safetyTokens === 20480,
      "重新只改上下文窗口时不应沿用旧预算，必须按新窗口重算",
      novel.aiRoles?.planner
    );
    await request(baseUrl, `/api/novels/${novel.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        aiRoles: {
          planner: {
            ...mockPlannerSetting,
            contextWindowTokens: 0,
            promptBudgetTokens: 0,
            compressionTriggerTokens: 0,
            responseReserveTokens: 0,
            safetyTokens: 0,
            compactionPressureRatio: 0
          }
        }
      })
    });
    state = (await request(baseUrl, "/api/state")).state;
    novel = latestNovel(state);
    assert(!novel.aiRoles?.planner?.contextWindowTokens && !novel.aiRoles?.planner?.promptBudgetTokens && !novel.aiRoles?.planner?.compressionTriggerTokens && !novel.aiRoles?.planner?.responseReserveTokens, "策划模型槽位必须能清回自动上下文预算", novel.aiRoles?.planner);

    if (shouldRunSuite(suite, "smoke", "agent")) {
      const awaitUserRunId = await startRun(baseUrl, novel.id, "await_user_guard：模拟模型把等待用户选择误写成 continue。", "await_user_guard");
      const awaitUserRun = await waitRun(baseUrl, novel.id, awaitUserRunId);
      assert(awaitUserRun.status === "completed", "等待用户选择的普通问询不应被标记为 blocked", awaitUserRun);
      assert(awaitUserRun.phase === "awaiting_user", "等待用户选择的运行应保存 awaiting_user 阶段", awaitUserRun);
      assert((awaitUserRun.diagnostics || []).some((item) => item.code === "agent.await_user_detected"), "后端应记录 await_user 自动识别诊断，便于追踪弱模型协议偏差", awaitUserRun.diagnostics);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const awaitUserAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === awaitUserRunId && message.role === "assistant");
      assert(/你现在想让我怎么接|直接把这一段改成正文/.test(awaitUserAssistant?.content || ""), "等待用户运行必须保留正常 assistant 回复", awaitUserAssistant);
      assert(!awaitUserRun.resumeState || awaitUserRun.resumeState.status !== "available", "等待用户不是失败恢复任务，不应生成 blocked 恢复入口", awaitUserRun.resumeState);
    }

    if (shouldRunSuite(suite, "agent")) {
      streamingProvider = await createStreamingToolProviderServer();
      const providerResult = await request(baseUrl, "/api/providers", {
        method: "POST",
        body: JSON.stringify({
          name: "E2E 流式工具提供商",
          baseUrl: streamingProvider.baseUrl,
          endpointKind: "chat_completions",
          apiKey: "e2e-stream-key",
          models: ["stream-tool-model"]
        })
      });
      const streamProvider = providerResult.provider;
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aiRoles: {
            planner: {
              providerId: streamProvider.id,
              model: "stream-tool-model",
              temperature: 0
            }
          }
        })
      });
      const streamingRunId = await startRun(baseUrl, novel.id, "测试原生工具协议流式 tool-call delta，请先调用 listFiles 再收束。", "streaming_native_tool");
      const streamingRun = await waitRun(baseUrl, novel.id, streamingRunId);
      assert(streamingRun.status === "completed", "流式原生工具运行应完成", streamingRun);
      assert(streamingProvider.stats.streamToolRequests > 0, "测试提供商应收到 stream=true 的工具调用请求", streamingProvider.stats);
      assert(streamingProvider.stats.bodies.some((body) => body.stream === true && Array.isArray(body.tools) && body.tools.length > 0), "原生 tools 模式必须保持模型 token streaming", streamingProvider.stats.bodies);
      assert((streamingRun.items || []).some((item) => item.toolType === "listFiles" || item.protocol === "native_tool_call"), "流式 tool_call delta 应被解析为真实工具调用", streamingRun.items);
      assertPublicAgentSteps(streamingRun, "流式工具运行应形成 Codex 式公开过程流");
      const streamingTurnKinds = (streamingRun.turnItems || []).map((item) => item.kind);
      const streamingToolItems = (streamingRun.turnItems || []).filter((item) => item.kind === "tool");
      assert(streamingTurnKinds.includes("message") && streamingTurnKinds.includes("tool"), "流式工具运行必须把模型消息段和工具动作放在同一条 turnItems 流里", streamingRun.turnItems);
      assert(streamingToolItems.length <= 4, "同一轮工具动作应合并为少量生命周期 item，不能拆成工具调用/工具结果流水账", streamingRun.turnItems);
      assert(!((streamingRun.displaySteps || []).some((item) => item.text === "思考下一步") || (streamingRun.publicParts || []).some((item) => item.text === "思考下一步")), "模型思考段只能留在详情层，不能进入主公开过程", { displaySteps: streamingRun.displaySteps, publicParts: streamingRun.publicParts });
      assert((streamingRun.activityTimeline || []).some((item) => ["定位文件", "查找资料", "读取文件内容"].includes(item.label)), "过程流应显示用户可理解的工具动作", streamingRun.activityTimeline);
      const steerRunId = await startRun(baseUrl, novel.id, "测试运行中转向 steer：先触发流式工具，再接收运行中的补充指令。", "steer");
      const steerResult = await request(baseUrl, `/api/novels/${novel.id}/planning-runs/${steerRunId}/steer`, {
        method: "POST",
        body: JSON.stringify({ message: "运行中追加：改为优先检查角色可见性，不要把这条当作下一条排队任务。" })
      });
      assert(steerResult.steer?.status === "pending", "steer 接口应把追加指令写入当前 run 的待消费队列", steerResult);
      const steerRun = await waitRun(baseUrl, novel.id, steerRunId);
      assert(steerRun.status === "completed", "运行中转向后的 run 应完成", steerRun);
      assert((steerRun.events || []).some((event) => event.type === "steer_received"), "run 事件应记录 steer_received", steerRun.events);
      assert((steerRun.events || []).some((event) => event.type === "steer_consumed"), "run 事件应记录 steer_consumed", steerRun.events);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const steerAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === steerRunId && message.role === "assistant");
      assert(/运行中追加指令|角色可见性/.test(steerAssistant?.content || ""), "最终回复必须体现本 run 内消费了追加指令", steerAssistant);
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ aiRoles: { planner: mockPlannerSetting } })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(novel.aiRoles?.planner?.providerId === mockPlannerSetting.providerId && novel.aiRoles?.planner?.model === mockPlannerSetting.model, "流式工具测试后必须切回本地模拟策划模型，避免后续 Agent 任务串槽", novel.aiRoles?.planner);
    }

    if (shouldRunSuite(suite, "smoke", "agent")) {
      const visibleUserText = "显示层验证：这句话才是用户实际输入。";
      const submittedWithHints = [
        "[Agent 前端上下文提示]",
        "用户设置的任务倾向：偏向策划。",
        "",
        "[用户任务]",
        visibleUserText
      ].join("\n");
      const visibleRunId = await startRunWithPayload(baseUrl, novel.id, {
        message: submittedWithHints,
        displayMessage: visibleUserText
      }, "visible_message");
      const visibleRun = await waitRun(baseUrl, novel.id, visibleRunId);
      assert(visibleRun.status === "completed", "带隐藏前端提示的运行应完成", visibleRun);
      const visiblePage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ limit: "80" })}`);
      const visibleUserMessage = (visiblePage.messages || []).find((message) => message.runId === visibleRunId && message.role === "user");
      assert(visibleUserMessage?.content === visibleUserText, "前端线程只能显示用户原文，不能显示隐藏 composer 提示", visibleUserMessage);
      assert(!String(visibleUserMessage?.content || "").includes("Agent 前端上下文提示"), "隐藏 composer 提示不得污染用户可见消息", visibleUserMessage);
      const rawStore = JSON.parse(await fs.readFile(storePath, "utf8"));
      const rawNovel = latestNovel(rawStore);
      const rawVisibleUser = (rawNovel.planning?.messages || []).find((message) => message.runId === visibleRunId && message.role === "user");
      assert(rawVisibleUser?.submittedContent?.includes("Agent 前端上下文提示"), "后端仍应保留提交给模型的隐藏提示，供续跑和内部上下文使用", rawVisibleUser);

      delayedProvider = await createDelayedChatProviderServer();
      const delayedProviderResult = await request(baseUrl, "/api/providers", {
        method: "POST",
        body: JSON.stringify({
          name: "E2E 延迟取消提供商",
          baseUrl: delayedProvider.baseUrl,
          endpointKind: "chat_completions",
          apiKey: "e2e-delay-key",
          models: ["delay-cancel-model"]
        })
      });
      const delayedPlanner = {
        providerId: delayedProviderResult.provider.id,
        model: "delay-cancel-model",
        temperature: 0
      };
      const deleteDuringRunSession = await request(baseUrl, `/api/novels/${novel.id}/planning-branches`, {
        method: "POST",
        body: JSON.stringify({ label: "E2E 运行中可删除的空闲会话" })
      });
      const deleteDuringRunBranchId = deleteDuringRunSession.branch?.id;
      assert(deleteDuringRunBranchId, "运行中删除会话测试必须先创建一个空闲会话", deleteDuringRunSession);
      const queuedDuringRunSession = await request(baseUrl, `/api/novels/${novel.id}/planning-branches`, {
        method: "POST",
        body: JSON.stringify({ label: "E2E 运行中可排队会话" })
      });
      const queuedDuringRunBranchId = queuedDuringRunSession.branch?.id;
      assert(queuedDuringRunBranchId, "运行中排队测试必须先创建一个独立会话", queuedDuringRunSession);
      await request(baseUrl, `/api/novels/${novel.id}/planning-branches/switch`, {
        method: "POST",
        body: JSON.stringify({ branchId: "main" })
      });
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ aiRoles: { planner: delayedPlanner } })
      });
      const persistentCancelRunId = makeRunId("queued_user_message");
      const persistentCancelText = "持久化验证：这条用户消息必须在 Agent 运行前就显示，取消后也不能丢。";
      const persistentStart = await request(baseUrl, `/api/novels/${novel.id}/planning-chat/start`, {
        method: "POST",
        body: JSON.stringify({
          runId: persistentCancelRunId,
          message: `[Agent 前端上下文提示]\n隐藏内容。\n\n[用户任务]\n${persistentCancelText}`,
          displayMessage: persistentCancelText
        })
      });
      let persistentNovel = persistentStart.state ? latestNovel(persistentStart.state) : novelFromPlanningStartResponse(novel, persistentStart);
      let persistentUser = (persistentNovel.planning?.messages || []).find((message) => message.runId === persistentCancelRunId && message.role === "user");
      assert(persistentUser?.content === persistentCancelText, "start 接口返回时必须已经有当前会话用户消息", {
        messagePage: persistentNovel.planning?.messagePage,
        messages: persistentNovel.planning?.messages
      });
      assert((persistentNovel.planning?.runs || []).some((run) => run.id === persistentCancelRunId && run.userMessageId), "queued run 必须关联已持久化的 userMessageId", persistentNovel.planning?.runs);
      const liveDelayedRun = await waitRunStatus(baseUrl, novel.id, persistentCancelRunId, "running", { timeoutMs: 8000 });
      const liveDelayedDisplay = (liveDelayedRun.displaySteps || []).map((item) => item.text || item.label || "").join("\n");
      assert(/正在处理回复|正在根据上下文|正在准备本轮处理/.test(liveDelayedDisplay), "运行中不能只剩转圈或旧工具动作，必须公开当前正在处理的 live 步骤", liveDelayedRun.displaySteps);
      const queuedWhileRunningRunId = makeRunId("queued_while_other_session_running");
      const queuedWhileRunningText = "运行中编辑重发：这条带附件的消息应立即进入另一个会话队列。";
      const queuedStartAt = Date.now();
      const queuedWhileRunningStart = await request(baseUrl, `/api/novels/${novel.id}/planning-chat/start`, {
        method: "POST",
        body: JSON.stringify({
          runId: queuedWhileRunningRunId,
          branchId: queuedDuringRunBranchId,
          message: `[Agent 前端上下文提示]\n用户拖入的本轮临时文件。\n[拖入文件 1：运行中附件.md]\n排队时附件不能丢。\n[/拖入文件 1]\n\n[用户消息]\n${queuedWhileRunningText}`,
          displayMessage: queuedWhileRunningText,
          attachments: {
            files: [
              {
                id: "e2e_queued_attachment_file",
                name: "运行中附件.md",
                label: "运行中附件.md",
                size: 24,
                text: "排队时附件不能丢。",
                truncated: false,
                originalChars: 9
              }
            ]
          }
        })
      });
      const queuedStartElapsed = Date.now() - queuedStartAt;
      assert(queuedStartElapsed < 2500, "另一会话运行中，新消息 start 必须立即返回 queued，不能等上一轮模型调用结束", { queuedStartElapsed, queuedWhileRunningStart });
      const queuedWhileNovel = queuedWhileRunningStart.state ? latestNovel(queuedWhileRunningStart.state) : novelFromPlanningStartResponse(novel, queuedWhileRunningStart);
      const queuedWhileRun = (queuedWhileNovel.planning?.runs || []).find((run) => run.id === queuedWhileRunningRunId);
      assert(["queued", "running"].includes(String(queuedWhileRun?.status || "")), "另一会话运行中发送的新消息必须保存为 queued/running run", queuedWhileRun);
      const queuedWhilePage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: queuedDuringRunBranchId, limit: "40" })}`);
      const queuedWhileUser = (queuedWhilePage.messages || []).find((message) => message.runId === queuedWhileRunningRunId && message.role === "user");
      assert(queuedWhileUser?.content === queuedWhileRunningText, "运行中编辑重发的用户原文必须立即出现在目标会话", queuedWhileUser);
      assert(queuedWhileUser?.attachments?.files?.some((file) => file.name === "运行中附件.md" && String(file.text || "").includes("排队时附件不能丢")), "运行中排队消息的附件必须随用户消息持久化", queuedWhileUser);
      const switchDuringRunResult = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/switch`, {
        method: "POST",
        body: JSON.stringify({ branchId: deleteDuringRunBranchId })
      });
      assert(switchDuringRunResult.activeBranchId === deleteDuringRunBranchId, "运行中应能自由切换到其它空闲会话", switchDuringRunResult);
      const switchedLiveMergedState = (await request(baseUrl, "/api/state")).state;
      assert(latestNovel(switchedLiveMergedState).planning?.activeBranchId === deleteDuringRunBranchId, "运行中的 live snapshot 不能把 active 会话覆盖回原运行会话", latestNovel(switchedLiveMergedState).planning);
      const switchBackDuringRunResult = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/switch`, {
        method: "POST",
        body: JSON.stringify({ branchId: "main" })
      });
      assert(switchBackDuringRunResult.activeBranchId === "main", "运行中切换后仍应能回到原会话", switchBackDuringRunResult);
      const deleteDuringRunResult = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/${encodeURIComponent(deleteDuringRunBranchId)}`, {
        method: "DELETE"
      });
      assert(!(deleteDuringRunResult.branchState?.branches || []).some((branch) => branch.id === deleteDuringRunBranchId), "其它空闲会话应能在当前会话运行中删除", deleteDuringRunResult.branchState);
      const liveMergedState = (await request(baseUrl, "/api/state")).state;
      assert(!(latestNovel(liveMergedState).planning?.branchState?.branches || []).some((branch) => branch.id === deleteDuringRunBranchId), "运行中 live snapshot 不能把已删除会话重新带回列表", latestNovel(liveMergedState).planning?.branchState);
      await request(baseUrl, `/api/novels/${novel.id}/planning-chat-cancel`, {
        method: "POST",
        body: JSON.stringify({ runId: persistentCancelRunId })
      });
      await request(baseUrl, `/api/novels/${novel.id}/planning-chat-cancel`, {
        method: "POST",
        body: JSON.stringify({ runId: queuedWhileRunningRunId })
      });
      const persistentCancelRun = await waitRun(baseUrl, novel.id, persistentCancelRunId);
      assert(persistentCancelRun.status === "cancelled", "取消后的运行应进入 cancelled 状态", persistentCancelRun);
      const queuedWhileCancelledRun = await waitRun(baseUrl, novel.id, queuedWhileRunningRunId);
      assert(queuedWhileCancelledRun.status === "cancelled", "运行中排队的第二条消息取消后也应收束，避免继续占用写锁", queuedWhileCancelledRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      persistentUser = (novel.planning?.messages || []).find((message) => message.runId === persistentCancelRunId && message.role === "user");
      const persistentAssistant = (novel.planning?.messages || []).find((message) => message.runId === persistentCancelRunId && message.role === "assistant");
      assert(persistentUser?.content === persistentCancelText, "取消或刷新后用户消息仍必须保留在当前会话历史中", novel.planning?.messages);
      assert(!persistentAssistant, "取消运行不应伪造 Agent 回复消息", persistentAssistant);
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ aiRoles: { planner: mockPlannerSetting } })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);

      const attachmentRunId = await startRunWithPayload(baseUrl, novel.id, {
        message: "[Agent 前端上下文提示]\n用户拖入的本轮临时文件。\n[拖入文件 1：设定.md]\n角色 A 喜欢雨天。\n[/拖入文件 1]\n\n[用户消息]\n请读取附件。",
        displayMessage: "请读取附件。",
        attachments: {
          files: [
            {
              id: "e2e_attachment_file",
              name: "设定.md",
              label: "设定.md",
              size: 28,
              text: "角色 A 喜欢雨天。",
              truncated: false,
              originalChars: 10
            }
          ]
        }
      }, "message_attachment");
      const attachmentRun = await waitRun(baseUrl, novel.id, attachmentRunId);
      assert(attachmentRun.status === "completed", "带附件的用户消息应正常完成", attachmentRun);
      assert((attachmentRun.evidencePlan?.layers || []).some((layer) => layer.name === "message_attachments"), "带附件的运行必须先把本轮拖入文件作为证据层读取", attachmentRun.evidencePlan);
      assert((attachmentRun.items || []).some((item) => item.toolType === "readMessageAttachment"), "拖入文件必须进入统一工具执行器，而不是只塞进 prompt", attachmentRun.items);
      const attachmentPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ limit: "80" })}`);
      const attachmentUser = (attachmentPage.messages || []).find((message) => message.runId === attachmentRunId && message.role === "user");
      assert(attachmentUser?.attachments?.files?.some((file) => file.name === "设定.md" && String(file.text || "").includes("角色 A 喜欢雨天")), "用户消息附件必须随会话消息返回，供显示和回到此处编辑恢复", attachmentUser);

      const revisedDraftText = [
        "# 后山有风",
        "",
        "这是用户改过的第一卷开头。".repeat(80),
        "",
        "人物在后山听见风声，旧歌被压在没有写完的稿纸下面。".repeat(80)
      ].join("\n");
      const revisedAttachmentRunId = await startRunWithPayload(baseUrl, novel.id, {
        message: "这是我已经改了一部分的第一卷，后面还没改完。",
        displayMessage: "这是我已经改了一部分的第一卷，后面还没改完。",
        attachments: {
          files: [
            {
              id: "e2e_revised_volume",
              name: "后山有风.md",
              label: "后山有风.md",
              size: Buffer.byteLength(revisedDraftText, "utf8"),
              text: revisedDraftText,
              truncated: false,
              originalChars: revisedDraftText.length
            }
          ]
        }
      }, "revised_volume_attachment");
      const revisedAttachmentRun = await waitRun(baseUrl, novel.id, revisedAttachmentRunId);
      assert(revisedAttachmentRun.status === "completed", "拖入改稿长文运行应完成", revisedAttachmentRun);
      assert((revisedAttachmentRun.items || []).some((item) => item.toolType === "readMessageAttachment"), "拖入改过的第一卷必须触发读取拖入文件工具", revisedAttachmentRun.items);
      assert(!(revisedAttachmentRun.items || []).every((item) => ["listFiles", "searchContextAssets"].includes(String(item.toolType || ""))), "改稿附件不能只触发列文件或旧证据检索", revisedAttachmentRun.items);
      assert((revisedAttachmentRun.evidencePlan?.layers || []).some((layer) => layer.name === "message_attachments" && layer.status === "completed"), "改稿附件证据层必须完成", revisedAttachmentRun.evidencePlan);

      const toolsResult = await request(baseUrl, `/api/novels/${novel.id}/planning-tools`);
      const tools = toolsResult.catalog.tools || [];
      assert(tools.length > 0, "工具目录不能为空", toolsResult.catalog);
      for (const tool of tools) {
        assert(tool.name && tool.inputSchema && tool.jsonSchema && tool.permission && tool.retry && tool.display && tool.resultSchema, "每个工具都必须暴露原生协议元数据", tool);
        assertStrictNativeToolSchema(tool.nativeTool?.function?.parameters, `nativeTool.${tool.name || tool.type}`);
      }
      assert((toolsResult.catalog.subAgentProfiles || []).some((profile) => profile.key === "character_consistency" && profile.permissionProfile === "read_only_novel_domain"), "工具目录必须暴露固定子 Agent 类型和权限画像", toolsResult.catalog.subAgentProfiles);
      assert((toolsResult.catalog.customTools || []).some((tool) => tool.name === "jsonSchemaValidate"), "工具目录必须暴露白名单自定义工具目录", toolsResult.catalog.customTools);
      assert(Array.isArray(toolsResult.catalog.mcpTools) && toolsResult.catalog.mcpTools.length === 0, "默认环境下 MCP 工具目录应存在但保持空白名单", toolsResult.catalog.mcpTools);
      const toolNames = new Set(tools.map((tool) => tool.name || tool.type));
      ["searchFiles", "readFile", "readMessageAttachment", "writeFile", "applyPatch", "revertPatch", "applyArchivePatch", "inspectNovelDiagnostics", "generatePrewritePlan", "runRoleplayTurn", "adaptRoleplayToProse", "postwriteProse", "runNormalWritingWorkflow", "runChapterWorkflow", "runShell"].forEach((name) => {
        assert(toolNames.has(name), `工具目录缺少统一入口：${name}`, tools.map((tool) => tool.name || tool.type));
      });
      const skillToolContract = state?.skillPacks?.planning?.skillOpsContract || {};
      ["generatePrewritePlan", "runNormalWritingWorkflow", "runChapterWorkflow", "runRoleplayTurn", "adaptRoleplayToProse", "postwriteProse"].forEach((name) => {
        assert(typeof skillToolContract[name] === "string" && skillToolContract[name].length > 20, `策划 skill 合同必须向模型说明行文工具：${name}`, skillToolContract);
      });
      const spawnTool = tools.find((tool) => (tool.name || tool.type) === "spawnSubAgent");
      assert((spawnTool?.jsonSchema?.properties?.profile?.enum || []).includes("lorebook_review"), "spawnSubAgent 必须用 schema 约束固定 profile", spawnTool);
    }

    if (shouldRunSuite(suite, "agent")) {
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planning: {
            agentPermissionMode: "full_auto",
            agentToolSettings: {
              ...novel.planning.agentToolSettings,
              customToolsEnabled: true
            }
          }
        })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(novel.aiRoles?.planner?.providerId === mockPlannerSetting.providerId && novel.aiRoles?.planner?.model === mockPlannerSetting.model, "自定义工具测试前 planner 必须仍是本地模拟模型", novel.aiRoles?.planner);
      const customToolRunId = await startRun(baseUrl, novel.id, "测试自定义工具 customTool jsonSchemaValidate，请调用后端白名单工具校验结构。", "custom_tool");
      const customToolRun = await waitRun(baseUrl, novel.id, customToolRunId);
      assert(customToolRun.status === "completed", "自定义工具运行应完成", customToolRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const customToolAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === customToolRunId && message.role === "assistant");
      const customToolResult = customToolAssistant?.skillOpReport?.searches?.find((item) => item.type === "customTool");
      assert(customToolResult?.results?.[0]?.ok === true, "自定义工具必须通过统一工具执行器返回结构化结果", {
        run: customToolRun,
        assistant: customToolAssistant,
        planning: novel.planning
      });
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planning: {
            agentPermissionMode: "ask_high_risk",
            agentToolSettings: {
              ...novel.planning.agentToolSettings,
              customToolsEnabled: false
            }
          }
        })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
    }

    if (shouldRunSuite(suite, "runtime")) {
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planning: {
            agentPermissionMode: "full_auto",
            agentToolSettings: {
              ...novel.planning.agentToolSettings,
              shellEnabled: true
            }
          }
        })
      });
      const shellRunId = await startRun(baseUrl, novel.id, "测试持续shell shell session startShellSession，请启动持续 shell 并分段读取环境后停止。", "shell_session");
      const shellRun = await waitRun(baseUrl, novel.id, shellRunId, { timeoutMs: 70000 });
      assert(shellRun.status === "completed", "持续 shell 运行应完成并清理会话", shellRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const shellAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === shellRunId && message.role === "assistant");
      const shellSearches = shellAssistant?.skillOpReport?.searches || [];
      const shellStart = shellSearches.find((item) => item.type === "startShellSession");
      const shellWrite = shellSearches.find((item) => item.type === "writeShellSession");
      const shellStop = shellSearches.find((item) => item.type === "stopShellSession");
      assert(shellStart?.segments?.length >= 1 && shellStart.lastSegment?.exitCode === 0, "startShellSession 必须返回分段命令记录和退出码", shellStart);
      assert(shellWrite?.segment?.segmentId && shellWrite.segment.exitCode === 0, "writeShellSession 必须返回本段命令 segment 和退出码", shellWrite);
      assert(shellStop?.stopped === true && shellStop.status === "stopped", "stopShellSession 必须确认会话已停止", shellStop);

      const shellJobRunId = await startRun(baseUrl, novel.id, "测试后台shell shell job startShellJob，请启动后台 shell 作业、读取输出并收束。", "shell_job");
      const shellJobRun = await waitRun(baseUrl, novel.id, shellJobRunId, { timeoutMs: 70000 });
      assert(shellJobRun.status === "completed", "后台 shell 作业运行应完成", shellJobRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const shellJobAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === shellJobRunId && message.role === "assistant");
      const shellJobSearches = shellJobAssistant?.skillOpReport?.searches || [];
      const shellJobStart = shellJobSearches.find((item) => item.type === "startShellJob");
      const shellJobRead = shellJobSearches.find((item) => item.type === "readShellJob");
      assert(shellJobStart?.jobId && ["running", "completed", "failed", "stopped"].includes(shellJobStart.status), "startShellJob 必须返回后台作业 id 和状态", shellJobStart);
      assert(shellJobRead?.jobId === shellJobStart.jobId && String(shellJobRead.output || shellJobRead.results?.[0]?.text || "").includes("shell-job-ok"), "readShellJob 必须读取后台作业输出", shellJobRead);
      const shellJobsPage = await request(baseUrl, `/api/novels/${novel.id}/planning-shell-jobs?${new URLSearchParams({ limit: "10" })}`);
      assert((shellJobsPage.jobs || []).some((job) => job.id === shellJobStart.jobId), "后台 shell 作业接口必须能列出作业", shellJobsPage);
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          planning: {
            agentPermissionMode: "ask_high_risk",
            agentToolSettings: {
              ...novel.planning.agentToolSettings,
              shellEnabled: false
            }
          }
        })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
    }

    if (shouldRunSuite(suite, "smoke", "agent")) {
      const nativeRunId = await startRun(baseUrl, novel.id, "测试原生工具协议 native tool_calls，并自动检索本地文件 notes 证据。", "native");
      const nativeRun = await waitRun(baseUrl, novel.id, nativeRunId);
      assert(nativeRun.status === "completed", "原生工具协议运行应完成", nativeRun);
      assert((nativeRun.evidencePlan?.reads || []).length > 0, "运行应自动读取历史/项目证据", nativeRun.evidencePlan);
      assert((nativeRun.items || []).some((item) => item.type === "evidence_read" || item.phase === "evidence"), "运行 item 中应有证据读取事件", nativeRun.items);
      assert((nativeRun.items || []).some((item) => item.protocol === "native_tool_call" || item.toolType === "listFiles"), "运行 item 中应记录原生工具调用", nativeRun.items);

      const writeRunId = await startRun(baseUrl, novel.id, "测试记忆写入 memory_write_only：请写入一条带证据的长期记忆。", "memory");
      const writeRun = await waitRun(baseUrl, novel.id, writeRunId);
      assert(writeRun.status === "completed", "记忆写入运行应完成", writeRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const memoryCountAfterWrite = novel.memory.items.length;
      assert(memoryCountAfterWrite > 0, "Agent 工具应写入至少一条记忆", novel.memory.items);
      assert(novel.memory.items.every((item) => (item.evidence || []).length > 0), "写入记忆必须带证据", novel.memory.items);

      await request(baseUrl, `/api/novels/${novel.id}/planning-chat-revert-last`, {
        method: "POST",
        body: JSON.stringify({ runId: writeRunId })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(novel.memory.items.length < memoryCountAfterWrite, "回退最近一轮后，记忆写入应被撤销", novel.memory.items);

      const messageOnlyRunId = await startRun(baseUrl, novel.id, "普通策划对话 message_only_revert：只回复，不写入档案、记忆或世界书。", "message_only_revert");
      const messageOnlyRun = await waitRun(baseUrl, novel.id, messageOnlyRunId);
      assert(messageOnlyRun.status === "completed", "普通无写入运行应完成", messageOnlyRun);
      const inlineOnlyReadRunId = await startRun(baseUrl, novel.id, `${novel.planning.defaultAgentFolder} 你可以看看这个文件夹，这是我之前写了部分的小说。只需要先看看并概括你看到了哪些资料，不要写入档案。`, "inline_only_read");
      const inlineOnlyReadRun = await waitRun(baseUrl, novel.id, inlineOnlyReadRunId);
      assert(inlineOnlyReadRun.status === "completed", "明确只看资料且不要写入档案时不应被写入守卫暂停或阻断", inlineOnlyReadRun);
      assert(!["tool_opportunity_paused", "blocked"].includes(String(inlineOnlyReadRun.phase || "")), "只读概括不应进入工具机会暂停或阻断阶段", inlineOnlyReadRun);
      assert(!(inlineOnlyReadRun.diagnostics || []).some((item) => ["model.invalid_json", "model.json_repaired", "agent.tool_opportunity", "agent.tool_opportunity_repeated"].includes(String(item.code || ""))), "只读自然语言回复不应触发 JSON 修复或写入工具机会守卫", inlineOnlyReadRun.diagnostics);
      assert(String(inlineOnlyReadRun.reply || inlineOnlyReadRun.assistantMessagePreview || "").trim(), "只读自然语言回复必须写入 run 摘要，避免刷新后只剩过程块", inlineOnlyReadRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const inlineOnlyAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === inlineOnlyReadRunId && message.role === "assistant");
      assert(String(inlineOnlyAssistant?.content || "").trim(), "只读自然语言回复必须落为正式 assistant 消息", inlineOnlyAssistant);
      assertPublicAgentSteps(inlineOnlyReadRun, "只读读取文件夹也应形成 Codex 式公开过程流");
      const messageOnlyRevert = await request(baseUrl, `/api/novels/${novel.id}/planning-chat-revert-last`, {
        method: "POST",
        body: JSON.stringify({ runId: messageOnlyRunId })
      });
      assert(messageOnlyRevert.mode === "message_only" && messageOnlyRevert.snapshotRestored === false, "普通无写入运行应走消息级回退", messageOnlyRevert);
      assert(String(messageOnlyRevert.userMessage || "").includes("message_only_revert"), "消息级回退必须把原始用户任务返回给前端", messageOnlyRevert);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(!(novel.planning.messages || []).some((message) => message.runId === messageOnlyRunId), "消息级回退后当前任务消息应被移除", novel.planning.messages);

      const archiveRunId = await startRun(baseUrl, novel.id, "测试mock档案写入 mock_archive_write：请通过 applyArchivePatch 写入核心命题和一个角色档案。", "archive_patch_tool");
      const archiveRun = await waitRun(baseUrl, novel.id, archiveRunId);
      assert(archiveRun.status === "completed", "档案工具写入运行应完成", archiveRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const archiveAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === archiveRunId && message.role === "assistant");
      assert(archiveAssistant?.skillOpReport?.applied?.some((item) => item.type === "applyArchivePatch"), "archivePatch 必须通过 applyArchivePatch 工具执行", archiveAssistant?.skillOpReport);
      assert(String(novel.archives.premise || "").trim(), "applyArchivePatch 应实际写入档案核心命题", novel.archives);
      const guardRunId = await startRun(baseUrl, novel.id, "tool_opportunity_guard：请提取并沉淀一个角色档案。这个用例要求 Agent 不能只把角色卡写在回复里，必须根据运行结果继续调用工具。", "tool_opportunity_guard");
      const guardRun = await waitRun(baseUrl, novel.id, guardRunId);
      assert(guardRun.status === "completed", "工具机会守卫运行应完成", guardRun);
      assert((guardRun.events || []).some((event) => event.type === "tool_opportunity"), "运行器必须记录未闭合工具机会事件", guardRun.events);
      assert((guardRun.diagnostics || []).some((item) => item.code === "agent.tool_opportunity"), "运行器必须保留 runtimeGuard 诊断记录", guardRun.diagnostics);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const guardAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === guardRunId && message.role === "assistant");
      assert(guardAssistant?.skillOpReport?.applied?.some((item) => item.type === "applyArchivePatch"), "runtimeGuard 之后必须由 Agent 自己调用 applyArchivePatch 写入", guardAssistant?.skillOpReport);
      assert((novel.archives?.characters || []).some((item) => item.name === "工具机会守卫角色"), "工具机会守卫角色必须真实写入项目档案", novel.archives?.characters);
      const verifierRepairRunId = await startRun(baseUrl, novel.id, "verifier_repair_guard：测试完成审查失败后不要直接阻断，要把审查结果回灌给 Agent 修正。", "verifier_repair_guard");
      const verifierRepairRun = await waitRun(baseUrl, novel.id, verifierRepairRunId);
      assert(verifierRepairRun.status === "completed", "完成审查失败后应先给 Agent 修正机会并最终完成", verifierRepairRun);
      assert((verifierRepairRun.events || []).some((event) => event.type === "verifier_repair_required"), "完成审查失败必须记录回灌修正事件", verifierRepairRun.events);
      assert((verifierRepairRun.diagnostics || []).some((item) => item.code === "verifier.failed_repair"), "完成审查回灌必须保留结构化诊断", verifierRepairRun.diagnostics);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const verifierRepairAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === verifierRepairRunId && message.role === "assistant");
      assert(verifierRepairAssistant?.completionVerifier?.status === "passed", "Agent 修正后完成审查应通过", verifierRepairAssistant?.completionVerifier);
      const versionGraphAfterArchive = await request(baseUrl, `/api/novels/${novel.id}/planning-version-graph?${new URLSearchParams({ allBranches: "1", limit: "220" })}`);
      assert(versionGraphAfterArchive.graph?.nodes?.some((node) => node.kind === "agent_run" && node.sourceId === archiveRunId), "版本图必须包含 Agent run 节点", versionGraphAfterArchive.graph);
      assert(versionGraphAfterArchive.graph?.nodes?.some((node) => node.kind === "tool_write" && node.meta?.toolType === "applyArchivePatch"), "版本图必须包含档案写入工具节点", versionGraphAfterArchive.graph);
      assert(versionGraphAfterArchive.graph?.nodes?.some((node) => node.kind === "model_call" || node.kind === "evidence_read"), "版本图必须包含 run item 级节点", versionGraphAfterArchive.graph);
      assert((versionGraphAfterArchive.graph?.responseTree?.currentPathIds || []).length > 0, "版本图必须派生 response tree 当前路径", versionGraphAfterArchive.graph?.responseTree);
      assert(versionGraphAfterArchive.graph?.edges?.length > 0, "版本图必须生成可追踪父子边", versionGraphAfterArchive.graph);

      const smokeProse = await request(baseUrl, `/api/novels/${novel.id}/adapt`, { method: "POST" }).catch(() => null);
      if (smokeProse?.prose?.id) {
        const edited = await request(baseUrl, `/api/novels/${novel.id}/prose/${smokeProse.prose.id}`, {
          method: "PUT",
          body: JSON.stringify({ text: `${smokeProse.prose.text}\n\nE2E smoke 用户改稿。` })
        });
        assert(edited.prose?.versionHistory?.length >= 2 && edited.prose.versionType === "user_edit", "正文编辑必须写入版本历史", edited.prose);
        assertProseVersionSnapshots(edited.prose, "正文编辑版本历史");
        const proseTree = await request(baseUrl, `/api/novels/${novel.id}/prose-version-tree`);
        assert(proseTree.tree?.nodes?.some((node) => node.id === smokeProse.prose.id && node.versionCount >= 2), "正文版本树必须包含编辑后的版本事件", proseTree.tree);
        const proseDiff = await request(baseUrl, `/api/novels/${novel.id}/prose/${smokeProse.prose.id}/diff`);
        assert(proseDiff.diff?.diff && proseDiff.diff.toHash, "正文 diff API 必须返回 unified diff 和 hash", proseDiff.diff);
        const qualityGate = await request(baseUrl, `/api/novels/${novel.id}/quality-gate`, {
          method: "POST",
          body: JSON.stringify({ scope: "all" })
        });
        assert(["passed", "warning", "blocked"].includes(qualityGate.gate?.status) && Array.isArray(qualityGate.gate?.issues), "质量门禁必须返回可验收状态和问题列表", qualityGate.gate);
        assert(qualityGate.gate?.acceptanceChain?.steps?.length >= 3, "质量门禁必须返回可执行验收链步骤", qualityGate.gate);
        const qualityPreview = await request(baseUrl, `/api/novels/${novel.id}/quality-gate`, {
          method: "POST",
          body: JSON.stringify({ scope: "all", mode: "preview_fix" })
        });
        assert(qualityPreview.executor?.plan && Array.isArray(qualityPreview.executor.plan.safeFixes), "验收链修复预览必须返回结构化修复计划", qualityPreview.executor);
        const ragQuality = await request(baseUrl, `/api/novels/${novel.id}/rag-quality`);
        assert(Number.isFinite(ragQuality.quality?.score) && ragQuality.quality?.metrics, "RAG 质量评估必须返回分数和指标", ragQuality.quality);
        assert(Number.isFinite(ragQuality.benchmark?.score) && ragQuality.benchmark?.metrics, "RAG 质量接口必须返回小说域测试集 benchmark", ragQuality.benchmark);
        const ragBenchmark = await request(baseUrl, `/api/novels/${novel.id}/rag-benchmark`, {
          method: "POST",
          body: JSON.stringify({ limit: 80 })
        });
        assert(Array.isArray(ragBenchmark.benchmark?.cases) && ragBenchmark.benchmark.counts?.total >= 0, "RAG benchmark 必须返回测试用例结果", ragBenchmark.benchmark);
      }
    }

    if (shouldRunSuite(suite, "agent")) {
      const memoryRejectRunId = await startRun(baseUrl, novel.id, "测试记忆写入拒绝 memory_blob_reject：请尝试把工具报告写入长期记忆，应该被合同阻断。", "memory_reject");
      const memoryRejectRun = await waitRun(baseUrl, novel.id, memoryRejectRunId);
      assert(["blocked", "failed", "paused"].includes(memoryRejectRun.status), "记忆污染写入不应被误标记为完成", memoryRejectRun);
      assert((memoryRejectRun.diagnostics || []).some((item) => {
        const text = JSON.stringify(item);
        return /memory\.(value_blob_like|raw_structured_blob|field_is_archive_blob|category_too_vague)/.test(text) || item.category === "schema_error";
      }), "记忆污染写入必须给出结构化合同错误", memoryRejectRun.diagnostics);
    }

    if (shouldRunSuite(suite, "writing")) {
      await request(baseUrl, `/api/novels/${novel.id}/characters`, {
        method: "POST",
        body: JSON.stringify({
          name: "林夏",
          roleType: "major",
          description: "林夏16岁，是雨夜异常信号的第一发现者。称呼：小夏",
          aliases: ["小夏"]
        })
      });
      await request(baseUrl, `/api/novels/${novel.id}/characters`, {
        method: "POST",
        body: JSON.stringify({
          name: "周岑",
          roleType: "major",
          description: "周岑负责跟进现场，称呼：小夏",
          aliases: ["小夏"]
        })
      });
      await request(baseUrl, `/api/novels/${novel.id}/lorebook/entries`, {
        method: "POST",
        body: JSON.stringify({
          name: "雨夜信号",
          keys: ["雨夜", "异常信号"],
          content: "雨夜异常信号会在角色接近关键地点时触发，角色只能感知现场异常，不能直接知道幕后真相。",
          priority: 20,
          visibility: ["planner", "director", "adapter", "minor", "character:*"]
        })
      });
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aiRoles: {
            guide: mockPlannerSetting,
            minor: mockPlannerSetting,
            adapter: mockPlannerSetting
          }
        })
      });
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      for (const character of novel.characters.filter((item) => item.roleType === "major")) {
        await request(baseUrl, `/api/novels/${novel.id}/characters/${character.id}`, {
          method: "PUT",
          body: JSON.stringify({
            ...character,
            providerId: mockPlannerSetting.providerId,
            model: mockPlannerSetting.model,
            temperature: mockPlannerSetting.temperature
          })
        });
      }
      const chapterRun = await request(baseUrl, `/api/novels/${novel.id}/chapter-workflow/run`, {
        method: "POST",
        body: JSON.stringify({
          intent: "E2E 验证章节工作流：雨夜异常信号进入第一场，角色只能自主反应。",
          chapterLabel: "E2E 第一章",
          forceNew: true,
          steps: ["prewrite", "roleplay", "review", "adapt"]
        })
      });
      assert(chapterRun.workflow?.id && chapterRun.plan?.workflowId === chapterRun.workflow.id, "章节工作流必须绑定写前定位", chapterRun);
      assert(chapterRun.workflow?.mode === "roleplay_prose", "章节工作流默认应标记为扮演行文链路", chapterRun.workflow);
      assert(chapterRun.turn?.workflowId === chapterRun.workflow.id && chapterRun.turn?.contextAudit, "扮演轮次必须绑定工作流并写入上下文审计", chapterRun.turn);
      assert(chapterRun.turn?.transcript?.actors?.length > 0, "扮演轮次必须生成标准化 transcript", chapterRun.turn?.transcript);
      const firstMajor = chapterRun.turn.performances.find((item) => item.kind === "major" && item.characterId);
      assert(firstMajor?.characterId, "章节工作流应生成主要角色扮演记录", chapterRun.turn.performances);
      assert(chapterRun.turn.contextAudit.characters[firstMajor.characterId]?.strategy === "tavern_context", "主要角色上下文策略必须是酒馆式 tavern_context", chapterRun.turn.contextAudit);
      assert(chapterRun.turn.contextAudit.characters[firstMajor.characterId]?.runtimeDirective?.forbiddenKnowledge?.length > 0, "角色上下文审计必须记录禁知指令", chapterRun.turn.contextAudit.characters[firstMajor.characterId]);
      assert((chapterRun.turn.contextAudit.characters[firstMajor.characterId]?.triggeredLore || []).some((item) => item.matchDetail?.primary?.matches?.length > 0), "角色世界书触发审计必须记录结构化主触发命中", chapterRun.turn.contextAudit.characters[firstMajor.characterId]?.triggeredLore);
      assert(chapterRun.prose?.status === "draft" && chapterRun.prose.workflowId === chapterRun.workflow.id, "改写正文草稿必须绑定同一工作流", chapterRun.prose);
      assert(chapterRun.prose?.paragraphGroups?.length > 0 && chapterRun.prose?.adaptationPlan?.mode, "正文 Agent 必须保存段落组改写计划", chapterRun.prose);
      const turnCountAfterRoleplayWorkflow = latestNovel((await request(baseUrl, "/api/state")).state).session.turns.length;
      const normalWritingRun = await request(baseUrl, `/api/novels/${novel.id}/normal-writing-workflow/run`, {
        method: "POST",
        body: JSON.stringify({
          intent: "E2E 验证正常行文：不启动角色扮演，直接按写前定位、档案和世界书生成正文草稿。",
          chapterLabel: "E2E 正常行文",
          forceNew: true,
          steps: ["prewrite", "draft", "review"]
        })
      });
      assert(normalWritingRun.workflow?.mode === "normal_prose", "正常行文链路必须标记 mode=normal_prose", normalWritingRun.workflow);
      assert(normalWritingRun.plan?.workflowId === normalWritingRun.workflow.id, "正常行文必须先绑定写前定位", normalWritingRun);
      assert(normalWritingRun.prose?.workflowId === normalWritingRun.workflow.id && normalWritingRun.prose?.status === "draft", "正常行文必须生成同一工作流下的正文草稿", normalWritingRun.prose);
      assert(/^normal_prose/.test(normalWritingRun.prose?.adaptationPlan?.mode || ""), "正常行文正文计划必须标记 normal_prose 模式", normalWritingRun.prose?.adaptationPlan);
      assert((normalWritingRun.prose?.turnRange || []).length === 0 && !(normalWritingRun.prose?.adaptationPlan?.sourceTurnIds || []).length, "正常行文不能伪装成扮演记录改写", normalWritingRun.prose);
      assert(normalWritingRun.review?.targetType === "prose" && normalWritingRun.review?.targetId === normalWritingRun.prose.id, "正常行文必须审查生成的正文草稿", normalWritingRun.review);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(novel.session.turns.length === turnCountAfterRoleplayWorkflow, "正常行文链路不能新增扮演轮次", novel.session.turns);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const latestLoreLog = [...(novel.lorebook?.triggerLogs || [])].reverse().find((log) => log.entryId && log.matchDetail);
      assert(latestLoreLog?.matchDetail?.primary?.matches?.length > 0 && /主触发/.test(latestLoreLog.reason || ""), "世界书触发日志必须包含结构化命中详情和可读原因", latestLoreLog);
      const workflowPage = await request(baseUrl, `/api/novels/${novel.id}/chapter-workflow?${new URLSearchParams({ workflowId: chapterRun.workflow.id })}`);
      assert(workflowPage.workflow?.id === chapterRun.workflow.id && workflowPage.contextAudit, "章节工作流查询接口必须按 workflowId 返回目标工作流和上下文审计", workflowPage);
      assert(workflowPage.modelStrategy?.slots?.length > 0, "章节工作流状态必须返回模型策略报告", workflowPage.modelStrategy);
      const prewriteOnlyRun = await request(baseUrl, `/api/novels/${novel.id}/chapter-workflow/run`, {
        method: "POST",
        body: JSON.stringify({
          intent: "E2E 验证指定工作流参数：先只生成写前定位，再按同一工作流运行扮演和改写。",
          chapterLabel: "E2E 指定工作流",
          forceNew: true,
          steps: ["prewrite"]
        })
      });
      const boundWorkflowRun = await request(baseUrl, `/api/novels/${novel.id}/chapter-workflow/run`, {
        method: "POST",
        body: JSON.stringify({
          workflowId: prewriteOnlyRun.workflow.id,
          steps: ["roleplay", "adapt"]
        })
      });
      assert(boundWorkflowRun.turn?.workflowId === prewriteOnlyRun.workflow.id, "指定 workflowId 后，扮演轮次必须绑定目标工作流", boundWorkflowRun.turn);
      assert(boundWorkflowRun.prose?.workflowId === prewriteOnlyRun.workflow.id, "指定 workflowId 后，改写正文必须绑定目标工作流", boundWorkflowRun.prose);
      const repairRun = await request(baseUrl, `/api/novels/${novel.id}/chapter-workflow/run`, {
        method: "POST",
        body: JSON.stringify({
          intent: "E2E 测试段落组修复：测试段落组修复 paragraph repair，让正文 Agent 先生成一个 failed 段落组再自动整组重写。",
          chapterLabel: "E2E 段落组修复",
          forceNew: true,
          steps: ["prewrite", "roleplay", "adapt"]
        })
      });
      assert(repairRun.prose?.adaptationPlan?.repairStatus === "completed", "段落组 failed 后应自动整组修复并标记 completed", repairRun.prose?.adaptationPlan);
      assert((repairRun.prose?.adaptationPlan?.repairedGroupIds || []).length > 0, "段落组修复计划必须记录 repairedGroupIds", repairRun.prose?.adaptationPlan);
      assert((repairRun.prose?.paragraphGroups || []).some((group) => group.rewriteCount >= 1), "被修复段落组必须记录 rewriteCount", repairRun.prose?.paragraphGroups);
      assert(!(repairRun.prose?.paragraphGroups || []).some((group) => Object.values(group.checks || {}).some((check) => check?.status === "failed")), "自动修复后不应残留 failed 段落组", repairRun.prose?.paragraphGroups);
      const rerunResult = await request(baseUrl, `/api/novels/${novel.id}/turns/${chapterRun.turn.id}/characters/${firstMajor.characterId}/rerun`, { method: "POST" });
      assert(rerunResult.performance?.rerunCount >= 1 && rerunResult.turn?.contextAudit?.characters?.[firstMajor.characterId] && rerunResult.turn?.transcript?.actors?.some((actor) => actor.characterId === firstMajor.characterId && actor.rerunCount >= 1), "单角色重跑必须更新角色上下文审计和 transcript", rerunResult);
      const editedProse = await request(baseUrl, `/api/novels/${novel.id}/prose/${chapterRun.prose.id}`, {
        method: "PUT",
        body: JSON.stringify({ text: `${chapterRun.prose.text}\n\n用户改稿：删掉多余说明，保留角色动作。` })
      });
      assert(editedProse.prose?.revisionLearningIds?.length > 0, "编辑正文后必须生成改稿学习候选", editedProse.prose);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const latestLearningId = editedProse.prose.revisionLearningIds[editedProse.prose.revisionLearningIds.length - 1];
      const confirmLearning = await request(baseUrl, `/api/novels/${novel.id}/revision-learnings/${latestLearningId}`, {
        method: "POST",
        body: JSON.stringify({ status: "confirmed" })
      });
      assert(confirmLearning.learning?.status === "confirmed", "改稿学习必须可确认", confirmLearning);
      const acceptResult = await request(baseUrl, `/api/novels/${novel.id}/prose/${chapterRun.prose.id}/accept`, { method: "POST" });
      assert(acceptResult.prose?.status === "accepted" && acceptResult.prose?.postwriteBack?.status, "采纳正文必须触发写后回写状态", acceptResult.prose);
      assert(acceptResult.prose?.postwriteBack?.memoryItems >= 1, "写后回写必须至少沉淀一条结构化记忆", acceptResult.prose);
      assertProseVersionSnapshots(acceptResult.prose, "采纳正文版本历史");
      const proseTree = await request(baseUrl, `/api/novels/${novel.id}/prose-version-tree`);
      assert(proseTree.tree?.nodes?.some((node) => node.id === chapterRun.prose.id && node.status === "accepted" && node.versionCount >= 3), "正文版本树必须记录草稿、用户改稿和采纳事件", proseTree.tree);
      const proseDiff = await request(baseUrl, `/api/novels/${novel.id}/prose/${chapterRun.prose.id}/diff`);
      assert(proseDiff.diff?.versionHistory?.length >= 3 && proseDiff.diff.toHash, "正文 diff 必须带版本历史和 hash", proseDiff.diff);
      const qualityGate = await request(baseUrl, `/api/novels/${novel.id}/quality-gate`, {
        method: "POST",
        body: JSON.stringify({ scope: "all" })
      });
      assert(["passed", "warning", "blocked"].includes(qualityGate.gate?.status) && qualityGate.gate?.issues?.every((issue) => issue.suggestedFix && issue.recheckScope), "质量门禁必须给出阻断状态、修复建议和复检范围", qualityGate.gate);
      const ragQuality = await request(baseUrl, `/api/novels/${novel.id}/rag-quality`);
      assert(Number.isFinite(ragQuality.quality?.score) && ragQuality.quality?.metrics?.lorebookTriggerPrecision !== undefined, "RAG 质量评估必须返回小说域指标", ragQuality.quality);
      const chapterToolRunId = await startRun(baseUrl, novel.id, "测试章节工作流 runChapterWorkflow：请通过统一工具运行写前定位、扮演、审查和改写。", "chapter_workflow_tool");
      const chapterToolRun = await waitRun(baseUrl, novel.id, chapterToolRunId, { timeoutMs: 70000 });
      assert(chapterToolRun.status === "completed", "章节工作流工具运行应完成", chapterToolRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const chapterToolAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === chapterToolRunId && message.role === "assistant");
      assert(chapterToolAssistant?.skillOpReport?.applied?.some((item) => item.type === "runChapterWorkflow"), "章节链路必须通过统一工具执行器进入 applied 报告", chapterToolAssistant?.skillOpReport);
      const normalToolRunId = await startRun(baseUrl, novel.id, "测试正常行文 runNormalWritingWorkflow：请不要启动角色扮演，直接按写前定位生成并审查正文草稿。", "normal_writing_tool");
      const normalToolRun = await waitRun(baseUrl, novel.id, normalToolRunId, { timeoutMs: 70000 });
      assert(normalToolRun.status === "completed", "正常行文工具运行应完成", normalToolRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const normalToolAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === normalToolRunId && message.role === "assistant");
      assert(normalToolAssistant?.skillOpReport?.applied?.some((item) => item.type === "runNormalWritingWorkflow"), "正常行文必须通过统一工具执行器进入 applied 报告", normalToolAssistant?.skillOpReport);
      const normalWorkflow = [...(novel.session.chapterWorkflows || [])].reverse().find((item) => item.mode === "normal_prose");
      const normalProse = [...(novel.session.proseParts || [])].reverse().find((item) => item.workflowId === normalWorkflow?.id);
      assert(normalWorkflow?.id && normalProse?.id && /^normal_prose/.test(normalProse.adaptationPlan?.mode || ""), "策划 Agent 正常行文工具必须真实生成 normal_prose 正文草稿", { normalWorkflow, normalProse });
    }
    if (shouldRunSuite(suite, "writing")) {
      await request(baseUrl, `/api/novels/${novel.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          archives: {
            characters: [
              {
                name: "林夏",
                roleType: "major",
                age: 18,
                description: "档案记录林夏18岁，称呼：信号使"
              }
            ]
          }
        })
      });
      await request(baseUrl, `/api/novels/${novel.id}/lorebook/entries`, {
        method: "POST",
        body: JSON.stringify({
          name: "林夏世界书冲突项",
          keys: ["林夏"],
          content: "林夏20岁时第一次听见雨夜信号。",
          priority: 10
        })
      });
      await request(baseUrl, `/api/novels/${novel.id}/lorebook/entries`, {
        method: "POST",
        body: JSON.stringify({
          name: "林夏世界书重复关键词",
          keys: ["林夏"],
          content: "林夏与异常信号存在直接关联。",
          priority: 5
        })
      });
      await stopTestServer(child);
      child = null;
      const seededStore = JSON.parse(await fs.readFile(storePath, "utf8"));
      const seededNovel = seededStore.novels.find((item) => item.id === novel.id);
      assert(seededNovel, "诊断器测试应能找到待注入资料的小说", seededStore.novels);
      seededNovel.archives = seededNovel.archives || {};
      seededNovel.archives.characters = seededNovel.archives.characters || [];
      seededNovel.archives.characters.push(
        { name: "重复主键角色", description: "E2E 构造的重复档案条目 A。" },
        { name: "重复主键角色", description: "E2E 构造的重复档案条目 B。" }
      );
      seededNovel.memory = seededNovel.memory || { items: [] };
      seededNovel.memory.items = seededNovel.memory.items || [];
      seededNovel.memory.items.push(
        {
          id: "memory_conflict_age_a",
          scope: "global",
          ownerId: "",
          category: "timeline_fact",
          subject: "林夏",
          field: "年龄",
          value: "16岁",
          status: "active",
          visibility: ["planner", "director"],
          evidence: ["E2E 构造：角色卡年龄证据"],
          source: { type: "e2e", id: "memory_conflict_age_a" }
        },
        {
          id: "memory_conflict_age_b",
          scope: "global",
          ownerId: "",
          category: "relationship_fact",
          subject: "林夏",
          field: "年龄",
          value: "18岁",
          status: "active",
          visibility: ["planner", "director"],
          evidence: ["E2E 构造：档案年龄证据"],
          source: { type: "e2e", id: "memory_conflict_age_b" }
        }
      );
      seededNovel.planning = seededNovel.planning || {};
      seededNovel.planning.defaultRoleplayConfig = {
        id: "roleplay_config_bad_e2e",
        source: "e2e",
        updatedAt: new Date().toISOString(),
        config: {
          characters: [{ name: "林夏" }]
        }
      };
      seededNovel.session = seededNovel.session || {};
      seededNovel.session.proseParts = seededNovel.session.proseParts || [];
      seededNovel.session.proseParts.push({
        id: "prose_fact_trace_missing_e2e",
        status: "accepted",
        text: "林夏在雨夜确认异常信号后离开现场。幕后真相只能由导演和改写器知道，不应该在这里直接写出。",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        postwriteBack: { status: "pending" }
      });
      seededNovel.session.prewritePlan = {
        id: "prewrite_diag_e2e",
        workflowId: "workflow_diag_e2e",
        chapterLabel: "诊断测试章节",
        summary: "诊断测试",
        backgroundOnly: ["幕后真相只能由导演和改写器知道"],
        foregroundAnchors: ["雨夜", "异常信号", "现场", "林夏"],
        characterBeats: [],
        sceneFocus: [],
        softBoundaries: [],
        continuityAnchors: [],
        openQuestions: [],
        directorNote: "诊断测试"
      };
      seededNovel.session.turns = seededNovel.session.turns || [];
      seededNovel.session.turns.push({
        id: "turn_visibility_e2e",
        workflowId: "workflow_diag_e2e",
        index: 999,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        guide: {
          parsed: {
            scene_goal: "必须让林夏说出幕后真相，并让周岑立即承认。",
            forbidden_moves: ["必须", "必须", "必须", "必须", "必须", "必须", "必须"],
            director_note: "强制推动"
          },
          text: "必须让林夏说出幕后真相，并让周岑立即承认。"
        },
        performances: [
          {
            kind: "major",
            characterId: "",
            name: "林夏",
            text: "director_note：林夏知道周岑其实想隐瞒真相。",
            parsed: {
              speech: "我知道你其实想隐瞒。",
              action: "林夏看向周岑。",
              inner_thought: "周岑其实想隐瞒真相。"
            }
          }
        ],
        contextAudit: {
          builtAt: new Date().toISOString(),
          director: { strategy: "orchestration_rag", triggeredLoreCount: 0, structuredMemoryCount: 0, retrievedEvidenceCount: 0 },
          characters: {},
          minor: null
        },
        directorControlAudit: {
          status: "overcontrolled",
          score: 88,
          findings: ["E2E 构造的导演过控"],
          checkedAt: new Date().toISOString()
        }
      });
      await fs.writeFile(storePath, `${JSON.stringify(seededStore, null, 2)}\n`, "utf8");
      child = startTestServer(port, dataDir, novelsDir, logs);
      await waitForServer(baseUrl, child);

      const diagnosticsRunId = await startRun(baseUrl, novel.id, "测试小说资料诊断器 inspectNovelDiagnostics，请检查当前资料一致性后收束，不要写入。", "diagnostics");
      const diagnosticsRun = await waitRun(baseUrl, novel.id, diagnosticsRunId);
      assert(diagnosticsRun.status === "completed", "诊断器运行应完成", diagnosticsRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const diagnosticsAssistant = [...(novel.planning.messages || [])].reverse().find((message) => message.runId === diagnosticsRunId && message.role === "assistant");
      assert(diagnosticsAssistant?.skillOpReport?.searches?.some((item) => item.type === "inspectNovelDiagnostics"), "诊断器必须作为统一工具执行并进入检索报告", diagnosticsAssistant?.skillOpReport);
      const diagnosticsToolResult = diagnosticsAssistant.skillOpReport.searches.find((item) => item.type === "inspectNovelDiagnostics");
      const diagnosticCodes = new Set((diagnosticsToolResult.results || []).map((item) => item.code));
      assert(diagnosticCodes.has("character.age_conflict"), "诊断器必须发现角色年龄冲突", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("character.address_alias_conflict"), "诊断器必须发现角色称呼/别名冲突", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("lorebook.archive_fact_conflict"), "诊断器必须发现世界书与档案事实冲突", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("lorebook.keyword_conflict"), "诊断器必须发现世界书关键词重复", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("archive.record_duplicate_key"), "诊断器必须发现档案主键重复", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("memory.fact_conflict"), "诊断器必须发现长期记忆事实冲突", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("roleplay_config.schema_invalid"), "诊断器必须发现扮演配置结构问题", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("prose.fact_trace_missing"), "诊断器必须发现已采纳正文缺少事实追踪", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("roleplay.director_overcontrol"), "诊断器必须发现导演过控", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("roleplay.visibility.director_meta_leak"), "诊断器必须发现角色输出泄漏导演元信息", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("prose.background_only_leaked"), "诊断器必须发现正文写出后台信息", diagnosticsToolResult.results);
      assert(diagnosticCodes.has("prose.postwrite_missing"), "诊断器必须发现已采纳正文缺少写后回写", diagnosticsToolResult.results);
      const qualityPreview = await request(baseUrl, `/api/novels/${novel.id}/quality-gate`, {
        method: "POST",
        body: JSON.stringify({ scope: "all", mode: "preview_fix" })
      });
      assert(qualityPreview.executor?.plan?.manualFixes?.length >= 1 && qualityPreview.executor.before?.acceptanceChain, "验收链必须能把诊断问题转成修复预览和阻断项", qualityPreview.executor);
      const qualityApply = await request(baseUrl, `/api/novels/${novel.id}/quality-gate`, {
        method: "POST",
        body: JSON.stringify({ scope: "all", mode: "apply_safe_fixes" })
      });
      assert(qualityApply.executor?.after && ["passed", "warning", "blocked"].includes(qualityApply.executor.after.status), "验收链应用低风险修复后必须自动复检", qualityApply.executor);
      const benchmarkResult = await request(baseUrl, `/api/novels/${novel.id}/rag-benchmark`, {
        method: "POST",
        body: JSON.stringify({
          cases: [
            { id: "e2e_lore_hit", category: "lorebook_should_trigger", task: "character", characterId: novel.characters.find((item) => item.name === "林夏")?.id || "", query: "雨夜 异常信号", expectedEntryId: novel.lorebook.entries.find((entry) => entry.name === "雨夜信号")?.id || "" }
          ],
          limit: 40
        })
      });
      assert(Number.isFinite(benchmarkResult.benchmark?.score) && benchmarkResult.benchmark?.cases?.some((item) => item.id === "e2e_lore_hit"), "RAG benchmark 必须执行显式小说域测试用例", benchmarkResult.benchmark);
      const reviewWithChain = (novel.session?.reviews || []).find((review) => Array.isArray(review.chain) && review.chain.length > 0);
      assert(reviewWithChain?.chain?.some((item) => item.type === "director_overcontrol"), "审查记录必须包含固定评审链", reviewWithChain);
    }

    if (shouldRunSuite(suite, "agent")) {
      await request(baseUrl, `/api/novels/${novel.id}/planning-branches/switch`, {
        method: "POST",
        body: JSON.stringify({ branchId: "main" })
      });
      const externalApprovalDir = path.join(tempRoot, "external-approval");
      await fs.mkdir(externalApprovalDir, { recursive: true });
      const firstExternalFile = path.join(externalApprovalDir, "first.txt");
      const secondExternalFile = path.join(externalApprovalDir, "second.txt");
      const approvalRunId = await startRun(
        baseUrl,
        novel.id,
        `测试外部电脑操作 外部写入 externalPath: "${firstExternalFile}"`,
        "external_approval"
      );
      const awaitingApprovalRun = await waitRunStatus(baseUrl, novel.id, approvalRunId, "awaiting_approval", { timeoutMs: 20000 });
      const pendingApproval = (awaitingApprovalRun.approvals || []).find((approval) => approval.status === "pending");
      assert(pendingApproval?.id, "外部路径写入必须主动进入人工确认状态", awaitingApprovalRun);
      const approvalDecision = await request(baseUrl, `/api/novels/${novel.id}/planning-runs/${approvalRunId}/approvals/${pendingApproval.id}`, {
        method: "POST",
        body: JSON.stringify({ decision: "approved", scope: "session" })
      });
      assert(approvalDecision.rememberedPermission?.directoryRules >= 1, "当前会话授权必须写入目录规则", approvalDecision.rememberedPermission);
      const approvedRun = await waitRun(baseUrl, novel.id, approvalRunId, { timeoutMs: 50000 });
      assert(approvedRun.status === "completed", "批准后原运行必须自动继续并完成", approvedRun);
      assertPublicAgentSteps(approvedRun, "权限批准后的运行应保持公开过程流");
      assert((approvedRun.activityTimeline || []).some((item) => item.kind === "approval" && item.status === "completed"), "批准结果应合并到同一条权限活动中", approvedRun.activityTimeline);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert((novel.planning.agentPermissionPolicy?.directoryRules || []).some((rule) => rule.scope === "session" && rule.branchId === "main" && rule.access === "write"), "会话级目录授权必须绑定当前会话", novel.planning.agentPermissionPolicy);
      const repeatedApprovalRunId = await startRun(
        baseUrl,
        novel.id,
        `测试外部电脑操作 外部写入 externalPath: "${secondExternalFile}"`,
        "external_approval_reuse"
      );
      const repeatedApprovalRun = await waitRun(baseUrl, novel.id, repeatedApprovalRunId, { timeoutMs: 50000 });
      assert(repeatedApprovalRun.status === "completed", "同会话同目录外部写入不应反复要求确认", repeatedApprovalRun);
      assert(!(repeatedApprovalRun.approvals || []).some((approval) => approval.status === "pending"), "复用会话授权后不应留下新的待确认审批", repeatedApprovalRun.approvals);

      const externalReadDir = path.join(tempRoot, "external-read");
      await fs.mkdir(externalReadDir, { recursive: true });
      await fs.writeFile(path.join(externalReadDir, "notes.md"), "旧稿资料：允许列目录后应能继续读取同目录文件。\n", "utf8");
      const listThenReadRunId = await startRun(
        baseUrl,
        novel.id,
        `测试外部电脑操作 外部列读 externalPath: "${externalReadDir}" externalFile: "notes.md"`,
        "external_list_then_read"
      );
      const awaitingReadApprovalRun = await waitRunStatus(baseUrl, novel.id, listThenReadRunId, "awaiting_approval", { timeoutMs: 20000 });
      const pendingReadApproval = (awaitingReadApprovalRun.approvals || []).find((approval) => approval.status === "pending");
      assert(pendingReadApproval?.id, "外部目录列文件必须主动进入人工确认状态", awaitingReadApprovalRun);
      await request(baseUrl, `/api/novels/${novel.id}/planning-runs/${listThenReadRunId}/approvals/${pendingReadApproval.id}`, {
        method: "POST",
        body: JSON.stringify({ decision: "approved", scope: "session" })
      });
      const listThenReadRun = await waitRun(baseUrl, novel.id, listThenReadRunId, { timeoutMs: 50000 });
      assert(listThenReadRun.status === "completed", "批准外部目录只读后，同一轮读取同目录文件必须继续完成", listThenReadRun);
      assert((listThenReadRun.items || []).some((item) => item.toolType === "listFiles" && item.status === "completed"), "外部目录列文件应成功记录为完成动作", listThenReadRun.items);
      assert((listThenReadRun.items || []).some((item) => ["readFile", "readLocalFile"].includes(String(item.toolType || "")) && item.status === "completed"), "同目录文件读取应复用只读授权并成功", listThenReadRun.items);
      assert((listThenReadRun.approvals || []).filter((approval) => approval.status !== "rejected").length === 1, "同一轮 listFiles 后 readFile 不应重复请求同目录只读权限", listThenReadRun.approvals);
      assert((listThenReadRun.activityTimeline || []).some((item) => item.label === "读取文件内容"), "客户端运行记录应提供用户可读的读取文件动作", listThenReadRun.activityTimeline);
      assertPublicAgentSteps(listThenReadRun, "列读外部文件应形成公开过程流");
      const naturalExternalFolderRunId = await startRun(
        baseUrl,
        novel.id,
        `${externalReadDir} 你可以看看这个文件夹，这是我之前写了部分的小说。`,
        "external_folder_evidence_scheduler"
      );
      const naturalExternalFolderRun = await waitRun(baseUrl, novel.id, naturalExternalFolderRunId, { timeoutMs: 50000 });
      assert(["completed", "paused"].includes(naturalExternalFolderRun.status), "明确外部文件夹不应被误标记为失败或阻断", naturalExternalFolderRun);
      assert((naturalExternalFolderRun.items || []).some((item) => item.toolType === "listFiles" && item.status === "completed"), "明确外部文件夹必须先列目录，而不是只查旧历史", naturalExternalFolderRun.items);
      assert((naturalExternalFolderRun.items || []).some((item) => item.toolType === "indexLocalFiles" && item.status === "completed"), "明确外部文件夹必须建立轻量索引，帮助后续决定读取哪些文件", naturalExternalFolderRun.items);
      assert(!(naturalExternalFolderRun.items || []).some((item) => item.toolType === "readContextAsset" && item.protocol === "evidence_scheduler"), "明确读取当前文件夹时，自动证据调度不应抢先读取旧压缩历史", naturalExternalFolderRun.items);

      const forkSeedRunId = await startRun(baseUrl, novel.id, "线程分支基准：这是一条普通策划对话，只用于测试回到此处和分支重跑，不检索、不写入。", "fork_seed");
      const forkSeedRun = await waitRun(baseUrl, novel.id, forkSeedRunId);
      assert(forkSeedRun.status === "completed", "fork 基准运行应完成", forkSeedRun);
      const staleAfterRunId = await startRun(baseUrl, novel.id, "旧后续消息：如果之后回到上一条编辑重发，这条消息不能继续留在当前会话上下文。", "edit_stale_after");
      const staleAfterRun = await waitRun(baseUrl, novel.id, staleAfterRunId);
      assert(staleAfterRun.status === "completed", "编辑重发测试需要先制造一条旧后续消息", staleAfterRun);
      const branchMessages = await request(baseUrl, `/api/novels/${novel.id}/planning-messages`, { method: "GET" });
      const forkSource = (branchMessages.messages || []).find((message) => message.role === "user" && message.runId === forkSeedRunId);
      assert(forkSource?.id, "分支测试需要找到一条用户消息", branchMessages);
      const editRunId = await startRunWithPayload(baseUrl, novel.id, {
        message: "编辑后的对话消息：这应该从原消息之前继续，不应保留旧后续。",
        displayMessage: "编辑后的对话消息：这应该从原消息之前继续，不应保留旧后续。",
        replaceFromMessageId: forkSource.id
      }, "edit_resend");
      const editRun = await waitRun(baseUrl, novel.id, editRunId);
      assert(editRun.status === "completed", "回到消息编辑重发运行应完成", editRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const editRunRecord = (novel.planning.runs || []).find((run) => run.id === editRunId);
      assert(editRunRecord?.branchId === (forkSource.branchId || "main"), "编辑重发必须留在当前会话内，而不是重新开一个会话", editRunRecord);
      assert(editRunRecord.replaceFromMessageId === forkSource.id && editRunRecord.forkMode === "edit_from_message", "编辑重发运行必须记录 replaceFromMessageId 和 forkMode", editRunRecord);
      const editPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: editRunRecord.branchId, limit: "120" })}`);
      assert((editPage.messages || []).some((message) => message.role === "user" && message.runId === editRunId && /编辑后的对话消息/.test(message.content || "")), "编辑重发后当前会话必须显示编辑后的用户消息", editPage);
      assert(!(editPage.messages || []).some((message) => message.runId === staleAfterRunId), "编辑重发后当前会话不能保留编辑点之后的旧后续运行", editPage);
      assert(!(editPage.messages || []).some((message) => message.id === forkSource.id || message.inheritedFromMessageId === forkSource.id), "编辑重发后当前会话不能保留被编辑的旧用户消息本身", editPage);
      const editedForkSource = (editPage.messages || []).find((message) => message.role === "user" && message.runId === editRunId);
      assert(editedForkSource?.id, "分支测试需要从编辑后的当前会话消息派生", editPage);
      const forkRunId = await startRunWithPayload(baseUrl, novel.id, {
        message: `${editedForkSource.content}\n\n分支重跑：只说明这是新的线程分支，不写入。`,
        forkFromMessageId: editedForkSource.id
      }, "fork");
      const forkRun = await waitRun(baseUrl, novel.id, forkRunId);
      assert(forkRun.status === "completed", "fork 分支运行应完成", forkRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      const forkRunRecord = (novel.planning.runs || []).find((run) => run.id === forkRunId);
      assert(forkRunRecord?.branchId && forkRunRecord.branchId !== "main", "fork 运行必须进入新 branch", forkRunRecord);
      assert((novel.planning.branches || []).some((branch) => branch.id === forkRunRecord.branchId && branch.forkFromMessageId === editedForkSource.id), "分支列表必须记录 fork 来源", novel.planning.branches);
      const forkPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: forkRunRecord.branchId, limit: 80 })}`);
      assert((forkPage.messages || []).some((message) => message.runId === forkRunId), "按 branchId 查询消息必须能看到新分支运行", forkPage);
      const forkGraph = await request(baseUrl, `/api/novels/${novel.id}/planning-version-graph?${new URLSearchParams({ branchId: forkRunRecord.branchId, limit: "220" })}`);
      assert(forkGraph.graph?.nodes?.some((node) => node.kind === "branch" && node.branchId === forkRunRecord.branchId), "分支版本图必须包含当前分支节点", forkGraph.graph);
      assert(forkGraph.graph?.nodes?.some((node) => node.kind === "agent_run" && node.sourceId === forkRunId), "分支版本图必须包含 fork 后的新运行节点", forkGraph.graph);
      const responseTree = await request(baseUrl, `/api/novels/${novel.id}/planning-response-tree?${new URLSearchParams({ branchId: forkRunRecord.branchId, nodeId: `run:${forkRunId}`, limit: "260" })}`);
      assert(responseTree.tree?.nodes?.some((node) => node.primaryParentId || node.childIds?.length), "response tree 必须包含父子路径字段", responseTree.tree);
      assert((responseTree.tree?.currentPathIds || []).includes(`run:${forkRunId}`), "response tree 按 nodeId 聚焦时当前路径必须包含 fork 运行", responseTree.tree);
      const responseDiff = await request(baseUrl, `/api/novels/${novel.id}/planning-response-tree-diff?${new URLSearchParams({ branchId: forkRunRecord.branchId, fromNodeId: `branch:${forkRunRecord.branchId}`, toNodeId: `run:${forkRunId}`, limit: "260" })}`);
      assert(responseDiff.diff?.unifiedDiff && responseDiff.diff.summary?.lineCount > 0, "response tree diff 必须返回可审计 diff 文本", responseDiff.diff);
      const mergePreview = await request(baseUrl, `/api/novels/${novel.id}/planning-branch-merge-preview?${new URLSearchParams({ sourceBranchId: forkRunRecord.branchId, targetBranchId: "main" })}`);
      assert(mergePreview.preview?.canMerge === true && mergePreview.preview.sourceBranch?.id === forkRunRecord.branchId, "分支合并预览必须识别来源分支新增消息", mergePreview.preview);
      const mergeResult = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/merge`, {
        method: "POST",
        body: JSON.stringify({ sourceBranchId: forkRunRecord.branchId, targetBranchId: "main" })
      });
      assert(mergeResult.branchId && mergeResult.activeBranchId === mergeResult.branchId, "分支合并必须创建新的活跃合并分支", mergeResult);
      const mainBranch = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/switch`, {
        method: "POST",
        body: JSON.stringify({ branchId: "main" })
      });
      assert(mainBranch.activeBranchId === "main", "应能切回主线程分支", mainBranch);

      const sessionCreate = await request(baseUrl, `/api/novels/${novel.id}/planning-branches`, {
        method: "POST",
        body: JSON.stringify({ label: "E2E 独立会话" })
      });
      const sessionId = sessionCreate.branch?.id;
      assert(sessionId && sessionCreate.branchState?.activeBranchId === sessionId, "新建会话后必须自动切换到该会话", sessionCreate);
      const emptySessionPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: sessionId, limit: "20" })}`);
      assert((emptySessionPage.messages || []).length === 0, "新建空会话不应混入其它会话历史", emptySessionPage);
      const sessionRunId = await startRun(baseUrl, novel.id, "独立会话消息：只用于验证当前会话历史隔离，不写入。", "session_isolation");
      const sessionRun = await waitRun(baseUrl, novel.id, sessionRunId);
      assert(sessionRun.status === "completed" && sessionRun.branchId === sessionId, "独立会话运行必须落在当前会话", sessionRun);
      const isolatedSessionPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: sessionId, limit: "40" })}`);
      const isolatedMainPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: "main", limit: "120" })}`);
      assert((isolatedSessionPage.messages || []).some((message) => message.runId === sessionRunId), "当前会话消息页必须包含本会话运行", isolatedSessionPage);
      assert(!(isolatedMainPage.messages || []).some((message) => message.runId === sessionRunId), "主会话消息页不能混入其它会话运行", isolatedMainPage);
      const sessionRename = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ label: "E2E 已重命名会话" })
      });
      assert((sessionRename.branchState?.branches || []).some((branch) => branch.id === sessionId && branch.label === "E2E 已重命名会话"), "会话重命名必须更新会话列表", sessionRename.branchState);
      const sessionFork = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/${encodeURIComponent(sessionId)}/fork`, {
        method: "POST",
        body: JSON.stringify({ label: "E2E 派生会话" })
      });
      const forkedSessionId = sessionFork.branch?.id;
      assert(forkedSessionId && forkedSessionId !== sessionId && sessionFork.branchState?.activeBranchId === forkedSessionId, "派生会话必须创建并切换到新会话", sessionFork);
      const forkedSessionPage = await request(baseUrl, `/api/novels/${novel.id}/planning-messages?${new URLSearchParams({ branchId: forkedSessionId, limit: "80" })}`);
      assert((forkedSessionPage.messages || []).some((message) => message.inheritedFromMessageId || message.runId === sessionRunId), "派生会话应继承派生点之前的消息路径", forkedSessionPage);
      const deleteForkedSession = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/${encodeURIComponent(forkedSessionId)}`, {
        method: "DELETE"
      });
      assert(!(deleteForkedSession.branchState?.branches || []).some((branch) => branch.id === forkedSessionId), "删除会话后默认列表不应继续显示该会话", deleteForkedSession.branchState);
      const deleteSession = await request(baseUrl, `/api/novels/${novel.id}/planning-branches/${encodeURIComponent(sessionId)}`, {
        method: "DELETE"
      });
      assert(!(deleteSession.branchState?.branches || []).some((branch) => branch.id === sessionId), "已删除会话不应污染会话选择列表", deleteSession.branchState);

      const failureRunId = await startRun(baseUrl, novel.id, "测试schema错误 invalid schema，请触发工具参数诊断和修正链。", "failure");
      const failureRun = await waitRun(baseUrl, novel.id, failureRunId);
      assert(["blocked", "failed", "paused"].includes(failureRun.status), "工具参数错误不应被误标记为完成", failureRun);
      assert((failureRun.diagnostics || []).some((item) => String(item.code || "").includes("tool.invalid_arguments") || String(item.code || "").includes("repair")), "失败运行应包含结构化工具错误或修正诊断", failureRun.diagnostics);

      const subAgentRunId = await startRun(baseUrl, novel.id, "测试子Agent会话 spawnSubAgent，请启动只读资料考据子 Agent。", "subagent");
      const subAgentRun = await waitRun(baseUrl, novel.id, subAgentRunId);
      assert(subAgentRun.status === "completed", "子 Agent 运行应完成", subAgentRun);
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert((novel.planning.subAgentSessions || []).some((item) => item.status === "completed"), "子 Agent 应落为 session 记录", novel.planning.subAgentSessions);
      const completedSubAgent = [...(novel.planning.subAgentSessions || [])].reverse().find((item) => item.status === "completed");
      assert(completedSubAgent?.profile === "research" && completedSubAgent.permissionProfile === "read_only_novel_domain" && Array.isArray(completedSubAgent.allowedTools), "子 Agent session 必须记录固定 profile、权限画像和允许工具", completedSubAgent);

      const durableSessionId = `sub_agent_e2e_recover_${Date.now().toString(36)}`;
      await stopTestServer(child);
      child = null;
      const durableStore = JSON.parse(await fs.readFile(storePath, "utf8"));
      const durableNovel = durableStore.novels.find((item) => item.id === novel.id);
      assert(durableNovel, "持久队列测试应能找到小说记录", durableStore.novels);
      durableNovel.planning.subAgentSessions = durableNovel.planning.subAgentSessions || [];
      durableNovel.planning.subAgentSessions.push({
        id: durableSessionId,
        parentRunId: "",
        profile: "lorebook_review",
        profileLabel: "世界书审查 Agent",
        permissionProfile: "read_only_novel_domain",
        allowedTools: ["search", "inspectNovelDiagnostics", "searchContextAssets", "readContextAsset"],
        outputSchema: { summary: "世界书审查结论" },
        name: "E2E 重启恢复子 Agent",
        task: "验证服务重启后 queued 后台子 Agent 会被自动恢复执行。",
        context: "这是 E2E 构造的持久队列任务。",
        mode: "background",
        status: "queued",
        plannerSetting: mockPlannerSetting,
        queue: {
          backgroundEligible: true,
          attempts: 0,
          maxAttempts: 2,
          leaseOwner: "",
          leaseUntil: "",
          lastHeartbeatAt: "",
          retryAfter: ""
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await fs.writeFile(storePath, `${JSON.stringify(durableStore, null, 2)}\n`, "utf8");
      child = startTestServer(port, dataDir, novelsDir, logs);
      await waitForServer(baseUrl, child);
      let recoveredSession = null;
      const recoverStartedAt = Date.now();
      while (Date.now() - recoverStartedAt < 20000) {
        state = (await request(baseUrl, "/api/state")).state;
        novel = latestNovel(state);
        recoveredSession = (novel.planning.subAgentSessions || []).find((item) => item.id === durableSessionId);
        if (recoveredSession?.status === "completed") break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      assert(recoveredSession?.status === "completed", "重启后 queued 后台子 Agent 应自动恢复并完成", recoveredSession);
      assert((recoveredSession.queue?.attempts || 0) >= 1, "恢复任务应记录持久队列 attempts", recoveredSession);
      assert(recoveredSession.profile === "lorebook_review" && recoveredSession.permissionProfile === "read_only_novel_domain", "恢复后的后台子 Agent 应保留固定 profile 和权限画像", recoveredSession);

      const cancelRunId = await startRun(baseUrl, novel.id, "测试工作区工具 writeFile，请等待确认以便测试取消。", "cancel");
      await request(baseUrl, `/api/novels/${novel.id}/planning-chat-cancel`, {
        method: "POST",
        body: JSON.stringify({ runId: cancelRunId })
      });
      const cancelRun = await waitRun(baseUrl, novel.id, cancelRunId);
      assert(cancelRun.status === "cancelled", "取消运行应进入 cancelled 状态", cancelRun);

      const longText = "这是一段用于压缩测试的长策划资料。".repeat(180);
      let compacted = false;
      for (let index = 0; index < 7; index += 1) {
        const runId = await startRun(baseUrl, novel.id, `${longText}\n第 ${index + 1} 轮：普通对话，不要写入。`, `compact_${index}`);
        const run = await waitRun(baseUrl, novel.id, runId, { timeoutMs: 60000 });
        assert(run.status === "completed", `压缩准备运行 ${index + 1} 应完成`, run);
        const currentState = (await request(baseUrl, "/api/state")).state;
        const currentNovel = latestNovel(currentState);
        compacted = Boolean(currentNovel.planning.contextCompaction);
        if (compacted) break;
      }
      state = (await request(baseUrl, "/api/state")).state;
      novel = latestNovel(state);
      assert(novel.planning.contextCompaction, "长线程应触发上下文压缩", novel.planning.contextCompaction);

      const continueRunId = await startRun(baseUrl, novel.id, "压缩后继续任务：请先读取旧证据再简短收束，不要写入。", "continue_after_compaction");
      const continueRun = await waitRun(baseUrl, novel.id, continueRunId);
      assert(continueRun.status === "completed", "压缩后续跑应完成", continueRun);
      assert((continueRun.evidencePlan?.layers || []).some((layer) => layer.name === "context_assets" || layer.name === "project_rag"), "压缩后续跑应有自动证据调度层", continueRun.evidencePlan);
    }

    console.log(describeSuiteResult(suite));
  } catch (error) {
    console.error("Agent E2E 失败：", error.message);
    if (error.request) console.error("request:", JSON.stringify(error.request, null, 2));
    if (error.cause) console.error("cause:", error.cause.message || String(error.cause));
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    if (logs.length) console.error(logs.join(""));
    process.exitCode = 1;
  } finally {
    await stopTestServer(child);
    if (streamingProvider) await streamingProvider.close().catch(() => {});
    if (delayedProvider) await delayedProvider.close().catch(() => {});
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    await cleanupE2EResources();
    if (!process.exitCode) {
      process.exit(0);
    }
  }
}

main();
