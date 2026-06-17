const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 将用户手动下载的 SillyTavern 世界书原始 JSON 转成本项目的独立世界书格式。
// 这个脚本只做结构映射与可追溯记录，不调用 AI，不新增条目，不用规则补齐或改写内容。

const ROOT = path.join(__dirname, "..");
const DEFAULT_SOURCE_FILE = path.join(ROOT, "resources", "source", "绝区零设定集[v2.4].json");
const DEFAULT_OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零设定集-v2.4-原始对齐导入版.json");
const PROJECT_EXTENSION_KEY = "roleplayNovelStudio";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
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

function keywordList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings(String(value || "").split(/[,，\n]/));
}

function truthy(value) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePosition(position) {
  const value = String(position ?? "").trim();
  const map = {
    "0": "before_character",
    "1": "after_character",
    "2": "before_memory",
    "3": "after_memory",
    before_char: "before_character",
    before_character: "before_character",
    after_char: "after_character",
    after_character: "after_character",
    before_author_note: "before_memory",
    before_memory: "before_memory",
    after_author_note: "after_memory",
    after_memory: "after_memory"
  };
  return map[value] || "after_character";
}

function normalizeEntry(rawEntry, uid, index) {
  const source = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const keys = keywordList(source.keys ?? source.key);
  const secondaryKeys = keywordList(source.secondaryKeys ?? source.secondary_keys ?? source.keysecondary);
  const comment = String(source.comment || source.name || source.title || "").trim();
  const content = String(source.content || "").trim();
  const constant = truthy(source.constant);
  const useRegex = truthy(source.use_regex);
  const safeUid = String(source.uid ?? uid ?? index);

  return {
    id: `lore_zzz_v24_${safeUid}`,
    name: comment || keys[0] || `绝区零 v2.4 条目 ${index + 1}`,
    enabled: !truthy(source.disable) && source.enabled !== false,
    scope: "global",
    ownerId: "",
    keys,
    secondaryKeys,
    content,
    position: normalizePosition(source.position),
    priority: numberOrFallback(source.order ?? source.insertion_order ?? source.displayIndex, index),
    tokenBudget: Math.max(900, Math.min(4000, content.length || 900)),
    matchMode: constant ? "always" : useRegex ? "regex" : "any",
    caseSensitive: Boolean(source.caseSensitive ?? source.case_sensitive),
    visibility: ["planner", "director", "adapter", "minor", "character:*"],
    source: {
      type: "sillytavern_world_info",
      id: safeUid
    },
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    extensions: {
      [PROJECT_EXTENSION_KEY]: {
        originalUid: source.uid ?? uid ?? index,
        originalComment: comment,
        originalFlags: {
          constant: Boolean(source.constant),
          selective: Boolean(source.selective),
          selectiveLogic: source.selectiveLogic ?? null,
          disable: Boolean(source.disable),
          position: source.position ?? null,
          depth: source.depth ?? null,
          scanDepth: source.scanDepth ?? null
        }
      }
    }
  };
}

function extractEntries(source) {
  const book = source?.data && typeof source.data === "object" ? source.data : source;
  const entries = book?.entries;
  if (Array.isArray(entries)) {
    return entries.map((entry, index) => ({ uid: entry?.uid ?? index, entry }));
  }
  if (entries && typeof entries === "object") {
    return Object.entries(entries).map(([uid, entry]) => ({ uid, entry }));
  }
  return [];
}

function buildReport(entries) {
  const enabled = entries.filter((entry) => entry.enabled);
  const warnings = [];
  const enabledNoTrigger = enabled.filter((entry) => entry.matchMode !== "always" && entry.keys.length === 0);
  if (enabledNoTrigger.length > 0) {
    warnings.push({
      type: "enabled_entry_without_primary_keys",
      message: "这些原始启用条目没有主关键词，项目内不会主动触发；脚本按原始结构保留，没有用条目名自动补关键词。",
      entries: enabledNoTrigger.map((entry) => entry.name)
    });
  }
  return {
    entryCount: entries.length,
    enabledCount: enabled.length,
    disabledCount: entries.length - enabled.length,
    alwaysCount: entries.filter((entry) => entry.matchMode === "always").length,
    regexCount: entries.filter((entry) => entry.matchMode === "regex").length,
    noPrimaryKeyCount: entries.filter((entry) => entry.keys.length === 0).length,
    totalContentChars: entries.reduce((sum, entry) => sum + entry.content.length, 0),
    warnings
  };
}

function convert(sourceFile, outputFile) {
  const source = readJson(sourceFile);
  const rawEntries = extractEntries(source);
  if (rawEntries.length === 0) {
    throw new Error("没有识别到 SillyTavern 世界书 entries。");
  }

  // 禁用的分组分隔条目即使正文为空，也属于原世界书结构的一部分。
  // 这里必须保留，避免把 79 条原始世界书压成 78 条。
  const entries = rawEntries.map((item, index) => normalizeEntry(item.entry, item.uid, index));
  const report = buildReport(entries);

  const output = {
    spec: "lorebook_v1",
    data: {
      name: "绝区零设定集 v2.4 原始对齐导入版",
      description: "由用户提供的 SillyTavern 世界书《绝区零设定集[v2.4].json》结构转换而来。仅做字段映射，不调用 AI，不新增条目，不进行规则补写。",
      scan_depth: 6,
      token_budget: 1800,
      recursive_scanning: false,
      settings: {
        scanDepth: 6,
        maxTriggeredEntries: 12,
        maxCharsPerEntry: 1800,
        recursiveScanning: false
      },
      metadata: {
        sourceFile,
        sourceSha256: sha256(sourceFile),
        convertedAt: new Date().toISOString(),
        conversionPolicy: "结构映射；保持原始 79 条粒度；不做 AI 重写；不做规则矫正。",
        report
      },
      entries
    }
  };

  writeJson(outputFile, output);
  return { outputFile, report };
}

function main() {
  const sourceFile = path.resolve(process.argv[2] || DEFAULT_SOURCE_FILE);
  const outputFile = path.resolve(process.argv[3] || DEFAULT_OUTPUT_FILE);
  const result = convert(sourceFile, outputFile);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}
