const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 生成“绝区零全量融合世界书”。
// 目标不是只对齐某一个来源，而是在可追溯的前提下保留所有已确认来源：
// 1. 用户提供的中文 v2.4 原始世界书 79 条；
// 2. 之前根据 Chub / LoreBary 英文世界书重写得到的扩展版 214 条。
// 这里不调用 AI、不做本地规则补写、不按名称去重删除；同名或近似条目会同时保留，并通过来源和优先级区分。

const ROOT = path.join(__dirname, "..");
const RAW_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零设定集-v2.4-原始对齐导入版.json");
const EXPANDED_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-融合中文重写世界书-扩展版.json");
const OUTPUT_FILE = path.join(ROOT, "resources", "lorebooks", "绝区零-全量融合世界书-v2.4+扩展版.json");

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
  const priorityBase = options.priorityBase;
  const sourceType = options.sourceType;

  return {
    ...next,
    id: `lore_zzz_full_${prefix}_${String(originalId).replace(/[^a-zA-Z0-9_-]/g, "_")}_${index}`,
    name: originalName,
    priority: priorityBase - index,
    source: {
      type: sourceType,
      id: String(originalId)
    },
    createdAt: next.createdAt || "2026-05-21T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
    extensions: {
      ...(next.extensions || {}),
      fullMerge: {
        sourceType,
        originalId,
        originalName,
        originalIndex: index,
        mergePolicy: "保留所有来源条目，不按名称或关键词去重删除。"
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
    expandedCount: expandedEntries.length,
    fullCount: fullEntries.length,
    expectedFullCount: rawEntries.length + expandedEntries.length,
    disabledCount: fullEntries.filter((entry) => entry.enabled === false || entry.disable === true).length,
    controlEntryCountFromExpanded: expandedEntries.slice(0, 3).filter((entry) => [
      "扩展版世界书使用规则",
      "正典与同人边界",
      "信息权限与剧透控制"
    ].includes(entry.name)).length,
    sameNameExpandedCount: sameNameExpanded.length,
    sameNameExpanded: sameNameExpanded.slice(0, 120),
    note: "sameNameExpanded 只是重复提示，不用于删除；全量版按用户要求保留所有真正属于绝区零或本项目世界书运行所需的来源条目。"
  };
}

function main() {
  const rawBook = readJson(RAW_FILE);
  const expandedBook = readJson(EXPANDED_FILE);
  const rawEntries = entriesOf(rawBook);
  const expandedEntries = entriesOf(expandedBook);

  const rawFullEntries = rawEntries.map((entry, index) => normalizeEntryForFullBook(entry, "raw_v24", index, {
    priorityBase: 700,
    sourceType: "zzz_v24_original"
  }));
  const expandedFullEntries = expandedEntries.map((entry, index) => normalizeEntryForFullBook(entry, "expanded", index, {
    priorityBase: 300,
    sourceType: index < 3 ? "project_lorebook_control" : "zzz_chub_lorebary_expanded"
  }));
  const fullEntries = [...rawFullEntries, ...expandedFullEntries];
  const report = buildReport(rawEntries, expandedEntries, fullEntries);

  if (report.fullCount !== report.expectedFullCount) {
    throw new Error(`全量条目数不一致：${report.fullCount} / ${report.expectedFullCount}`);
  }

  const output = {
    spec: "lorebook_v1",
    data: {
      name: "绝区零-全量融合世界书-v2.4+扩展版",
      description: "保留用户提供的中文 v2.4 原始世界书 79 条，并追加此前扩展版 214 条。该文件不去重、不删条目，原始 v2.4 条目优先级高于扩展资料。",
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
        mergePolicy: "全量保留；不调用 AI；不规则补写；不按名称或关键词去重删除；用优先级处理来源冲突。",
        sources: [
          {
            file: path.relative(ROOT, RAW_FILE),
            sha256: sha256(RAW_FILE),
            entryCount: rawEntries.length,
            role: "中文 v2.4 原始世界书，作为优先触发底座。"
          },
          {
            file: path.relative(ROOT, EXPANDED_FILE),
            sha256: sha256(EXPANDED_FILE),
            entryCount: expandedEntries.length,
            role: "Chub / LoreBary 覆盖范围的中文重写扩展资料，作为补充触发资料。"
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
