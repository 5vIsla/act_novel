const fs = require("fs");
const path = require("path");

// 将英文来源的扩展世界书做“绝区零中文本地化”。
// 输入是此前从 Chub / LoreBary 英文世界书重写出的 214 条扩展版；
// 输出保持 214 条粒度，但要求条目名、正文和触发关键词优先使用绝区零简中官方/通行中文名。
// 这里调用非 Pro 模型做语义本地化，不用本地规则替换来硬改专名。

const ROOT = path.join(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data", "store.json");
const SOURCE_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-融合中文重写世界书-扩展版.json");
const RAW_V24_FILE = path.join(ROOT, "resources", "source", "绝区零设定集[v2.4].json");
const OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-扩展世界书-中文本地化版.json");
const CACHE_FILE = path.join(ROOT, "resources", "lorebooks", ".绝区零-扩展世界书-中文本地化缓存.json");

const DEFAULT_PROVIDER_NAME = "CaMeL";
const DEFAULT_MODEL = "deepseek-v4-flash";
const BATCH_SIZE = Number(process.env.ZZZ_LOCALIZE_BATCH_SIZE || 5);
const CONCURRENCY = Number(process.env.ZZZ_LOCALIZE_CONCURRENCY || 2);
const REQUEST_TIMEOUT_MS = Number(process.env.ZZZ_LOCALIZE_TIMEOUT_MS || 180000);

const ALLOWED_STYLIZED_TERMS = [
  "AI",
  "HIA",
  "H.A.N.D.",
  "HDD",
  "H.D.D.",
  "TOPS",
  "COFF CAFE",
  "Random Play",
  "Fairy",
  "THE NEWS",
  "VR",
  "141"
];

const OFFICIAL_GLOSSARY = [
  ["Zenless Zone Zero", "绝区零"],
  ["New Eridu", "新艾利都"],
  ["Hollow", "空洞"],
  ["Hollows", "空洞"],
  ["Hollow Zero", "零号空洞"],
  ["Ethereal", "以骸"],
  ["Ethereals", "以骸"],
  ["Ether", "以太"],
  ["Denny", "丁尼"],
  ["Dennies", "丁尼"],
  ["Bangboo", "邦布"],
  ["W-Engine", "音擎"],
  ["W Engines", "音擎"],
  ["Proxy", "绳匠"],
  ["Agent", "代理人"],
  ["Inter-Knot", "绳网"],
  ["Hollow Raider", "盗洞客"],
  ["Carrot", "萝卜"],
  ["Thiren", "希人"],
  ["Cunning Hares", "狡兔屋"],
  ["Gentle House", "狡兔屋"],
  ["Belobog Heavy Industries", "白祇重工"],
  ["Victoria Housekeeping", "维多利亚家政"],
  ["Sons of Calydon", "卡吕冬之子"],
  ["OBOL Squad", "奥波勒斯小队"],
  ["Section 6", "对空六课"],
  ["H.S.O.S.6", "对空六课"],
  ["New Eridu Public Security", "新艾利都治安局"],
  ["NEPS", "新艾利都治安局"],
  ["Criminal Investigation Special Response Team", "刑侦特勤组"],
  ["Hollow Investigative Association", "空洞调查协会"],
  ["Lumina Square", "光映广场"],
  ["Sixth Street", "六分街"],
  ["Scott Outpost", "斯科特哨站"],
  ["God Finger", "金手指电玩店"],
  ["Godfinger", "金手指电玩店"],
  ["Howl", "嗷呜"],
  ["Tin Master", "汀曼大师"],
  ["Waterfall Soup", "瀑汤谷"],
  ["Bardic Needle", "吟游唱针"],
  ["Turbo", "涡轮改装店"],
  ["Mewmew", "喵吉长官"],
  ["Officer Mewmew", "喵吉长官"],
  ["Phaethon", "法厄同"],
  ["Wise", "哲"],
  ["Belle", "铃"],
  ["Soldier 11", "11号"],
  ["Nekomata", "猫又"],
  ["Rina", "丽娜"],
  ["Corin", "可琳"],
  ["Ellen Joe", "艾莲"],
  ["Ye Shunguang", "叶瞬光"],
  ["Ye Shiyuan", "叶释渊"],
  ["Dialyn", "琉音"],
  ["Banyue", "般岳"],
  ["Zhao", "照"],
  ["Orphie", "奥菲丝"],
  ["Magus", "鬼火"],
  ["Yixuan", "仪玄"],
  ["Ju Fufu", "橘福福"],
  ["Pan Yinhu", "潘引壶"],
  ["Hugo", "雨果"],
  ["Vivian", "薇薇安"],
  ["Lucia", "卢西娅"],
  ["Yidhari", "伊德海莉"],
  ["Seed", "席德"],
  ["Alice", "爱丽丝"],
  ["Komano Manato", "狛野真斗"],
  ["Yuzuha", "浮波柚叶"],
  ["Proxies", "绳匠"],
  ["Creator", "造物主"],
  ["Collapse", "大崩塌"],
  ["Exaltists", "称颂会"]
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function joinUrl(baseUrl, endpointPath) {
  return String(baseUrl || "").replace(/\/+$/, "") + endpointPath;
}

function pickProvider(store) {
  const providers = Array.isArray(store.providers) ? store.providers : [];
  const explicitId = process.env.ZZZ_LOCALIZE_PROVIDER_ID || "";
  const explicitModel = process.env.ZZZ_LOCALIZE_MODEL || "";
  const provider = (explicitId && providers.find((item) => item.id === explicitId))
    || providers.find((item) => item.name === DEFAULT_PROVIDER_NAME)
    || providers.find((item) => item.apiKey && item.baseUrl !== "mock://local");
  if (!provider) throw new Error("没有找到可用 AI 提供商。");
  const model = explicitModel || (provider.models || []).find((item) => item === DEFAULT_MODEL)
    || (provider.models || []).find((item) => !/pro|embedding|rerank/i.test(item))
    || "";
  if (!model) throw new Error(`提供商 ${provider.name || provider.id} 没有可用非 Pro 文本模型。`);
  if (/pro/i.test(model)) throw new Error(`当前模型 ${model} 包含 Pro，不符合用户要求。`);
  return { provider, model };
}

function safeRemoteText(text) {
  return String(text || "").replace(/sk-[A-Za-z0-9_-]+/g, "sk-***").slice(0, 500);
}

async function callAi({ provider, model, systemPrompt, userPrompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(joinUrl(provider.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      }),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`AI 调用失败：${response.status} ${safeRemoteText(text)}`);
    const payload = JSON.parse(text);
    const output = payload?.choices?.[0]?.message?.content || "";
    if (!output.trim()) throw new Error("AI 响应中没有文本。");
    return output.trim();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`AI 调用超时：${REQUEST_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonArray(text) {
  const value = String(text || "")
    .trim()
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

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function collectRawV24Glossary() {
  if (!fs.existsSync(RAW_V24_FILE)) return [];
  const raw = readJson(RAW_V24_FILE);
  return Object.values(raw.entries || {})
    .map((entry) => String(entry.comment || "").trim())
    .filter((name) => name && !/[↑↓]/.test(name))
    .map((name) => name.replace(/^[-【\s]+|[-】\s]+$/g, ""))
    .filter(Boolean);
}

function sourceAliases(entry) {
  const values = [entry.name, entry.comment, ...(entry.keys || []), ...(entry.key || [])];
  return uniqueStrings(values.filter((value) => /[A-Za-z]/.test(String(value || ""))));
}

function sourceForPrompt(entry, index) {
  return {
    index,
    name: entry.name || entry.comment,
    keys: uniqueStrings([...(entry.keys || []), ...(entry.key || [])]).slice(0, 16),
    content: String(entry.content || "").slice(0, 900),
    sourceAliases: sourceAliases(entry)
  };
}

function buildSystemPrompt(rawNames) {
  const glossaryLines = [
    ...OFFICIAL_GLOSSARY.map(([from, to]) => `${from} => ${to}`),
    ...rawNames.map((name) => `${name} => ${name}`)
  ];
  return [
    "你是《绝区零》简中世界书本地化编辑。",
    "任务：把英文来源或半英文的世界书条目本地化成符合《绝区零》简中专有名词体系的中文条目。",
    "必须严格输出 JSON 数组，不要 Markdown，不要解释。",
    "",
    "硬性规则：",
    "1. 条目数量、index 必须与输入完全一致，不许删条目、不许合并条目、不许新增条目。",
    "2. name 必须使用中文或游戏内简中实际保留的风格化名称；禁止出现“暂译”“待校”。",
    "3. content 必须是中文世界书正文，禁止出现“暂译”“待校”“具体中文名待校准”等尾巴；输入里若有这些词，改成“需项目确认”或直接写正式中文名。",
    "4. keys 以中文触发词为主，保留 4 到 10 个；只有游戏内简中也保留英文/缩写的名词才能进入 keys。",
    "5. 英文原名、旧英文触发词不要塞进正文；如有价值，放入 sourceAliases。",
    "6. 不要编造新设定；只做专名本地化、中文表达整理和轻微润色。原文里的“待校素材”应改写为“需项目确认的素材”。",
    "7. 角色条目保留身份、关系、性格反应和行动边界；地点条目保留功能、氛围和剧情用途；设定条目保留规则和限制。",
    "8. 如果某个英文店名在简中游戏里就是英文招牌，可以保留该英文招牌，但必须同时给中文功能词，例如“COFF CAFE”“咖啡店”。",
    "",
    "输出数组每项格式：",
    "{\"index\":0,\"name\":\"中文条目名\",\"keys\":[\"中文触发词\"],\"content\":\"中文正文\",\"sourceAliases\":[\"英文旧名\"],\"uncertainNotes\":[]}",
    "",
    "专名词表，优先级高于输入旧名：",
    glossaryLines.slice(0, 220).join("\n")
  ].join("\n");
}

function validateBatch(items, batch) {
  const expected = new Set(batch.map((item) => item.index));
  for (const item of items) {
    if (!expected.has(item.index)) throw new Error(`未知 index：${item.index}`);
    if (!item.name || !item.content) throw new Error(`index ${item.index} 缺 name 或 content`);
    if (/暂译|待校/.test([item.name, item.content, ...(item.keys || [])].join("\n"))) {
      throw new Error(`index ${item.index} 仍含暂译/待校`);
    }
  }
  for (const source of batch) {
    if (!items.some((item) => item.index === source.index)) throw new Error(`缺少 index：${source.index}`);
  }
}

async function localizeBatch({ provider, model, batch, systemPrompt, batchNumber }) {
  const prompt = [
    `请本地化下面 ${batch.length} 个条目。`,
    "输入 JSON：",
    JSON.stringify(batch, null, 2)
  ].join("\n");
  let lastOutput = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      lastOutput = await callAi({ provider, model, systemPrompt, userPrompt: prompt });
      const parsed = parseJsonArray(lastOutput);
      validateBatch(parsed, batch);
      return parsed;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`第 ${batchNumber} 批本地化失败：${error.message}\n输出片段：${lastOutput.slice(0, 800)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }
  throw new Error(`第 ${batchNumber} 批本地化失败`);
}

function normalizeLocalizedEntry(entry, localized, index) {
  const aliases = uniqueStrings([...(localized.sourceAliases || []), ...sourceAliases(entry)]);
  const keys = uniqueStrings(localized.keys || []).slice(0, 12);
  return {
    ...entry,
    name: String(localized.name || entry.name || entry.comment).trim(),
    comment: String(localized.name || entry.comment || entry.name).trim(),
    keys,
    key: keys,
    secondaryKeys: [],
    secondary_keys: [],
    keysecondary: [],
    content: String(localized.content || entry.content || "").trim(),
    priority: Number(entry.priority ?? entry.insertion_order ?? index),
    insertion_order: Number(entry.insertion_order ?? entry.priority ?? index),
    extensions: {
      ...(entry.extensions || {}),
      localization: {
        source: "camel_deepseek_v4_flash",
        sourceAliases: aliases,
        uncertainNotes: Array.isArray(localized.uncertainNotes) ? localized.uncertainNotes : [],
        policy: "绝区零简中专名本地化；保留条目粒度；不规则补写；不删除英文来源条目。"
      }
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
  return batch.map((item) => `${item.index}:${item.name}`).join("|");
}

async function main() {
  const store = readJson(STORE_PATH);
  const { provider, model } = pickProvider(store);
  const source = readJson(SOURCE_FILE);
  const entries = source.data.entries;
  const rawNames = collectRawV24Glossary();
  const systemPrompt = buildSystemPrompt(rawNames);
  const promptItems = entries.map(sourceForPrompt);
  const batches = [];
  for (let index = 0; index < promptItems.length; index += BATCH_SIZE) {
    batches.push(promptItems.slice(index, index + BATCH_SIZE));
  }
  const cache = readCache();
  const localizedMap = new Map();
  let nextBatch = 0;
  let done = 0;

  console.log(JSON.stringify({
    step: "start",
    entries: entries.length,
    batches: batches.length,
    provider: provider.name || provider.id,
    model,
    concurrency: CONCURRENCY
  }, null, 2));

  async function processBatch(batchIndex) {
    const batch = batches[batchIndex];
    const key = cacheKey(batch);
    let localized = cache[key];
    if (localized) {
      try {
        validateBatch(localized, batch);
      } catch (_error) {
        localized = null;
        delete cache[key];
      }
    }
    if (!localized) {
      localized = await localizeBatch({ provider, model, batch, systemPrompt, batchNumber: batchIndex + 1 });
      cache[key] = localized;
      writeJson(CACHE_FILE, cache);
    }
    for (const item of localized) localizedMap.set(item.index, item);
    done += 1;
    console.log(JSON.stringify({ step: "batch_done", batch: batchIndex + 1, totalBatches: batches.length, done, localized: localizedMap.size }));
  }

  async function worker() {
    while (nextBatch < batches.length) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      await processBatch(batchIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONCURRENCY, batches.length)) }, () => worker()));
  const localizedEntries = entries.map((entry, index) => {
    const localized = localizedMap.get(index);
    if (!localized) throw new Error(`缺少本地化条目：${index}`);
    return normalizeLocalizedEntry(entry, localized, index);
  });

  const output = {
    ...source,
    data: {
      ...source.data,
      name: "绝区零-扩展世界书-中文本地化版",
      description: "基于英文 Chub / LoreBary 来源扩展世界书的简中专名本地化版本；保留 214 条粒度，条目名、正文和触发词尽量改为《绝区零》简中官方/通行名称。",
      extensions: {
        ...(source.data.extensions || {}),
        localization: {
          generatedAt: new Date().toISOString(),
          provider: provider.name || provider.id,
          model,
          entryCount: localizedEntries.length,
          policy: "不删英文来源条目；不规则补写；用 AI 依据 v2.4 原始中文世界书和专名词表本地化。"
        }
      },
      entries: localizedEntries
    }
  };
  writeJson(OUTPUT_FILE, output);
  if (fs.existsSync(CACHE_FILE) && process.env.ZZZ_LOCALIZE_KEEP_CACHE !== "1") {
    fs.unlinkSync(CACHE_FILE);
  }
  console.log(JSON.stringify({ ok: true, outputFile: OUTPUT_FILE, entries: localizedEntries.length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
