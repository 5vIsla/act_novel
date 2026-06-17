const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 生成“原始 v2.4 + 中文本地化精校扩展资料”的全量世界书。
// 与旧全量版相比，这里不再直接使用半英文扩展版，而是使用已做绝区零简中专名本地化的扩展世界书。

const ROOT = path.join(__dirname, "..");
const RAW_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零设定集-v2.4-原始对齐导入版.json");
const LOCALIZED_EXPANDED_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-扩展世界书-中文本地化精校版.json");
const OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-全量融合世界书-v2.4+中文本地化扩展版.json");

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

function entriesOf(book) {
  const data = book?.data && typeof book.data === "object" ? book.data : book;
  const entries = data?.entries;
  if (Array.isArray(entries)) return entries;
  if (entries && typeof entries === "object") return Object.values(entries);
  return [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEntryForFullBook(entry, prefix, index, options) {
  const next = clone(entry);
  const originalName = String(next.name || next.comment || next.title || `条目 ${index + 1}`).trim();
  const originalId = next.id ?? next.uid ?? index;
  const sourceType = options.sourceType;

  return {
    ...next,
    id: `lore_zzz_full_localized_${prefix}_${String(originalId).replace(/[^a-zA-Z0-9_-]/g, "_")}_${index}`,
    name: originalName,
    comment: originalName,
    priority: options.priorityBase - index,
    source: {
      type: sourceType,
      id: String(originalId)
    },
    createdAt: next.createdAt || "2026-05-21T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
    extensions: {
      ...(next.extensions || {}),
      fullLocalizedMerge: {
        sourceType,
        originalId,
        originalName,
        originalIndex: index,
        mergePolicy: "保留原始 v2.4 与中文本地化扩展资料，不按名称或关键词去重删除。"
      }
    }
  };
}

function simpleName(name) {
  return String(name || "").replace(/[【】\[\]（）()\-—\s]/g, "").toLowerCase();
}

function buildReport(rawEntries, expandedEntries, fullEntries) {
  const rawNames = new Set(rawEntries.map((entry) => simpleName(entry.name || entry.comment)));
  const sameNameExpanded = expandedEntries
    .map((entry) => String(entry.name || entry.comment || "").trim())
    .filter((name) => name && rawNames.has(simpleName(name)));
  return {
    rawV24Count: rawEntries.length,
    localizedExpandedCount: expandedEntries.length,
    fullCount: fullEntries.length,
    expectedFullCount: rawEntries.length + expandedEntries.length,
    disabledCount: fullEntries.filter((entry) => entry.enabled === false || entry.disable === true).length,
    sameNameExpandedCount: sameNameExpanded.length,
    sameNameExpanded: sameNameExpanded.slice(0, 120),
    temporaryMarkerCount: fullEntries.filter((entry) => /暂译|待校|需项目确认|待项目确认/.test([entry.name, entry.content, ...(entry.keys || [])].join("\n"))).length,
    note: "同名条目只记录不删除；原始 v2.4 优先级高于本地化扩展资料。"
  };
}

function main() {
  const rawBook = readJson(RAW_FILE);
  const localizedExpandedBook = readJson(LOCALIZED_EXPANDED_FILE);
  const rawEntries = entriesOf(rawBook);
  const localizedExpandedEntries = entriesOf(localizedExpandedBook);
  const rawFullEntries = rawEntries.map((entry, index) => normalizeEntryForFullBook(entry, "raw_v24", index, {
    priorityBase: 800,
    sourceType: "zzz_v24_original"
  }));
  const localizedFullEntries = localizedExpandedEntries.map((entry, index) => normalizeEntryForFullBook(entry, "localized_expanded", index, {
    priorityBase: 350,
    sourceType: index < 3 ? "project_lorebook_control" : "zzz_chub_lorebary_localized"
  }));
  const fullEntries = [...rawFullEntries, ...localizedFullEntries];
  const report = buildReport(rawEntries, localizedExpandedEntries, fullEntries);
  if (report.fullCount !== report.expectedFullCount) {
    throw new Error(`全量条目数不一致：${report.fullCount} / ${report.expectedFullCount}`);
  }

  const output = {
    spec: "lorebook_v1",
    data: {
      name: "绝区零-全量融合世界书-v2.4+中文本地化扩展版",
      description: "保留中文 v2.4 原始世界书 79 条，并追加英文来源世界书经绝区零简中专名本地化后的 214 条扩展资料。原始条目优先级高于扩展条目。",
      scan_depth: 6,
      token_budget: 1800,
      recursive_scanning: false,
      settings: {
        scanDepth: 6,
        maxTriggeredEntries: 16,
        maxCharsPerEntry: 1800,
        recursiveScanning: false
      },
      metadata: {
        convertedAt: new Date().toISOString(),
        mergePolicy: "全量保留；不规则补写；不删除英文来源条目；扩展资料已做简中专名本地化。",
        sources: [
          {
            file: path.relative(ROOT, RAW_FILE),
            sha256: sha256(RAW_FILE),
            entryCount: rawEntries.length,
            role: "中文 v2.4 原始世界书，作为优先触发底座。"
          },
          {
            file: path.relative(ROOT, LOCALIZED_EXPANDED_FILE),
            sha256: sha256(LOCALIZED_EXPANDED_FILE),
            entryCount: localizedExpandedEntries.length,
            role: "英文来源扩展世界书的简中专名本地化精校版。"
          }
        ],
        report
      },
      entries: fullEntries
    }
  };
  writeJson(OUTPUT_FILE, output);
  console.log(JSON.stringify({ outputFile: OUTPUT_FILE, report }, null, 2));
}

if (require.main === module) {
  main();
}
