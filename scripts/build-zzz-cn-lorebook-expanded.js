const fs = require("fs");
const path = require("path");

// 生成“绝区零融合中文重写世界书-扩展版”。
// 扩展版和压缩版的区别：
// - 压缩版把多个同类条目合并成 66 条，适合省 token。
// - 扩展版保留英文 Chub/LoreBary 世界书的 211 条粒度，并逐条改写成中文世界书条目。
// - 生成过程会调用项目已配置的 OpenAI 兼容提供商；默认优先使用“硅基流动 / Kimi-K2.6”。
//
// 注意：脚本不会保存外部世界书原文，只保存中文重写后的结果。

const ROOT = path.join(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data", "store.json");
const OUTPUT_DIR = path.join(ROOT, "resources", "lorebooks");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "绝区零-融合中文重写世界书-扩展版.json");
const CACHE_FILE = path.join(OUTPUT_DIR, ".绝区零-扩展版-重写缓存.json");

const CHUB_URL = "https://api.chub.ai/api/lorebooks/Gedachtnis/zenless-zone-zero-relevant-to-2-7-6987c483a083?full=true";
const DEFAULT_PROVIDER_NAME = "硅基流动";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Flash";
const BATCH_SIZE = Number(process.env.ZZZ_LORE_BATCH_SIZE || 4);
const MAX_SOURCE_CHARS = Number(process.env.ZZZ_LORE_SOURCE_CHARS || 1200);
const REQUEST_TIMEOUT_MS = Number(process.env.ZZZ_LORE_REQUEST_TIMEOUT_MS || 150000);
const CONCURRENCY = Number(process.env.ZZZ_LORE_CONCURRENCY || 4);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// 多个并发批次会共享缓存写入；Node 单线程下用 Promise 队列即可避免交错写文件。
let cacheWriteChain = Promise.resolve();

function queueCacheWrite(file, data) {
  cacheWriteChain = cacheWriteChain.then(() => fs.promises.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8"));
  return cacheWriteChain;
}

function joinUrl(baseUrl, endpointPath) {
  return String(baseUrl || "").replace(/\/+$/, "") + endpointPath;
}

function clampTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.2;
  return Math.max(0, Math.min(2, number));
}

function pickProvider(store) {
  const explicitId = process.env.ZZZ_LORE_PROVIDER_ID || "";
  const explicitModel = process.env.ZZZ_LORE_MODEL || "";
  const providers = Array.isArray(store.providers) ? store.providers : [];
  const byId = explicitId ? providers.find((provider) => provider.id === explicitId) : null;
  const byName = providers.find((provider) => provider.name === DEFAULT_PROVIDER_NAME);
  const provider = byId || byName || providers.find((item) => item.apiKey && item.baseUrl !== "mock://local");
  if (!provider) {
    throw new Error("没有找到可用 AI 提供商；请先在前端提供商页配置 key。");
  }
  const model = explicitModel
    || (provider.name === DEFAULT_PROVIDER_NAME && (provider.models || []).includes(DEFAULT_MODEL) ? DEFAULT_MODEL : "")
    || (provider.models || []).find((item) => !/embedding|rerank/i.test(item))
    || "";
  if (!model) {
    throw new Error(`提供商 ${provider.name || provider.id} 没有可用文本模型。`);
  }
  return { provider, model };
}

async function requestAi({ provider, model, systemPrompt, userPrompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const endpointKind = provider.endpointKind === "responses" ? "responses" : "chat_completions";
  const endpointPath = endpointKind === "responses" ? "/responses" : "/chat/completions";
  const endpoint = joinUrl(provider.baseUrl, endpointPath);
  const body = endpointKind === "responses"
    ? {
        model,
        temperature: clampTemperature(0.2),
        instructions: systemPrompt,
        input: userPrompt
      }
    : {
        model,
        temperature: clampTemperature(0.2),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      };

  let response;
  let text;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`AI 调用超时：${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`AI 调用失败：${response.status} ${safeRemoteText(text)}`);
  }
  const payload = JSON.parse(text);
  const output = endpointKind === "responses"
    ? extractResponsesText(payload)
    : payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "";
  if (!output.trim()) {
    throw new Error("AI 响应中没有文本。");
  }
  return output.trim();
}

function extractResponsesText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.content === "string") chunks.push(content.content);
    }
  }
  return chunks.join("\n");
}

function safeRemoteText(text) {
  return String(text || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .slice(0, 500);
}

async function fetchSourceBook() {
  const response = await fetch(CHUB_URL, { headers: { accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Chub 世界书读取失败：${response.status} ${text.slice(0, 300)}`);
  }
  const payload = JSON.parse(text);
  const book = payload?.node?.definition?.embedded_lorebook;
  if (!book || !Array.isArray(book.entries)) {
    throw new Error("Chub 响应中没有识别到 embedded_lorebook.entries。");
  }
  return {
    node: payload.node,
    book
  };
}

