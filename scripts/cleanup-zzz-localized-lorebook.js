const fs = require("fs");
const path = require("path");

// 对“中文本地化版”做二次 AI 清洗：
// 1. 去掉正文里的“需项目确认 / 待项目确认 / 具体细节待确认”等尾句；
// 2. 非游戏内实际保留的英文名尽量改成中文表达；
// 3. 不删条目、不合并条目、不用本地规则替换专名，实际改写交给非 Pro 模型。

const ROOT = path.join(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data", "store.json");
const INPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-扩展世界书-中文本地化版.json");
const OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-扩展世界书-中文本地化精校版.json");
const DEFAULT_PROVIDER_NAME = "CaMeL";
const DEFAULT_MODEL = "deepseek-v4-flash";
const REQUEST_TIMEOUT_MS = 180000;
const BATCH_SIZE = Number(process.env.ZZZ_CLEANUP_BATCH_SIZE || 6);

const ALLOWED_STYLIZED_TERMS = [
  "AI",
  "HIA",
  "H.A.N.D.",
  "HAND",
  "HDD",
  "H.D.D.",
  "TOPS",
  "COFF CAFE",
  "Random Play",
  "Fairy",
  "THE NEWS",
  "VR",
  "141",
  "PubSec"
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
  const provider = providers.find((item) => item.name === DEFAULT_PROVIDER_NAME)
    || providers.find((item) => item.apiKey && item.baseUrl !== "mock://local");
  if (!provider) throw new Error("没有找到可用 AI 提供商。");
  const model = (provider.models || []).find((item) => item === DEFAULT_MODEL)
    || (provider.models || []).find((item) => !/pro|embedding|rerank/i.test(item));
  if (!model) throw new Error(`提供商 ${provider.name || provider.id} 没有可用非 Pro 文本模型。`);
  if (/pro/i.test(model)) throw new Error(`当前模型 ${model} 包含 Pro，不符合用户要求。`);
  return { provider, model };
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
    if (!response.ok) throw new Error(`AI 调用失败：${response.status} ${text.slice(0, 500)}`);
    const payload = JSON.parse(text);
    const output = payload?.choices?.[0]?.message?.content || "";
    if (!output.trim()) throw new Error("AI 响应中没有文本。");
    return output.trim();
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

function hasNonAllowedEnglish(text) {
  let value = String(text || "");
  for (const term of ALLOWED_STYLIZED_TERMS) {
    value = value.replaceAll(term, "");
  }
  return /[A-Za-z]{3,}/.test(value);
}

function needsCleanup(entry) {
  const text = [entry.name, entry.content, ...(entry.keys || [])].join("\n");
  return /暂译|待校|需项目确认|待项目确认|具体.*确认|具体.*待/.test(text)
    || hasNonAllowedEnglish(entry.name)
    || hasNonAllowedEnglish(entry.content);
}

function buildSystemPrompt() {
  return [
    "你是《绝区零》简中世界书精校编辑。",
    "必须输出 JSON 数组，不要 Markdown，不要解释。",
    "任务：清洗条目里的残余英文、临时说明和不确定尾句，让条目更像简中游戏世界书。",
    "",
    "规则：",
    "1. 不删条目、不合并条目、不新增条目，index 必须原样返回。",
    "2. name、keys、content 里禁止出现：暂译、待校、需项目确认、待项目确认、具体中文名、具体细节待确认。",
    "3. 不能确认的细节不要写进正文尾句，放入 uncertainNotes。",
    "4. 非必要英文改成中文；游戏内实际保留的风格化名可保留：AI、HIA、H.A.N.D.、HDD、TOPS、COFF CAFE、Random Play、Fairy、THE NEWS、VR、141。",
    "5. 不要编造新设定，只做清洗、本地化和中文表达整理。",
    "6. content 保持原条目信息密度，不要明显缩短。",
    "",
    "输出每项格式：",
    "{\"index\":0,\"name\":\"条目名\",\"keys\":[\"触发词\"],\"content\":\"正文\",\"uncertainNotes\":[]}"
  ].join("\n");
}

function validate(items, batch) {
  const expected = new Set(batch.map((item) => item.index));
  for (const item of items) {
    if (!expected.has(item.index)) throw new Error(`未知 index：${item.index}`);
    if (!item.name || !item.content) throw new Error(`index ${item.index} 缺 name/content`);
    const text = [item.name, item.content, ...(item.keys || [])].join("\n");
    if (/暂译|待校|需项目确认|待项目确认|具体.*确认|具体.*待/.test(text)) {
      throw new Error(`index ${item.index} 仍有临时说明`);
    }
  }
}

async function cleanupBatch({ provider, model, batch, batchNumber }) {
  const prompt = [
    `请精校下面 ${batch.length} 个条目。`,
    JSON.stringify(batch, null, 2)
  ].join("\n");
  let lastOutput = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      lastOutput = await callAi({
        provider,
        model,
        systemPrompt: buildSystemPrompt(),
        userPrompt: prompt
      });
      const parsed = parseJsonArray(lastOutput);
      validate(parsed, batch);
      return parsed;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`第 ${batchNumber} 批精校失败：${error.message}\n${lastOutput.slice(0, 800)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }
  throw new Error(`第 ${batchNumber} 批精校失败`);
}

async function main() {
  const store = readJson(STORE_PATH);
  const { provider, model } = pickProvider(store);
  const lorebook = readJson(INPUT_FILE);
  const entries = lorebook.data.entries;
  const flagged = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => needsCleanup(entry));
  const batches = [];
  for (let i = 0; i < flagged.length; i += BATCH_SIZE) {
    batches.push(flagged.slice(i, i + BATCH_SIZE).map(({ entry, index }) => ({
      index,
      name: entry.name,
      keys: entry.keys || [],
      content: entry.content
    })));
  }
  console.log(JSON.stringify({ step: "start", flagged: flagged.length, batches: batches.length, provider: provider.name || provider.id, model }, null, 2));
  for (let i = 0; i < batches.length; i += 1) {
    const cleaned = await cleanupBatch({ provider, model, batch: batches[i], batchNumber: i + 1 });
    for (const item of cleaned) {
      const entry = entries[item.index];
      entry.name = item.name;
      entry.comment = item.name;
      entry.keys = item.keys;
      entry.key = item.keys;
      entry.content = item.content;
      entry.extensions = {
        ...(entry.extensions || {}),
        cleanup: {
          source: "camel_deepseek_v4_flash",
          uncertainNotes: Array.isArray(item.uncertainNotes) ? item.uncertainNotes : [],
          cleanedAt: new Date().toISOString()
        }
      };
    }
    console.log(JSON.stringify({ step: "batch_done", batch: i + 1, totalBatches: batches.length }));
  }
  lorebook.data.name = "绝区零-扩展世界书-中文本地化精校版";
  lorebook.data.description = "对英文来源扩展世界书做简中专名本地化与二次精校后的版本；保留 214 条粒度，去除暂译、待校和正文不确定尾句。";
  lorebook.data.extensions = {
    ...(lorebook.data.extensions || {}),
    cleanup: {
      generatedAt: new Date().toISOString(),
      flaggedCount: flagged.length,
      provider: provider.name || provider.id,
      model
    }
  };
  writeJson(OUTPUT_FILE, lorebook);
  console.log(JSON.stringify({ ok: true, outputFile: OUTPUT_FILE, entries: entries.length, cleaned: flagged.length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
