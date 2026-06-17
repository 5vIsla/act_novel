const fs = require("fs");
const path = require("path");

// 使用 CaMeL / deepseek-v4-flash 生成中文 v2.4 公开差异补充条目。
// 这里不做本地规则矫正，也不凭空扩写成大量条目；只把公开页面能确认的 v2.4 更新点
// 交给非 Pro 模型重写为可触发的世界书补充条目。

const ROOT = path.join(__dirname, "..");
const STORE_FILE = path.join(ROOT, "data", "store.json");
const BASE_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-融合中文重写世界书-扩展版.json");
const OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-融合中文重写世界书-v2.4已知差异补全版.json");
const MODEL = "deepseek-v4-flash";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function joinUrl(baseUrl, pathPart) {
  return String(baseUrl || "").replace(/\/+$/, "") + pathPart;
}

function pickCamelProvider(store) {
  const provider = (store.providers || []).find((item) => item.name === "CaMeL");
  if (!provider) throw new Error("没有找到 CaMeL 提供商。");
  if (!provider.apiKey) throw new Error("CaMeL 提供商缺少 key。");
  return provider;
}

function relevantContext(base) {
  const terms = [
    "Ye Shunguang", "叶瞬光",
    "Ye Shiyuan", "叶时远",
    "Banyue", "半月",
    "Dialyn", "戴琳",
    "Zhao", "赵",
    "Promeia", "普罗米亚",
    "Krampus"
  ];
  const entries = base.data.entries || [];
  const picked = [];
  for (const entry of entries) {
    const text = [entry.name, ...(entry.keys || []), entry.content].join("\n");
    if (terms.some((term) => text.includes(term))) {
      picked.push({
        id: entry.id,
        name: entry.name,
        keys: (entry.keys || []).slice(0, 12),
        content: String(entry.content || "").slice(0, 900)
      });
    }
  }
  return picked;
}