function normalizeSourceEntry(source, index) {
  const keys = uniqueStrings([...(source.keys || []), source.name, source.comment].filter(Boolean));
  return {
    index,
    sourceId: String(source.id ?? source.uid ?? index + 1),
    name: String(source.name || source.comment || `Entry ${index + 1}`).trim(),
    keys,
    secondaryKeys: uniqueStrings(source.secondary_keys || source.keysecondary || []),
    constant: Boolean(source.constant),
    position: source.position,
    priority: Number(source.priority ?? source.insertion_order ?? index + 10),
    content: String(source.content || "").trim()
  };
}

function sourceForPrompt(entry) {
  return {
    index: entry.index,
    sourceId: entry.sourceId,
    name: entry.name,
    keys: entry.keys,
    secondaryKeys: entry.secondaryKeys,
    constant: entry.constant,
    content: truncateSource(entry.content, MAX_SOURCE_CHARS)
  };
}

function truncateSource(text, maxChars) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxChars) return value;
  const head = value.slice(0, Math.floor(maxChars * 0.72));
  const tail = value.slice(value.length - Math.floor(maxChars * 0.22));
  return `${head}\n...[中间略去，重写时只抓稳定设定，不要照抄]...\n${tail}`;
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function buildSystemPrompt() {
  return [
    "你是《绝区零》同人写作工作台的世界书编辑。",
    "任务：把英文 SillyTavern/Chub 世界书条目改写成中文 World Info / Lorebook 条目。",
    "必须严格输出 JSON 数组，不要 Markdown，不要解释。",
    "",
    "输出数组每项必须包含：",
    "{",
    "  \"index\": 数字，必须等于输入 index,",
    "  \"cnName\": \"中文条目名；中文官方名不确定时保留英文或写 暂译\",",
    "  \"keys\": [\"触发关键词\"],",
    "  \"secondaryKeys\": [],",
    "  \"content\": \"中文重写后的世界书正文\",",
    "  \"uncertain\": false",
    "}",
    "",
    "重写规则：",
    "1. 不要逐句翻译，不要复制源文本；把内容压成中文小说/角色扮演可用的触发设定。",
    "2. content 长度控制在 120 到 280 个中文字符；非常重要的角色或组织最多 360 字。",
    "3. 角色条目写身份、性格反应、关系锚点、行动边界；不要写游戏数值、抽卡、稀有度、机制。",
    "4. 地点条目写空间功能、氛围、常见人物/风险、能触发的剧情用途。",
    "5. 概念条目写世界观规则、风险、叙事限制；不要百科腔。",
    "6. 若来源明显是后续版本、二创扩写、中文名不确定或疑似非官方，content 末尾用一句短句标注“具体中文名/细节待项目校准”。",
    "7. keys 需要 4 到 10 个，保留英文原名和关键英文词，同时补中文名、常见简称。",
    "8. 不要让任何角色知道其不该知道的秘密；世界书只提供作者/导演/角色可按权限调用的素材。",
    "9. 不要输出源英文长句。"
  ].join("\n");
}

