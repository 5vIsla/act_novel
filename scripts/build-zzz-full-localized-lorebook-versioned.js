const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 生成“指定版本原始中文世界书 + 中文本地化精校扩展资料”的全量世界书。
// 融合策略是全量保留和来源标记，不按同名、关键词或相似内容删除条目。

const ROOT = path.join(__dirname, "..");
const DEFAULT_RAW_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零设定集-v2.5-原始对齐导入版.json");
const LOCALIZED_EXPANDED_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-扩展世界书-中文本地化精校版.json");

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

function normalizeVersionLabel(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "unknown") return "unknown";
  return raw.startsWith("v") || raw.startsWith("V") ? raw : `v${raw}`;
}

function safeVersionId(value) {
  return normalizeVersionLabel(value).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "unknown";
}

function versionFromFile(file) {
  const name = path.basename(file);
  const match = name.match(/(?:v|V)?(\d+(?:\.\d+)+)/);
  return match ? match[1] : "unknown";
}

function normalizeEntryForFullBook(entry, prefix, index, options) {
  const next = clone(entry);
  const originalName = String(next.name || next.comment || next.title || `条目 ${index + 1}`).trim();
  const originalId = next.id ?? next.uid ?? index;
  const sourceType = options.sourceType;

  return {
    ...next,
    id: `lore_zzz_full_localized_${options.versionId}_${prefix}_${String(originalId).replace(/[^a-zA-Z0-9_-]/g, "_")}_${index}`,
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
        mergePolicy: "保留原始中文世界书与中文本地化扩展资料，不按名称或关键词去重删除。"
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
    rawOriginalCount: rawEntries.length,
    localizedExpandedCount: expandedEntries.length,
    fullCount: fullEntries.length,
    expectedFullCount: rawEntries.length + expandedEntries.length,
    disabledCount: fullEntries.filter((entry) => entry.enabled === false || entry.disable === true).length,
    sameNameExpandedCount: sameNameExpanded.length,
    sameNameExpanded: sameNameExpanded.slice(0, 120),
    temporaryMarkerCount: fullEntries.filter((entry) => /暂译|待校|需项目确认|待项目确认/.test([entry.name, entry.content, ...(entry.keys || [])].join("\n"))).length,
    note: "同名条目只记录不删除；原始中文世界书优先级高于本地化扩展资料。"
  };
}

function main() {
  const rawFile = path.resolve(process.argv[2] || DEFAULT_RAW_FILE);
  const versionLabel = normalizeVersionLabel(process.argv[4] || versionFromFile(rawFile));
  const versionId = safeVersionId(versionLabel);
  const outputFile = path.resolve(process.argv[3] || path.join(ROOT, "resources", "lorebooks", `绝区零-全量融合世界书-${versionLabel}+中文本地化扩展版.json`));

  const rawBook = readJson(rawFile);
  const localizedExpandedBook = readJson(LOCALIZED_EXPANDED_FILE);
  const rawEntries = entriesOf(rawBook);
  const localizedExpandedEntries = entriesOf(localizedExpandedBook);
  const rawFullEntries = rawEntries.map((entry, index) => normalizeEntryForFullBook(entry, "raw", index, {
    versionId,
    priorityBase: 800,
    sourceType: `zzz_${versionId}_original`
  }));
  const localizedFullEntries = localizedExpandedEntries.map((entry, index) => normalizeEntryForFullBook(entry, "localized_expanded", index, {
    versionId,
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
      name: `绝区零-全量融合世界书-${versionLabel}+中文本地化扩展版`,
      description: `保留中文 ${versionLabel} 原始世界书 ${rawEntries.length} 条，并追加英文来源世界书经绝区零简中专名本地化后的 ${localizedExpandedEntries.length} 条扩展资料。原始条目优先级高于扩展条目。`,
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
            file: path.relative(ROOT, rawFile),
            sha256: sha256(rawFile),
            entryCount: rawEntries.length,
            role: `中文 ${versionLabel} 原始世界书，作为优先触发底座。`
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
  writeJson(outputFile, output);
  console.log(JSON.stringify({ outputFile, report }, null, 2));
}

if (require.main === module) {
  main();
}