async function callCamel(provider, systemPrompt, userPrompt) {
  const endpoint = joinUrl(provider.baseUrl, "/chat/completions");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CaMeL 调用失败：${response.status} ${text.slice(0, 500)}`);
  }
  const payload = JSON.parse(text);
  const output = payload?.choices?.[0]?.message?.content || "";
  if (!output.trim()) throw new Error("CaMeL 响应中没有文本。");
  return output.trim();
}

function parseJsonArray(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("不是数组");
    return parsed;
  } catch (_error) {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) throw _error;
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("不是数组");
    return parsed;
  }
}

function buildPrompt(base) {
  const updateNote = {
    source: "https://t.me/s/qiqinsfw?before=106",
    file: "绝区零设定集[v2.4].json",
    publicNote: [
      "公开页面显示：已更新至绝区零 2.0。",
      "新增组织设定：坎卜斯黑枝。",
      "新增人物设定：照、琉音、般岳、叶瞬光。",
      "更新了叶释渊的角色卡。",
      "本机无法直接下载 Telegram 附件，所以只能基于公开更新点和现有扩展版相关条目生成补充。"
    ]
  };
  return [
    "请基于下面的公开更新点和现有条目上下文，生成 v2.4 已知差异补充世界书条目。",
    "必须只输出 JSON 数组，不要 Markdown。",
    "目标条目必须正好 7 条：",
    "1. v2.4已知差异说明",
    "2. 坎卜斯黑枝",
    "3. 照",
    "4. 琉音",
    "5. 般岳",
    "6. 叶瞬光",
    "7. 叶释渊",
    "",
    "每条输出格式：",
    "{ \"name\": \"条目名\", \"keys\": [\"关键词\"], \"content\": \"中文世界书正文\", \"priority\": 数字, \"tokenBudget\": 数字 }",
    "",
    "硬要求：",
    "1. 不要编造公开更新点之外的大量新组织或新角色。",
    "2. 不确定的中文名、关系或版本细节必须写“待项目校准”。",
    "3. content 写成角色扮演/小说写作用世界书，不要百科腔，不要游戏机制。",
    "4. 每条 120 到 300 个中文字符。",
    "5. 保留必要英文原名作为关键词，例如 Krampus、Zhao、Dialyn、Banyue、Ye Shunguang、Ye Shiyuan。",
    "",
    "公开更新点：",
    JSON.stringify(updateNote, null, 2),
    "",
    "现有扩展版相关上下文：",
    JSON.stringify(relevantContext(base), null, 2)
  ].join("\n");
}

function toLoreEntry(raw, id, index) {
  const keys = Array.isArray(raw.keys) ? raw.keys.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!raw.name || keys.length === 0 || !raw.content) {
    throw new Error(`补充条目格式不完整：${JSON.stringify(raw).slice(0, 200)}`);
  }
  return {
    id,
    uid: id,
    key: keys,
    keys,
    keysecondary: [],
    secondary_keys: [],
    comment: String(raw.name).trim(),
    name: String(raw.name).trim(),
    content: String(raw.content).trim(),
    enabled: true,
    constant: index === 0,
    selective: index !== 0,
    selectiveLogic: 0,
    position: index === 0 ? "before_character" : "after_character",
    insertion_order: Number(raw.priority || 2000 + index),
    priority: Number(raw.priority || 2000 + index),
    probability: 100,
    use_regex: false,
    case_sensitive: false,
    token_budget: Number(raw.tokenBudget || 700),
    extensions: {
      depth: 8,
      weight: 12,
      addMemo: true,
      displayIndex: id,
      useProbability: true,
      excludeRecursion: true,
      roleplay_writer: {
        source: "zzz_cn_v24_known_delta_camel",
        aiProvider: "CaMeL",
        aiModel: MODEL,
        note: "基于中文 v2.4 公开更新点与现有扩展版上下文生成；不是原始 Telegram JSON 的逐条导出。"
      }
    }
  };
}

async function main() {
  const store = readJson(STORE_FILE);
  const base = readJson(BASE_FILE);
  const provider = pickCamelProvider(store);
  const systemPrompt = [
    "你是中文同人世界书编辑。",
    "你只输出可解析 JSON。",
    "你不能用 Pro 模型；当前调用模型是 deepseek-v4-flash。"
  ].join("\n");
  const output = await callCamel(provider, systemPrompt, buildPrompt(base));
  const parsed = parseJsonArray(output);
  if (parsed.length !== 7) {
    throw new Error(`预期 7 条补充，实际 ${parsed.length} 条。`);
  }
  const baseEntries = base.data.entries || [];
  const maxId = baseEntries.reduce((max, entry) => Math.max(max, Number(entry.id || 0)), 0);
  const deltaEntries = parsed.map((item, index) => toLoreEntry(item, maxId + index + 1, index));
  const merged = {
    ...base,
    data: {
      ...base.data,
      name: "绝区零-融合中文重写世界书-v2.4已知差异补全版",
      description: `${base.data.description || ""}\n\n本版在扩展版基础上，用 CaMeL / deepseek-v4-flash 补入中文 v2.4 公开页面可确认的已知差异条目。`,
      entries: [...baseEntries, ...deltaEntries],
      extensions: {
        ...(base.data.extensions || {}),
        roleplay_writer: {
          ...(base.data.extensions?.roleplay_writer || {}),
          generatedAt: new Date().toISOString(),
          baseEntryCount: baseEntries.length,
          knownV24DeltaCount: deltaEntries.length,
          entryCount: baseEntries.length + deltaEntries.length,
          v24DeltaModel: "CaMeL / deepseek-v4-flash",
          v24DeltaSource: "https://t.me/s/qiqinsfw?before=106"
        }
      }
    }
  };
  writeJson(OUTPUT_FILE, merged);
  console.log(JSON.stringify({
    ok: true,
    outputFile: OUTPUT_FILE,
    baseEntries: baseEntries.length,
    deltaEntries: deltaEntries.length,
    finalEntries: merged.data.entries.length,
    model: "CaMeL / deepseek-v4-flash"
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