async function rewriteBatch({ provider, model, batch, batchNumber }) {
  const prompt = [
    `请重写下面 ${batch.length} 个世界书条目。`,
    "输入 JSON：",
    JSON.stringify(batch.map(sourceForPrompt), null, 2)
  ].join("\n");
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let output = "";
    try {
      output = await requestAi({
        provider,
        model,
        systemPrompt: buildSystemPrompt(),
        userPrompt: prompt
      });
      const parsed = parseJsonArray(output);
      validateBatch(parsed, batch);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(1500 * attempt);
        continue;
      }
      throw new Error(`第 ${batchNumber} 批重写失败：${error.message}\nAI 输出片段：${output.slice(0, 800)}`);
    }
  }
  throw lastError || new Error(`第 ${batchNumber} 批重写失败`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonArray(text) {
  const value = String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("不是数组");
    return parsed;
  } catch (_error) {
    const start = value.indexOf("[");
    const end = value.lastIndexOf("]");
    if (start < 0 || end <= start) throw _error;
    const parsed = JSON.parse(value.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("不是数组");
    return parsed;
  }
}

function validateBatch(items, batch) {
  const expected = new Set(batch.map((item) => item.index));
  for (const item of items) {
    if (!expected.has(item.index)) throw new Error(`出现未知 index：${item.index}`);
    if (!item.cnName || !item.content) throw new Error(`index ${item.index} 缺少 cnName 或 content`);
  }
  for (const source of batch) {
    if (!items.some((item) => item.index === source.index)) {
      throw new Error(`缺少 index：${source.index}`);
    }
  }
}

function normalizeRewrite(source, rewrite) {
  const cnName = String(rewrite.cnName || source.name).trim();
  const keys = uniqueStrings([
    cnName,
    source.name,
    ...(rewrite.keys || []),
    ...source.keys
  ]).slice(0, 14);
  return {
    sourceIndex: source.index,
    sourceId: source.sourceId,
    cnName,
    keys,
    secondaryKeys: uniqueStrings(rewrite.secondaryKeys || source.secondaryKeys || []),
    content: String(rewrite.content || "").trim(),
    uncertain: Boolean(rewrite.uncertain)
  };
}

function globalEntry(id, data) {
  return {
    id,
    uid: id,
    key: data.keys,
    keys: data.keys,
    keysecondary: [],
    secondary_keys: [],
    comment: data.name,
    name: data.name,
    content: data.content.trim(),
    enabled: true,
    constant: true,
    selective: false,
    selectiveLogic: 0,
    position: "before_character",
    insertion_order: id,
    priority: id,
    probability: 100,
    use_regex: false,
    case_sensitive: false,
    token_budget: data.tokenBudget || 700,
    extensions: {
      depth: 6,
      weight: 10,
      addMemo: true,
      displayIndex: id,
      useProbability: true,
      excludeRecursion: true,
      roleplay_writer: {
        source: "zzz_cn_fusion_expanded",
        kind: "global_rule"
      }
    }
  };
}

function loreEntry(id, source, rewrite) {
  const position = normalizePosition(source.position);
  return {
    id,
    uid: id,
    key: rewrite.keys,
    keys: rewrite.keys,
    keysecondary: rewrite.secondaryKeys,
    secondary_keys: rewrite.secondaryKeys,
    comment: rewrite.cnName,
    name: rewrite.cnName,
    content: rewrite.content,
    enabled: true,
    constant: false,
    selective: true,
    selectiveLogic: 0,
    position,
    insertion_order: id,
    priority: Math.max(10, Number(source.priority || id)),
    probability: 100,
    use_regex: false,
    case_sensitive: false,
    token_budget: 620,
    extensions: {
      depth: 6,
      weight: 10,
      addMemo: true,
      displayIndex: id,
      useProbability: true,
      excludeRecursion: true,
      roleplay_writer: {
        source: "zzz_cn_fusion_expanded",
        sourceId: source.sourceId,
        sourceName: source.name,
        uncertain: rewrite.uncertain,
        rewritePolicy: "中文重写、摘要化、保留条目粒度，不复制外部世界书原文。"
      }
    }
  };
}

function normalizePosition(position) {
  const mapped = {
    0: "before_character",
    1: "after_character",
    2: "before_memory",
    3: "after_memory"
  };
  if (Object.prototype.hasOwnProperty.call(mapped, String(position))) return mapped[String(position)];
  return "after_character";
}

function buildLorebook({ sourceNode, sourceEntries, rewrites }) {
  const rules = [
    globalEntry(1, {
      name: "扩展版世界书使用规则",
      keys: ["绝区零扩展世界书", "世界书使用规则", "ZZZ Lorebook Expanded"],
      content: "这是《绝区零》同人写作用的扩展中文重写世界书。它保留原英文世界书的细条目粒度，但不是百科正文，也不是官方资料替代品。角色扮演时按关键词触发，导演AI负责筛选、压缩和校准，不应把大量条目一次性塞进上下文。"
    }),
    globalEntry(2, {
      name: "正典与同人边界",
      keys: ["正典边界", "同人边界", "设定校准", "Canon Guard"],
      content: "本世界书混合公开中文世界书线索与英文2.7世界书覆盖范围，并经中文重写。凡中文名、版本细节、后续剧情或疑似扩写内容未被项目确认时，只能作为待校素材。用户提供的官方文本、项目稳定档案和已确认设定优先级高于本世界书。"
    }),
    globalEntry(3, {
      name: "信息权限与剧透控制",
      keys: ["信息权限", "剧透控制", "角色知情", "保密"],
      content: "世界书触发不等于当前角色知道全部内容。导演AI、角色AI和改写AI必须区分作者知道、公众知道、机构知道、当前角色知道。涉及法厄同身份、旧都真相、企业实验、组织阴谋和个人秘密时，只能按角色经历和可见证据表达。"
    })
  ];
  const loreEntries = sourceEntries.map((source, index) => {
    const rewrite = rewrites.find((item) => item.sourceIndex === source.index);
    if (!rewrite) {
      throw new Error(`缺少重写条目：${source.name}`);
    }
    return loreEntry(index + rules.length + 1, source, rewrite);
  });
  const entries = [...rules, ...loreEntries];
  return {
    spec: "lorebook_v1",
    spec_version: "1.0",
    data: {
      name: "绝区零-融合中文重写世界书-扩展版",
      description: "保留英文 Chub/LoreBary 2.7 世界书条目粒度，并结合中文酒馆世界书公开线索重写的中文扩展版；用于扮演法小说工作台的世界书触发、导演统筹和正文改写。",
      scan_depth: 8,
      token_budget: 2600,
      recursive_scanning: false,
      extensions: {
        world_info_depth: 8,
        world_info_budget: 2600,
        world_info_case_sensitive: false,
        world_info_overflow_alert: true,
        world_info_max_activations: 14,
        world_info_min_activations: 0,
        world_info_match_whole_words: false,
        world_info_recursive_scanning: false,
        roleplay_writer: {
          generatedAt: new Date().toISOString(),
          sourceCount: sourceEntries.length,
          entryCount: entries.length,
          aiProvider: process.env.ZZZ_LORE_PROVIDER_ID ? "custom" : DEFAULT_PROVIDER_NAME,
          aiModel: process.env.ZZZ_LORE_MODEL || DEFAULT_MODEL,
          sources: {
            chinese: {
              name: "绝区零设定集[v2.4].json",
              url: "https://t.me/s/qiqinsfw?before=106",
              note: "公开页面显示为中文酒馆世界书，文件约261.9KB，说明称已更新至绝区零2.0；本机无法直连下载附件，所以只使用公开说明与版本信息。"
            },
            english: {
              name: sourceNode?.name || "Zenless Zone Zero (Relevant to 2.7)",
              url: "https://chub.ai/lorebooks/Gedachtnis/zenless-zone-zero-relevant-to-2-7-6987c483a083",
              api: CHUB_URL,
              origin: "https://lorebary.com/lorebook-library?view=9ABE9D60",
              note: "用于条目粒度和源设定参考；输出为中文改写摘要，不保存原文副本。"
            }
          }
        }
      },
      entries
    }
  };
}

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return readJson(CACHE_FILE);
  } catch (_error) {
    return {};
  }
}

function cacheKey(batch) {
  return batch.map((item) => `${item.index}:${item.sourceId}:${item.name}`).join("|");
}

async function main() {
  const store = readJson(STORE_PATH);
  const { provider, model } = pickProvider(store);
  const { node, book } = await fetchSourceBook();
  const sourceEntries = book.entries.map(normalizeSourceEntry);
  const cache = readCache();
  const rewriteMap = new Map();
  const batches = [];
  for (let index = 0; index < sourceEntries.length; index += BATCH_SIZE) {
    batches.push(sourceEntries.slice(index, index + BATCH_SIZE));
  }

  console.log(JSON.stringify({
    step: "start",
    sourceEntries: sourceEntries.length,
    batches: batches.length,
    provider: provider.name || provider.id,
    model,
    concurrency: CONCURRENCY
  }, null, 2));

  let nextBatchIndex = 0;
  let completedBatches = 0;
  async function processBatch(batchIndex) {
    const batch = batches[batchIndex];
    const key = cacheKey(batch);
    let parsed = cache[key];
    if (parsed) {
      try {
        validateBatch(parsed, batch);
      } catch (_error) {
        delete cache[key];
        parsed = null;
      }
    }
    if (!parsed) {
      parsed = await rewriteBatch({ provider, model, batch, batchNumber: batchIndex + 1 });
      cache[key] = parsed;
      await queueCacheWrite(CACHE_FILE, cache);
    }
    for (const source of batch) {
      const rewrite = parsed.find((item) => item.index === source.index);
      rewriteMap.set(source.index, normalizeRewrite(source, rewrite));
    }
    completedBatches += 1;
    console.log(JSON.stringify({
      step: "batch_done",
      batch: batchIndex + 1,
      totalBatches: batches.length,
      completedBatches,
      rewritten: rewriteMap.size,
      cached: Boolean(cache[key])
    }));
  }

  async function worker() {
    while (nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      await processBatch(batchIndex);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(CONCURRENCY, batches.length)) }, () => worker());
  await Promise.all(workers);
  await cacheWriteChain;

  const rewrites = sourceEntries.map((entry) => rewriteMap.get(entry.index));
  if (rewrites.some((item) => !item)) {
    throw new Error("存在未完成的重写条目。");
  }
  const lorebook = buildLorebook({ sourceNode: node, sourceEntries, rewrites });
  writeJson(OUTPUT_FILE, lorebook);
  if (fs.existsSync(CACHE_FILE) && process.env.ZZZ_LORE_KEEP_CACHE !== "1") {
    fs.unlinkSync(CACHE_FILE);
  }
  console.log(JSON.stringify({
    ok: true,
    outputFile: OUTPUT_FILE,
    sourceEntries: sourceEntries.length,
    finalEntries: lorebook.data.entries.length,
    recursiveScanning: lorebook.data.recursive_scanning
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
