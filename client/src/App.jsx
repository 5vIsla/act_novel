import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import * as THREE from "three";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  ConfigProvider,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  PageHeader,
  Popconfirm,
  Radio,
  Select,
  Slider,
  Space,
  Spin,
  Steps,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload
} from "@arco-design/web-react";
import {
  IconApps,
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBook,
  IconBranch,
  IconBug,
  IconClose,
  IconCode,
  IconCopy,
  IconDashboard,
  IconDelete,
  IconEdit,
  IconExperiment,
  IconFile,
  IconFileImage,
  IconFileVideo,
  IconFolder,
  IconBgColors,
  IconHistory,
  IconHome,
  IconImport,
  IconList,
  IconMenuFold,
  IconMenuUnfold,
  IconMessage,
  IconMindMapping,
  IconPen,
  IconPlayArrow,
  IconPlus,
  IconQuestionCircle,
  IconRecordStop,
  IconRefresh,
  IconRobot,
  IconSafe,
  IconSave,
  IconSearch,
  IconSettings,
  IconStorage,
  IconSwap,
  IconThunderbolt,
  IconTool,
  IconUndo,
  IconUpload,
  IconUser,
  IconUserGroup
} from "@arco-design/web-react/icon";
import { api } from "./api";

const { Content, Header, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Item: TimelineItem } = Timeline;
const { Item: FormItem } = Form;
const { TabPane } = Tabs;
const StableParticles = memo(Particles);

// 所有触发型弹层统一挂到页面 body，避免被抽屉、滚动容器或磨砂层裁剪。
const popupToBody = (node) => (node?.ownerDocument || document).body;

let particlesEnginePromise = null;
let particlesEngineReady = false;

const globalPageItems = [
  { key: "library", label: "小说库", icon: <IconHome /> },
];

const bookWorkspaceItems = [
  { key: "planning", label: "策划 Agent", icon: <IconMessage /> },
  { key: "archives", label: "档案", icon: <IconArchive /> },
  { key: "lorebook", label: "世界书", icon: <IconBook /> },
  { key: "memory", label: "长期记忆", icon: <IconStorage /> },
  { key: "roleplay", label: "扮演配置", icon: <IconUserGroup /> },
  { key: "writing", label: "章节写作", icon: <IconPen /> },
  { key: "agentSettings", label: "Agent 设置", icon: <IconTool /> }
];

const systemPageItems = [
  { key: "providers", label: "提供商", icon: <IconSettings /> }
];

const pageItems = [...globalPageItems, ...bookWorkspaceItems, ...systemPageItems];

const planningStarterPrompts = [
  {
    label: "整理设定",
    prompt: "请先检索当前小说已有资料，整理目前稳定设定、未决问题和需要我确认的冲突。"
  },
  {
    label: "补角色卡",
    prompt: "请根据当前对话和档案，检查主要角色卡缺口，必要时给出可写入的角色卡补全方案。"
  },
  {
    label: "规划下一章",
    prompt: "请为下一章做写前定位：承接、主视角、角色关系压力、调用资料、后台设定和扮演观察点。"
  }
];

const plannerModeOptions = [
  { key: "auto", label: "自主", color: "arcoblue", description: "默认由 Agent 自己判断用户目标、检索、工具调用、写入边界和审查收束；UI 不替它固定流程。" },
  { key: "planning", label: "策划", color: "arcoblue", description: "提醒 Agent 优先考虑设定整理、大纲推进和资料沉淀，但仍需自主判断。" },
  { key: "readonly", label: "只读", color: "gray", description: "安全约束：除非用户在同条消息明确要求写入，否则只检索和分析。" },
  { key: "writing", label: "写作", color: "green", description: "提醒 Agent 优先考虑章节定位、正文改写和段落级修订，但不替代目标理解。" },
  { key: "review", label: "审查", color: "orange", description: "提醒 Agent 优先考虑诊断、质量门禁和一致性审查，但不固定流程。" },
  { key: "import", label: "导入", color: "purple", description: "提醒 Agent 优先考虑长资料、角色卡、世界书和旧稿导入，但仍由 Agent 决定工具。" }
];

const plannerSlashCommandTemplates = [
  { id: "goal", command: "/goal", label: "设置当前目标", icon: <IconMindMapping />, color: "purple", description: "把本轮长期目标固定到 composer 上方，不直接启动 Agent。", kind: "goal" },
  { id: "mode-auto", command: "/auto", label: "恢复自主执行", icon: <IconRobot />, color: "arcoblue", description: "清除执行偏好，让 Agent 完全按上下文自主判断。", kind: "mode", mode: "auto" },
  { id: "mode-planning", command: "/plan", label: "偏向策划", icon: <IconMessage />, color: "arcoblue", description: "只给 Agent 一个策划倾向，不锁定流程。", kind: "mode", mode: "planning" },
  { id: "mode-readonly", command: "/readonly", label: "只读保护", icon: <IconSafe />, color: "gray", description: "只读是安全约束，不是流程路由。", kind: "mode", mode: "readonly" },
  { id: "mode-writing", command: "/write", label: "偏向写作", icon: <IconPen />, color: "green", description: "只给 Agent 一个写作倾向，不锁定流程。", kind: "mode", mode: "writing" },
  { id: "mode-review", command: "/review", label: "偏向审查", icon: <IconBug />, color: "orange", description: "只给 Agent 一个审查倾向，不锁定流程。", kind: "mode", mode: "review" },
  { id: "mode-import", command: "/import", label: "偏向导入", icon: <IconImport />, color: "purple", description: "只给 Agent 一个资料导入倾向，不锁定流程。", kind: "mode", mode: "import" },
  { id: "context", command: "/context", label: "打开本轮过程", icon: <IconSearch />, color: "arcoblue", description: "查看本轮读了哪些资料、调用了哪些工具。", kind: "drawer", drawer: "context" },
  { id: "thread", command: "/thread", label: "选择会话", icon: <IconList />, color: "arcoblue", description: "回到之前的 Agent 会话继续，而不是把所有历史混在一起。", kind: "drawer", drawer: "thread" },
  { id: "files", command: "/files", label: "打开文件", icon: <IconFolder />, color: "arcoblue", description: "检索和预览当前小说 Agent 工作区文件。", kind: "drawer", drawer: "file" },
  { id: "history", command: "/history", label: "打开会话记录", icon: <IconHistory />, color: "purple", description: "查看当前会话运行记录、版本节点和最近一轮细节回退。", kind: "drawer", drawer: "history" },
  { id: "model", command: "/model", label: "切换模型", icon: <IconRobot />, color: "green", description: "打开策划 Agent 模型切换入口。", kind: "drawer", drawer: "model" },
  { id: "prewrite", command: "/prewrite", label: "章节写前定位", icon: <IconPen />, color: "green", description: "生成下一章写前定位消息草稿。", kind: "prompt", prompt: "请为下一章生成写前定位：本章只负责什么、承接上一章什么、留给下一章什么、主视角、角色关系压力、调用资料、后台设定、前台场景锚点、角色禁止事项、扮演观察点和改写保留点。" },
  { id: "normal-write", command: "/normal-write", label: "正常行文", icon: <IconFile />, color: "green", description: "让 Agent 自行判断资料是否足够，并通过正常行文工具链保存正文草稿。", kind: "prompt", prompt: "请进入正常行文：先判断当前资料和写前定位是否足够；不足就检索或提出最小追问。资料足够时，请调用 runNormalWritingWorkflow，按“写前定位 -> 正文 Agent 直接慢写草稿 -> 正文审查”的链路生成未采纳正文版本。不要只把正文写在回复里；如决定不保存草稿，需要明确原因。" },
  { id: "roleplay-write", command: "/roleplay-write", label: "扮演行文", icon: <IconThunderbolt />, color: "purple", description: "让 Agent 先组织扮演，再把 transcript 改写为正文草稿。", kind: "prompt", prompt: "请进入扮演行文：先判断当前资料、角色卡、扮演配置和写前定位是否足够；不足就检索、生成写前定位或指出缺口。资料足够时，请调用 runChapterWorkflow，按“写前定位 -> 导演轻约束 -> 角色扮演 -> 扮演审查 -> 正文 Agent 改写”的链路生成未采纳正文版本。不要只把扮演或正文写在回复里；如决定不保存草稿，需要明确原因。" },
  { id: "lorebook-check", command: "/lorebook", label: "检查世界书", icon: <IconBook />, color: "orange", description: "让 Agent 检查关键词、可见性、遮蔽和过宽触发。", kind: "prompt", prompt: "请检查当前世界书：关键词重复、遮蔽、触发过宽、角色可见性、互斥覆盖、过期状态和本轮扮演上下文是否正确触发。需要先检索证据，再给出可执行修复方案。" },
  { id: "diagnostics", command: "/diagnostics", label: "运行小说诊断", icon: <IconBug />, color: "orange", description: "检查角色、世界书、记忆、扮演配置和正文一致性。", kind: "prompt", prompt: "请运行小说资料诊断器，重点检查角色称呼/年龄/身份冲突、世界书关键词冲突、记忆证据和可见性、章节事实与档案不一致、扮演配置引用错误、正文泄漏后台信息，并给出阻断项和修复顺序。" },
  { id: "doctor", command: "/doctor", label: "诊断 Agent 环境", icon: <IconExperiment />, color: "cyan", description: "检查 provider、模型能力、工具权限、工作区、RAG 和最近失败。", kind: "doctor" },
  { id: "compact", command: "/compact", label: "检查上下文压缩", icon: <IconArchive />, color: "purple", description: "查看压缩摘要、已保存原文和缺失风险。", kind: "prompt", prompt: "请检查当前策划上下文压缩状态：摘要覆盖了哪些消息范围，是否遗漏用户偏好、稳定事实、未决问题、工具证据和风险；需要旧内容时请主动定位资料并读取内容，不要要求我手动翻历史。" }
];

const roleLabels = {
  planner: "策划 AI",
  verifier: "审查 AI",
  guide: "导演 AI",
  minor: "次要角色群 AI",
  adapter: "小说改写 AI"
};

const roleColors = {
  planner: "arcoblue",
  verifier: "magenta",
  guide: "green",
  minor: "orange",
  adapter: "purple"
};

const memoryScopes = ["global", "planner", "director", "character", "prose"];
const memoryLayers = ["stable_fact", "tentative_judgment", "character_visible", "author_memory", "run_audit", "roleplay_state"];
const memoryLayerLabels = {
  stable_fact: "稳定事实",
  tentative_judgment: "暂行判断",
  character_visible: "角色可见",
  author_memory: "作者记忆",
  run_audit: "运行审计",
  roleplay_state: "扮演态"
};
const contextPackTaskOptions = [
  { value: "planner", label: "策划 Agent" },
  { value: "director", label: "导演 AI" },
  { value: "character", label: "主要角色 AI" },
  { value: "minor", label: "次要角色群 AI" },
  { value: "adapter", label: "改写 AI" }
];
const memoryCategories = [
  "user_intent",
  "world_rule",
  "character_state",
  "relationship",
  "timeline",
  "open_loop",
  "scene_fact",
  "style_preference",
  "draft_evidence"
];
const memoryStatuses = ["active", "tentative", "outdated", "contradicted", "resolved"];

const SIDEBAR_STORAGE_KEY = "roleplay-novel-studio-sidebar-open";
const backgroundFormatOptions = [
  { label: "PNG", value: "png" },
  { label: "JPG", value: "jpg" },
  { label: "JPEG", value: "jpeg" },
  { label: "GIF", value: "gif" },
  { label: "WEBP", value: "webp" },
  { label: "MP4", value: "mp4" },
  { label: "WEBM", value: "webm" },
  { label: "MOV", value: "mov" }
];

const particlePresetOptions = [
  { key: "snow", label: "雪花", icon: <IconBgColors /> },
  { key: "rain", label: "雨", icon: <IconThunderbolt /> },
  { key: "maple", label: "枫叶", icon: <IconFileImage /> },
  { key: "sakura", label: "樱花", icon: <IconExperiment /> },
  { key: "dandelion", label: "蒲公英", icon: <IconBgColors /> }
];

const particlePresetMeta = {
  snow: { densityScale: 1.45, baseSpeed: 1.9, size: [5, 13], color: ["#ffffff", "#d7f3ff"], drift: 1.2, random: 0.18 },
  rain: { densityScale: 3.4, baseSpeed: 13.5, size: [2.2, 5.2], color: ["#d7f4ff", "#83bde5"], drift: 0.32, random: 0 },
  maple: { densityScale: 0.82, baseSpeed: 2.1, size: [7, 16], color: ["#ba4c2d", "#e6932a"], drift: 1.8, random: 0.22 },
  sakura: { densityScale: 1.16, baseSpeed: 1.9, size: [12, 15], color: ["#ffcfe0", "#fff7fb"], drift: 1.55, random: 0.2 },
  dandelion: { densityScale: 1.35, baseSpeed: 1.35, size: [5, 14], color: ["#fff8d6", "#e8f5ff"], drift: 1.75, random: 0.16 }
};

const sheetParticleVisualProfile = {
  maple: { opacityScale: 0.62, opacityRange: [0.58, 1], tintStrength: 0.30, colorLift: 1, colorSaturation: 1, shadeStrength: 1, alphaBoost: 1.34, surfaceResponse: 1, poseResponse: 1 },
  sakura: { opacityScale: 1.14, opacityRange: [0.86, 1], tintStrength: 0.22, tintColor: "#fbe6ee", colorLift: 1.06, colorSaturation: 0.96, shadeStrength: 0.66, alphaBoost: 1.48, surfaceResponse: 2.85, poseResponse: 2.45 },
  dandelion: { opacityScale: 0.52, opacityRange: [0.58, 1], tintStrength: 0.26, colorLift: 1, colorSaturation: 1, shadeStrength: 1, alphaBoost: 1.34, surfaceResponse: 1, poseResponse: 1 }
};

const sheetParticleMaterialProfile = {
  maple: {
    materialName: "枫叶薄片",
    densityKgM3: 520,
    thicknessMm: [0.09, 0.18],
    physicalLengthMm: [46, 78],
    fillRatioScale: 0.72,
    stiffnessRange: [0.78, 1.32],
    edgeFlexRange: [0.74, 1.18],
    dragCoefficient: 1.12
  },
  sakura: {
    materialName: "樱花单片花瓣",
    densityKgM3: 840,
    thicknessMm: [0.045, 0.095],
    physicalLengthMm: [16, 24],
    fillRatioScale: 0.64,
    stiffnessRange: [0.46, 0.82],
    edgeFlexRange: [1.16, 1.76],
    dragCoefficient: 1.34
  },
  dandelion: {
    materialName: "蒲公英冠毛种子",
    densityKgM3: 180,
    thicknessMm: [0.018, 0.045],
    physicalLengthMm: [7, 13],
    fillRatioScale: 0.26,
    stiffnessRange: [0.34, 0.74],
    edgeFlexRange: [1.35, 2.10],
    dragCoefficient: 1.85
  }
};

const particleSpriteMap = {
  snow: { name: "snowflake", src: "/particle-sprites/snowflake.svg", width: 64, height: 64 },
  rain: { name: "rain-streak", src: "/particle-sprites/rain-drop.svg", width: 16, height: 64 },
  maple: { name: "maple-leaf", src: "/particle-sprites/maple-leaf.svg", width: 64, height: 64 },
  sakura: { name: "sakura-petal", src: "/particle-sprites/cherry-blossom.svg", width: 48, height: 72 },
  dandelion: { name: "dandelion-seed", src: "/particle-sprites/dandelion-seed.svg", width: 54, height: 72 }
};

const particleSpriteAssetVersion = "sheet-clean-edge-20260526-0008";

function particleSpriteVersionedSrc(src) {
  const source = String(src || "");
  if (!source) return source;
  return `${source}${source.includes("?") ? "&" : "?"}v=${particleSpriteAssetVersion}`;
}

const particleSpritePoseMap = {
  maple: [
    particleSpriteMap.maple,
    { name: "maple-leaf-wind-left", src: "/particle-sprites/maple-leaf-wind-left.svg", width: 64, height: 64 },
    { name: "maple-leaf-wind-right", src: "/particle-sprites/maple-leaf-wind-right.svg", width: 64, height: 64 },
    { name: "maple-leaf-fold", src: "/particle-sprites/maple-leaf-fold.svg", width: 64, height: 64 }
  ],
  sakura: [
    particleSpriteMap.sakura,
    { name: "sakura-petal-wind-left", src: "/particle-sprites/cherry-blossom-wind-left.svg", width: 48, height: 72 },
    { name: "sakura-petal-wind-right", src: "/particle-sprites/cherry-blossom-wind-right.svg", width: 48, height: 72 },
    { name: "sakura-petal-fold", src: "/particle-sprites/cherry-blossom-fold.svg", width: 48, height: 72 }
  ],
  dandelion: [
    particleSpriteMap.dandelion,
    { name: "dandelion-seed-wind-left", src: "/particle-sprites/dandelion-seed-wind-left.svg", width: 54, height: 72 },
    { name: "dandelion-seed-wind-right", src: "/particle-sprites/dandelion-seed-wind-right.svg", width: 54, height: 72 },
    { name: "dandelion-seed-fold", src: "/particle-sprites/dandelion-seed-fold.svg", width: 54, height: 72 }
  ]
};

const particleWindFlipPresets = new Set(["maple", "sakura", "dandelion"]);

const particleTsDirectionMap = {
  down: "bottom",
  up: "top",
  right: "right",
  left: "left",
  diagonal: "bottom-right"
};

const particleSpawnPositionEntryDirectionMap = {
  top: "down",
  bottom: "up",
  left: "right",
  right: "left",
  topLeft: "diagonal"
};

const particleLegacyDirectionToSpawnPositionMap = {
  down: "top",
  up: "bottom",
  right: "left",
  left: "right",
  diagonal: "topLeft"
};

const roleplayFlowPathGeneratorName = "roleplay-flow-field";
const roleplaySpawnPositionPluginName = "roleplay-spawn-position";
const particleFieldNodeLimit = 4;
// 粒子周期用“秒/次”给用户调节；内部仍换算成 Hz 供运动系统计算。
const particlePeriodControlMin = 0.01;
const particlePeriodControlMax = 120;
const particleFrequencyControlMin = 1 / particlePeriodControlMax;
const particleFrequencyControlMax = 1 / particlePeriodControlMin;
const particleLogSliderMax = 1000;
const particleSizeControlMin = 4;
const particleSizeControlMax = 96;
// 标准大气密度，用来把“风速 / 迎风面积 / 重量”统一成风载比。
const sheetParticleAirDensityKgM3 = 1.225;
const roleplayWindFieldStates = new WeakMap();

const particleFlowPreviewVectors = [
  { x: 10, y: 16, scale: 0.82, bend: -2, opacity: 0.44, delay: 0 },
  { x: 28, y: 20, scale: 1.08, bend: 3, opacity: 0.66, delay: -0.9 },
  { x: 52, y: 18, scale: 0.94, bend: -1, opacity: 0.52, delay: -1.5 },
  { x: 74, y: 24, scale: 1.20, bend: 2, opacity: 0.70, delay: -0.3 },
  { x: 18, y: 42, scale: 1.18, bend: 1, opacity: 0.70, delay: -1.1 },
  { x: 44, y: 48, scale: 1.36, bend: -3, opacity: 0.84, delay: -0.5 },
  { x: 70, y: 50, scale: 1.08, bend: 3, opacity: 0.62, delay: -1.8 },
  { x: 12, y: 70, scale: 0.92, bend: 2, opacity: 0.50, delay: -0.6 },
  { x: 38, y: 78, scale: 1.24, bend: -2, opacity: 0.72, delay: -1.3 },
  { x: 66, y: 76, scale: 1.02, bend: 2, opacity: 0.58, delay: -0.2 }
];

const particleFlowPreviewBands = [
  { top: 22, opacity: 0.18, delay: -0.4 },
  { top: 50, opacity: 0.24, delay: -1.2 },
  { top: 76, opacity: 0.16, delay: -0.8 }
];

const particleDirectionOptions = [
  { key: "down", label: "向下", icon: <IconArrowDown /> },
  { key: "up", label: "向上", icon: <IconArrowUp /> },
  { key: "right", label: "向右", icon: <IconArrowRight /> },
  { key: "left", label: "向左", icon: <IconArrowLeft /> },
  { key: "diagonal", label: "右下", icon: <IconSwap /> }
];

const particleSpawnPositionOptions = [
  { key: "top", label: "上方", icon: <IconArrowDown /> },
  { key: "bottom", label: "下方", icon: <IconArrowUp /> },
  { key: "left", label: "左侧", icon: <IconArrowRight /> },
  { key: "right", label: "右侧", icon: <IconArrowLeft /> },
  { key: "topLeft", label: "左上", icon: <IconSwap /> }
];

const particleSpawnEdgeOptions = [
  { key: "top", label: "上边", axisLabel: "横向范围", icon: <IconArrowDown /> },
  { key: "right", label: "右边", axisLabel: "纵向范围", icon: <IconArrowLeft /> },
  { key: "bottom", label: "下边", axisLabel: "横向范围", icon: <IconArrowUp /> },
  { key: "left", label: "左边", axisLabel: "纵向范围", icon: <IconArrowRight /> }
];

const defaultParticleSpawnEdges = {
  top: { enabled: true, range: [0, 100] },
  right: { enabled: false, range: [0, 100] },
  bottom: { enabled: false, range: [0, 100] },
  left: { enabled: false, range: [0, 100] }
};

const particleWindDirectionOptions = [
  { key: "down", label: "向下吹", icon: <IconArrowDown /> },
  { key: "up", label: "向上吹", icon: <IconArrowUp /> },
  { key: "right", label: "向右吹", icon: <IconArrowRight /> },
  { key: "left", label: "向左吹", icon: <IconArrowLeft /> },
  { key: "diagonal", label: "右下风", icon: <IconSwap /> }
];

const particleLayerLabels = {
  back: "后景粒子",
  front: "前景粒子"
};

const defaultParticleLayers = {
  back: {
    enabled: true,
    preset: "snow",
    density: 42,
    wind: 6,
    windAdjustMin: 0,
    windAdjustMax: 12,
    direction: "down",
    spawnPosition: "top",
    spawnEdges: defaultParticleSpawnEdges,
    movementDirection: "down",
    windDirection: "right",
    flowStrength: 46,
    flowStrengthMin: 32,
    flowStrengthMax: 62,
    flowFrequencyMin: 0.08,
    flowFrequencyMax: 0.28,
    spreadStrength: 0,
    gustStrength: 18,
    shearStrength: 6,
    fieldNodes: [
      { id: "main", name: "风场 1", x: 46, y: 42, radius: 68, strength: 0 }
    ],
    turbulence: 18,
    turbulenceMin: 6,
    turbulenceMax: 24,
    turbulenceFrequencyMin: 0.08,
    turbulenceFrequencyMax: 0.32,
    turbulenceTimeMin: 1.2,
    turbulenceTimeMax: 4.8,
    speed: 70,
    weightScale: 100,
    size: 18,
    sizeUnit: "px",
    opacity: 72
  },
  front: {
    enabled: false,
    preset: "sakura",
    density: 18,
    wind: -6,
    windAdjustMin: -14,
    windAdjustMax: 2,
    direction: "down",
    spawnPosition: "top",
    spawnEdges: defaultParticleSpawnEdges,
    movementDirection: "down",
    windDirection: "right",
    flowStrength: 42,
    flowStrengthMin: 26,
    flowStrengthMax: 58,
    flowFrequencyMin: 0.06,
    flowFrequencyMax: 0.24,
    spreadStrength: -12,
    gustStrength: 24,
    shearStrength: -10,
    fieldNodes: [
      { id: "main", name: "风场 1", x: 62, y: 36, radius: 56, strength: -12 }
    ],
    turbulence: 28,
    turbulenceMin: 10,
    turbulenceMax: 42,
    turbulenceFrequencyMin: 0.12,
    turbulenceFrequencyMax: 0.5,
    turbulenceTimeMin: 0.9,
    turbulenceTimeMax: 3.6,
    speed: 64,
    weightScale: 100,
    size: 32,
    sizeUnit: "px",
    opacity: 46
  }
};

const defaultBackgroundSettings = {
  mode: "base",
  backgroundScope: "viewport",
  urlsText: "",
  assetUrl: "",
  assetType: "",
  assetName: "",
  playlist: [],
  slideshowSource: "project",
  slideshowOrder: "sequence",
  boundFolderPath: "",
  boundFolders: [],
  folderPreviewToken: "",
  overlay: 68,
  blur: 0,
  interval: 12,
  localUrl: "",
  localType: "",
  localPlaylist: [],
  surfaceMaterial: "mica",
  surfaceProfiles: {
    solid: { opacity: 96, blur: 0, tint: 0, saturation: 100 },
    mica: { opacity: 72, blur: 14, tint: 18, saturation: 118 },
    frosted: { opacity: 46, blur: 30, tint: 8, saturation: 150 },
    acrylic: { opacity: 34, blur: 36, tint: 26, saturation: 172 }
  },
  surfaceOpacity: 86,
  surfaceBlur: 18,
  surfaceTint: 12,
  includeSubfolders: true,
  slideshowFormats: ["png", "jpg", "jpeg", "gif", "webp", "mp4", "webm"],
  particleLayers: defaultParticleLayers,
  particleEnabled: defaultParticleLayers.back.enabled,
  particlePreset: defaultParticleLayers.back.preset,
  particleDensity: defaultParticleLayers.back.density,
  particleWind: defaultParticleLayers.back.wind,
  particleWindAdjustMin: defaultParticleLayers.back.windAdjustMin,
  particleWindAdjustMax: defaultParticleLayers.back.windAdjustMax,
  particleWindDirection: defaultParticleLayers.back.windDirection,
  particleFlowStrength: defaultParticleLayers.back.flowStrength,
  particleFlowStrengthMin: defaultParticleLayers.back.flowStrengthMin,
  particleFlowStrengthMax: defaultParticleLayers.back.flowStrengthMax,
  particleFlowFrequencyMin: defaultParticleLayers.back.flowFrequencyMin,
  particleFlowFrequencyMax: defaultParticleLayers.back.flowFrequencyMax,
  particleSpreadStrength: defaultParticleLayers.back.spreadStrength,
  particleGustStrength: defaultParticleLayers.back.gustStrength,
  particleShearStrength: defaultParticleLayers.back.shearStrength,
  particleFieldCenterX: defaultParticleLayers.back.fieldNodes[0].x,
  particleFieldCenterY: defaultParticleLayers.back.fieldNodes[0].y,
  particleFieldRadius: defaultParticleLayers.back.fieldNodes[0].radius,
  particleTurbulence: defaultParticleLayers.back.turbulence,
  particleTurbulenceMin: defaultParticleLayers.back.turbulenceMin,
  particleTurbulenceMax: defaultParticleLayers.back.turbulenceMax,
  particleTurbulenceFrequencyMin: defaultParticleLayers.back.turbulenceFrequencyMin,
  particleTurbulenceFrequencyMax: defaultParticleLayers.back.turbulenceFrequencyMax,
  particleTurbulenceTimeMin: defaultParticleLayers.back.turbulenceTimeMin,
  particleTurbulenceTimeMax: defaultParticleLayers.back.turbulenceTimeMax,
  particleSpeed: defaultParticleLayers.back.speed,
  particleSize: defaultParticleLayers.back.size,
  particleOpacity: defaultParticleLayers.back.opacity
};

function readLocalStorage(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key, value) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    // 本地存储不可用不影响核心写作流程；服务端状态仍会正常保存。
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function clampDecimal(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeParticleFieldNode(value, fallback, index, fallbackStrength) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const fallbackId = index === 0 ? "main" : `field-${index + 1}`;
  return {
    id: String(source.id || base.id || fallbackId),
    name: String(source.name || base.name || `风场 ${index + 1}`),
    x: clampNumber(source.x ?? source.fieldCenterX, 0, 100, base.x ?? 50),
    y: clampNumber(source.y ?? source.fieldCenterY, 0, 100, base.y ?? 50),
    radius: clampNumber(source.radius ?? source.fieldRadius, 8, 100, base.radius ?? 58),
    strength: clampNumber(source.strength, -100, 100, fallbackStrength ?? base.strength ?? 0)
  };
}

function normalizeParticleFieldNodes(value, fallback, legacyNode) {
  const source = Array.isArray(value) ? value : [];
  const fallbackNodes = Array.isArray(fallback) && fallback.length > 0 ? fallback : [legacyNode];
  const nodes = (source.length > 0 ? source : fallbackNodes)
    .slice(0, particleFieldNodeLimit)
    .map((item, index) => normalizeParticleFieldNode(item, fallbackNodes[index] || legacyNode, index, legacyNode.strength));
  return nodes.length > 0 ? nodes : [normalizeParticleFieldNode(legacyNode, legacyNode, 0, legacyNode.strength)];
}

function strongestParticleFieldStrength(nodes, fallback = 0) {
  if (!Array.isArray(nodes) || nodes.length === 0) return fallback;
  return nodes.reduce((strongest, node) => {
    const strength = clampNumber(node?.strength, -100, 100, 0);
    return Math.abs(strength) > Math.abs(strongest) ? strength : strongest;
  }, fallback);
}

function normalizeSurfaceProfiles(value, legacy = {}) {
  const defaults = defaultBackgroundSettings.surfaceProfiles;
  const source = value && typeof value === "object" ? value : {};
  const next = {};
  for (const key of Object.keys(defaults)) {
    const profile = source[key] && typeof source[key] === "object" ? source[key] : {};
    next[key] = {
      opacity: clampNumber(profile.opacity, 0, 100, defaults[key].opacity),
      blur: clampNumber(profile.blur, 0, 48, defaults[key].blur),
      tint: clampNumber(profile.tint, 0, 48, defaults[key].tint),
      saturation: clampNumber(profile.saturation, 80, 220, defaults[key].saturation)
    };
  }
  if (Object.keys(source).length === 0) {
    next.mica = {
      ...next.mica,
      opacity: clampNumber(legacy.opacity, 0, 100, next.mica.opacity),
      blur: clampNumber(legacy.blur, 0, 48, next.mica.blur),
      tint: clampNumber(legacy.tint, 0, 48, next.mica.tint)
    };
  }
  return next;
}

function normalizeParticleLayer(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const preset = particlePresetOptions.some((item) => item.key === source.preset) ? source.preset : fallback.preset;
  const fallbackDirection = isParticleMovementDirection(fallback.movementDirection)
    ? fallback.movementDirection
    : (isParticleMovementDirection(fallback.direction) ? fallback.direction : "down");
  const legacyDirection = isParticleMovementDirection(source.direction) ? source.direction : fallbackDirection;
  const movementDirection = isParticleMovementDirection(source.movementDirection) ? source.movementDirection : legacyDirection;
  const direction = movementDirection;
  const fallbackSpawnPosition = isParticleSpawnPosition(fallback.spawnPosition)
    ? fallback.spawnPosition
    : particleSpawnPositionFromDirection(fallbackDirection);
  const spawnPosition = isParticleSpawnPosition(source.spawnPosition)
    ? source.spawnPosition
    : (source.direction !== undefined ? particleSpawnPositionFromDirection(legacyDirection) : fallbackSpawnPosition);
  const fallbackSpawnEdges = normalizeParticleSpawnEdges(
    fallback.spawnEdges,
    particleSpawnEdgesFromPosition(fallbackSpawnPosition),
    fallbackSpawnPosition
  );
  const spawnEdges = normalizeParticleSpawnEdges(
    source.spawnEdges,
    source.spawnEdges === undefined ? particleSpawnEdgesFromPosition(spawnPosition) : fallbackSpawnEdges,
    spawnPosition
  );
  const primarySpawnPosition = particleSpawnEdgesPrimaryPosition(spawnEdges, spawnPosition);
  const fallbackWindDirection = fallback.windDirection || "right";
  const windDirection = particleWindDirectionOptions.some((item) => item.key === source.windDirection) ? source.windDirection : fallbackWindDirection;
  const hasLegacyWind = source.wind !== undefined;
  const hasWindAdjust = source.windAdjustMin !== undefined || source.windAdjustMax !== undefined;
  const fallbackWindCenter = clampNumber(fallback.wind, -45, 45, 0);
  const legacyWindCenter = clampNumber(source.wind, -45, 45, fallbackWindCenter);
  const fallbackWindAdjustMin = clampNumber(fallback.windAdjustMin, -45, 45, Math.max(-45, fallbackWindCenter - 8));
  const fallbackWindAdjustMax = clampNumber(fallback.windAdjustMax, -45, 45, Math.min(45, fallbackWindCenter + 8));
  const legacyWindAdjustMin = Math.max(-45, legacyWindCenter - 8);
  const legacyWindAdjustMax = Math.min(45, legacyWindCenter + 8);
  const rawWindAdjustMin = clampNumber(source.windAdjustMin, -45, 45, hasWindAdjust || !hasLegacyWind ? fallbackWindAdjustMin : legacyWindAdjustMin);
  const rawWindAdjustMax = clampNumber(source.windAdjustMax, -45, 45, hasWindAdjust || !hasLegacyWind ? fallbackWindAdjustMax : legacyWindAdjustMax);
  const windAdjustMin = Math.min(rawWindAdjustMin, rawWindAdjustMax);
  const windAdjustMax = Math.max(rawWindAdjustMin, rawWindAdjustMax);
  const legacyFlowStrength = clampNumber(source.flowStrength, 0, 100, fallback.flowStrength);
  const hasLegacyFlowOnly = source.flowStrength !== undefined && source.flowStrengthMin === undefined && source.flowStrengthMax === undefined;
  const fallbackFlowMin = hasLegacyFlowOnly ? Math.max(0, legacyFlowStrength - 14) : (fallback.flowStrengthMin ?? Math.max(0, legacyFlowStrength - 14));
  const fallbackFlowMax = hasLegacyFlowOnly ? Math.min(100, legacyFlowStrength + 14) : (fallback.flowStrengthMax ?? Math.min(100, legacyFlowStrength + 14));
  const rawFlowStrengthMin = clampNumber(source.flowStrengthMin, 0, 100, fallbackFlowMin);
  const rawFlowStrengthMax = clampNumber(source.flowStrengthMax, 0, 100, Math.max(rawFlowStrengthMin, fallbackFlowMax));
  const flowStrengthMin = Math.min(rawFlowStrengthMin, rawFlowStrengthMax);
  const flowStrengthMax = Math.max(rawFlowStrengthMin, rawFlowStrengthMax);
  const flowStrength = Math.round((flowStrengthMin + flowStrengthMax) / 2);
  const rawFlowFrequencyMin = clampDecimal(source.flowFrequencyMin, particleFrequencyControlMin, particleFrequencyControlMax, fallback.flowFrequencyMin ?? 0.08);
  const rawFlowFrequencyMax = clampDecimal(source.flowFrequencyMax, particleFrequencyControlMin, particleFrequencyControlMax, fallback.flowFrequencyMax ?? 0.28);
  const flowFrequencyMin = Math.min(rawFlowFrequencyMin, rawFlowFrequencyMax);
  const flowFrequencyMax = Math.max(rawFlowFrequencyMin, rawFlowFrequencyMax);
  const fallbackTurbulence = clampNumber(fallback.turbulence, 0, 100, 0);
  const turbulence = clampNumber(source.turbulence, 0, 100, fallbackTurbulence);
  const hasLegacyTurbulenceOnly = source.turbulence !== undefined && source.turbulenceMin === undefined && source.turbulenceMax === undefined;
  const fallbackTurbulenceMin = hasLegacyTurbulenceOnly ? Math.max(0, turbulence * 0.45) : (fallback.turbulenceMin ?? turbulence * 0.45);
  const fallbackTurbulenceMax = hasLegacyTurbulenceOnly ? turbulence : (fallback.turbulenceMax ?? turbulence);
  const rawTurbulenceMin = clampNumber(source.turbulenceMin, 0, 100, Math.max(0, fallbackTurbulenceMin));
  const rawTurbulenceMax = clampNumber(source.turbulenceMax, 0, 100, Math.max(rawTurbulenceMin, fallbackTurbulenceMax));
  const turbulenceMin = Math.min(rawTurbulenceMin, rawTurbulenceMax);
  const turbulenceMax = Math.max(rawTurbulenceMin, rawTurbulenceMax);
  const rawTurbulenceFrequencyMin = clampDecimal(source.turbulenceFrequencyMin, particleFrequencyControlMin, particleFrequencyControlMax, fallback.turbulenceFrequencyMin ?? 0.08);
  const rawTurbulenceFrequencyMax = clampDecimal(source.turbulenceFrequencyMax, particleFrequencyControlMin, particleFrequencyControlMax, fallback.turbulenceFrequencyMax ?? 0.32);
  const turbulenceFrequencyMin = Math.min(rawTurbulenceFrequencyMin, rawTurbulenceFrequencyMax);
  const turbulenceFrequencyMax = Math.max(rawTurbulenceFrequencyMin, rawTurbulenceFrequencyMax);
  const rawTurbulenceTimeMin = clampDecimal(source.turbulenceTimeMin, 0.2, 12, fallback.turbulenceTimeMin ?? 1.2);
  const rawTurbulenceTimeMax = clampDecimal(source.turbulenceTimeMax, 0.2, 12, fallback.turbulenceTimeMax ?? 4.8);
  const turbulenceTimeMin = Math.min(rawTurbulenceTimeMin, rawTurbulenceTimeMax);
  const turbulenceTimeMax = Math.max(rawTurbulenceTimeMin, rawTurbulenceTimeMax);
  const legacySpread = source.fieldMode === "scatter"
    ? Math.abs(clampNumber(source.turbulence, 0, 100, fallback.turbulence))
    : source.fieldMode === "gather"
      ? -Math.abs(clampNumber(source.turbulence, 0, 100, fallback.turbulence))
      : fallback.spreadStrength;
  const sourceSpread = clampNumber(source.spreadStrength, -100, 100, legacySpread);
  const legacyNode = {
    id: "main",
    name: "风场 1",
    x: clampNumber(source.fieldCenterX, 0, 100, fallback.fieldNodes?.[0]?.x ?? 50),
    y: clampNumber(source.fieldCenterY, 0, 100, fallback.fieldNodes?.[0]?.y ?? 50),
    radius: clampNumber(source.fieldRadius, 8, 100, fallback.fieldNodes?.[0]?.radius ?? 58),
    strength: sourceSpread
  };
  const fieldNodes = normalizeParticleFieldNodes(
    Array.isArray(source.fieldNodes) && source.fieldNodes.length > 0 ? source.fieldNodes : [legacyNode],
    fallback.fieldNodes,
    legacyNode
  );
  const spreadStrength = source.spreadStrength === undefined
    ? strongestParticleFieldStrength(fieldNodes, legacySpread)
    : sourceSpread;
  const legacyGustStrength = Math.min(100, Math.abs(spreadStrength));
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
    preset,
    density: clampNumber(source.density, 0, 100, fallback.density),
    wind: Math.round((windAdjustMin + windAdjustMax) / 2),
    windAdjustMin,
    windAdjustMax,
    direction,
    spawnPosition: primarySpawnPosition,
    spawnEdges,
    movementDirection,
    windDirection,
    flowStrength,
    flowStrengthMin,
    flowStrengthMax,
    flowFrequencyMin,
    flowFrequencyMax,
    spreadStrength,
    gustStrength: clampNumber(source.gustStrength, 0, 100, fallback.gustStrength ?? legacyGustStrength),
    shearStrength: clampNumber(source.shearStrength, -100, 100, fallback.shearStrength ?? 0),
    fieldCenterX: fieldNodes[0].x,
    fieldCenterY: fieldNodes[0].y,
    fieldRadius: fieldNodes[0].radius,
    fieldNodes,
    turbulence,
    turbulenceMin,
    turbulenceMax,
    turbulenceFrequencyMin,
    turbulenceFrequencyMax,
    turbulenceTimeMin,
    turbulenceTimeMax,
    speed: clampNumber(source.speed, 10, 180, fallback.speed),
    weightScale: clampNumber(source.weightScale, 25, 260, fallback.weightScale ?? 100),
    size: normalizeParticleSizeValue(source.size, fallback.size, preset, source.sizeUnit),
    sizeUnit: "px",
    opacity: clampNumber(source.opacity, 0, 100, fallback.opacity)
  };
}

function normalizeParticleLayers(value, legacy = {}) {
  const source = value && typeof value === "object" ? value : {};
  const legacyPreset = particlePresetOptions.some((item) => item.key === legacy.preset) ? legacy.preset : defaultParticleLayers.back.preset;
  const legacyBack = {
    enabled: typeof legacy.enabled === "boolean" ? legacy.enabled : defaultParticleLayers.back.enabled,
    preset: legacyPreset,
    density: clampNumber(legacy.density, 0, 100, defaultParticleLayers.back.density),
    wind: clampNumber(legacy.wind, -100, 100, defaultParticleLayers.back.wind),
    windAdjustMin: legacy.windAdjustMin === undefined
      ? Math.max(-45, clampNumber(legacy.wind, -45, 45, defaultParticleLayers.back.wind) - 8)
      : clampNumber(legacy.windAdjustMin, -45, 45, defaultParticleLayers.back.windAdjustMin),
    windAdjustMax: legacy.windAdjustMax === undefined
      ? Math.min(45, clampNumber(legacy.wind, -45, 45, defaultParticleLayers.back.wind) + 8)
      : clampNumber(legacy.windAdjustMax, -45, 45, defaultParticleLayers.back.windAdjustMax),
    direction: defaultParticleLayers.back.direction,
    spawnPosition: defaultParticleLayers.back.spawnPosition,
    spawnEdges: defaultParticleLayers.back.spawnEdges,
    movementDirection: defaultParticleLayers.back.movementDirection,
    windDirection: particleWindDirectionOptions.some((item) => item.key === legacy.windDirection) ? legacy.windDirection : defaultParticleLayers.back.windDirection,
    flowStrength: clampNumber(legacy.flowStrength, 0, 100, defaultParticleLayers.back.flowStrength),
    flowStrengthMin: clampNumber(legacy.flowStrengthMin, 0, 100, defaultParticleLayers.back.flowStrengthMin),
    flowStrengthMax: clampNumber(legacy.flowStrengthMax, 0, 100, defaultParticleLayers.back.flowStrengthMax),
    flowFrequencyMin: clampDecimal(legacy.flowFrequencyMin, particleFrequencyControlMin, particleFrequencyControlMax, defaultParticleLayers.back.flowFrequencyMin),
    flowFrequencyMax: clampDecimal(legacy.flowFrequencyMax, particleFrequencyControlMin, particleFrequencyControlMax, defaultParticleLayers.back.flowFrequencyMax),
    spreadStrength: clampNumber(legacy.spreadStrength, -100, 100, defaultParticleLayers.back.spreadStrength),
    gustStrength: clampNumber(legacy.gustStrength, 0, 100, defaultParticleLayers.back.gustStrength),
    shearStrength: clampNumber(legacy.shearStrength, -100, 100, defaultParticleLayers.back.shearStrength),
    fieldNodes: [{
      id: "main",
      name: "风场 1",
      x: clampNumber(legacy.fieldCenterX, 0, 100, defaultParticleLayers.back.fieldNodes[0].x),
      y: clampNumber(legacy.fieldCenterY, 0, 100, defaultParticleLayers.back.fieldNodes[0].y),
      radius: clampNumber(legacy.fieldRadius, 8, 100, defaultParticleLayers.back.fieldNodes[0].radius),
      strength: clampNumber(legacy.spreadStrength, -100, 100, defaultParticleLayers.back.spreadStrength)
    }],
    turbulence: clampNumber(legacy.turbulence, 0, 100, defaultParticleLayers.back.turbulence),
    turbulenceMin: clampNumber(legacy.turbulenceMin, 0, 100, defaultParticleLayers.back.turbulenceMin),
    turbulenceMax: clampNumber(legacy.turbulenceMax, 0, 100, defaultParticleLayers.back.turbulenceMax),
    turbulenceFrequencyMin: clampDecimal(legacy.turbulenceFrequencyMin, particleFrequencyControlMin, particleFrequencyControlMax, defaultParticleLayers.back.turbulenceFrequencyMin),
    turbulenceFrequencyMax: clampDecimal(legacy.turbulenceFrequencyMax, particleFrequencyControlMin, particleFrequencyControlMax, defaultParticleLayers.back.turbulenceFrequencyMax),
    turbulenceTimeMin: clampDecimal(legacy.turbulenceTimeMin, 0.2, 12, defaultParticleLayers.back.turbulenceTimeMin),
    turbulenceTimeMax: clampDecimal(legacy.turbulenceTimeMax, 0.2, 12, defaultParticleLayers.back.turbulenceTimeMax),
    speed: clampNumber(legacy.speed, 10, 180, defaultParticleLayers.back.speed),
    weightScale: clampNumber(legacy.weightScale, 25, 260, defaultParticleLayers.back.weightScale),
    size: normalizeParticleSizeValue(legacy.size, defaultParticleLayers.back.size, legacyPreset, legacy.sizeUnit),
    sizeUnit: "px",
    opacity: clampNumber(legacy.opacity, 0, 100, defaultParticleLayers.back.opacity)
  };
  return {
    back: normalizeParticleLayer(source.back, legacyBack),
    front: normalizeParticleLayer(source.front, defaultParticleLayers.front)
  };
}

function normalizeBackgroundFolders(value, legacyPath) {
  const source = Array.isArray(value) ? value : [];
  const folders = source
    .map((item) => ({
      path: String(item?.path || item || "").trim(),
      name: String(item?.name || item?.path || item || "本地文件夹").split(/[\\/]/).filter(Boolean).pop() || "本地文件夹",
      count: Number(item?.count || 0),
      previewUrl: stripBackgroundPreviewToken(item?.previewUrl),
      updatedAt: String(item?.updatedAt || "")
    }))
    .filter((item) => item.path)
    .slice(0, 24);
  const legacy = String(legacyPath || "").trim();
  if (legacy && !folders.some((item) => item.path === legacy)) {
    folders.push({
      path: legacy,
      name: legacy.split(/[\\/]/).filter(Boolean).pop() || "本地文件夹",
      count: 0,
      previewUrl: "",
      updatedAt: ""
    });
  }
  return folders;
}

function stripBackgroundPreviewToken(value) {
  const text = String(value || "");
  if (!text) return "";
  return text
    .replace(/([?&])token=[^&]+&?/g, "$1")
    .replace(/[?&]$/, "");
}

function normalizeBackgroundSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const mode = ["base", "media", "slideshow"].includes(source.mode)
    ? source.mode
    : (source.mode === "texture" || source.mode === "particle" ? "base" : (source.mode === "image" || source.mode === "video" ? "media" : "base"));
  const backgroundScope = ["viewport", "page"].includes(source.backgroundScope) ? source.backgroundScope : "viewport";
  const surfaceMaterial = ["solid", "mica", "frosted", "acrylic"].includes(source.surfaceMaterial) ? source.surfaceMaterial : "mica";
  const slideshowSource = ["project", "folder", "uploaded"].includes(source.slideshowSource) ? source.slideshowSource : "project";
  const slideshowOrder = ["sequence", "random"].includes(source.slideshowOrder) ? source.slideshowOrder : "sequence";
  const surfaceProfiles = normalizeSurfaceProfiles(source.surfaceProfiles, {
    opacity: source.surfaceOpacity,
    blur: source.surfaceBlur,
    tint: source.surfaceTint
  });
  const particleLayers = normalizeParticleLayers(source.particleLayers, {
    enabled: typeof source.particleEnabled === "boolean" ? source.particleEnabled : source.mode === "particle",
    preset: source.particlePreset,
    density: source.particleDensity,
    wind: source.particleWind,
    windAdjustMin: source.particleWindAdjustMin,
    windAdjustMax: source.particleWindAdjustMax,
    windDirection: source.particleWindDirection,
    flowStrength: source.particleFlowStrength,
    flowStrengthMin: source.particleFlowStrengthMin,
    flowStrengthMax: source.particleFlowStrengthMax,
    flowFrequencyMin: source.particleFlowFrequencyMin,
    flowFrequencyMax: source.particleFlowFrequencyMax,
    spreadStrength: source.particleSpreadStrength,
    gustStrength: source.particleGustStrength,
    shearStrength: source.particleShearStrength,
    fieldCenterX: source.particleFieldCenterX,
    fieldCenterY: source.particleFieldCenterY,
    fieldRadius: source.particleFieldRadius,
    turbulence: source.particleTurbulence,
    turbulenceMin: source.particleTurbulenceMin,
    turbulenceMax: source.particleTurbulenceMax,
    turbulenceFrequencyMin: source.particleTurbulenceFrequencyMin,
    turbulenceFrequencyMax: source.particleTurbulenceFrequencyMax,
    turbulenceTimeMin: source.particleTurbulenceTimeMin,
    turbulenceTimeMax: source.particleTurbulenceTimeMax,
    speed: source.particleSpeed,
    size: source.particleSize,
    sizeUnit: source.particleSizeUnit,
    opacity: source.particleOpacity
  });
  const activeProfile = surfaceProfiles[surfaceMaterial] || defaultBackgroundSettings.surfaceProfiles[surfaceMaterial];
  const allowedFormats = new Set(backgroundFormatOptions.map((item) => item.value));
  const slideshowFormats = Array.isArray(source.slideshowFormats)
    ? uniqueStrings(source.slideshowFormats.map((item) => String(item || "").replace(/^\./, "").toLowerCase())).filter((item) => allowedFormats.has(item))
    : defaultBackgroundSettings.slideshowFormats;
  return {
    ...defaultBackgroundSettings,
    ...source,
    mode,
    backgroundScope,
    urlsText: String(source.urlsText || ""),
    assetUrl: String(source.assetUrl || source.localUrl || ""),
    assetType: String(source.assetType || source.localType || ""),
    assetName: String(source.assetName || ""),
    playlist: normalizeBackgroundPlaylist(source.playlist),
    slideshowSource,
    slideshowOrder,
    boundFolderPath: String(source.boundFolderPath || ""),
    boundFolders: normalizeBackgroundFolders(source.boundFolders, source.boundFolderPath),
    folderPreviewToken: String(source.folderPreviewToken || ""),
    overlay: clampNumber(source.overlay ?? defaultBackgroundSettings.overlay, 18, 92, defaultBackgroundSettings.overlay),
    blur: clampNumber(source.blur ?? 0, 0, 12, 0),
    interval: clampNumber(source.interval ?? defaultBackgroundSettings.interval, 4, 60, defaultBackgroundSettings.interval),
    localUrl: String(source.localUrl || ""),
    localType: String(source.localType || ""),
    localPlaylist: Array.isArray(source.localPlaylist) ? source.localPlaylist.filter((item) => item?.url).slice(0, 160) : [],
    surfaceMaterial,
    surfaceProfiles,
    surfaceOpacity: activeProfile.opacity,
    surfaceBlur: activeProfile.blur,
    surfaceTint: activeProfile.tint,
    includeSubfolders: source.includeSubfolders !== false,
    slideshowFormats: slideshowFormats.length > 0 ? slideshowFormats : defaultBackgroundSettings.slideshowFormats,
    particleLayers,
    particleEnabled: particleLayers.back.enabled,
    particlePreset: particleLayers.back.preset,
    particleDensity: particleLayers.back.density,
    particleWind: particleLayers.back.wind,
    particleWindAdjustMin: particleLayers.back.windAdjustMin,
    particleWindAdjustMax: particleLayers.back.windAdjustMax,
    particleWindDirection: particleLayers.back.windDirection,
    particleFlowStrength: particleLayers.back.flowStrength,
    particleFlowStrengthMin: particleLayers.back.flowStrengthMin,
    particleFlowStrengthMax: particleLayers.back.flowStrengthMax,
    particleFlowFrequencyMin: particleLayers.back.flowFrequencyMin,
    particleFlowFrequencyMax: particleLayers.back.flowFrequencyMax,
    particleSpreadStrength: particleLayers.back.spreadStrength,
    particleGustStrength: particleLayers.back.gustStrength,
    particleShearStrength: particleLayers.back.shearStrength,
    particleFieldCenterX: particleLayers.back.fieldCenterX,
    particleFieldCenterY: particleLayers.back.fieldCenterY,
    particleFieldRadius: particleLayers.back.fieldRadius,
    particleTurbulence: particleLayers.back.turbulence,
    particleTurbulenceMin: particleLayers.back.turbulenceMin,
    particleTurbulenceMax: particleLayers.back.turbulenceMax,
    particleTurbulenceFrequencyMin: particleLayers.back.turbulenceFrequencyMin,
    particleTurbulenceFrequencyMax: particleLayers.back.turbulenceFrequencyMax,
    particleTurbulenceTimeMin: particleLayers.back.turbulenceTimeMin,
    particleTurbulenceTimeMax: particleLayers.back.turbulenceTimeMax,
    particleSpeed: particleLayers.back.speed,
    particleSize: particleLayers.back.size,
    particleSizeUnit: particleLayers.back.sizeUnit,
    particleOpacity: particleLayers.back.opacity
  };
}

function normalizeBackgroundPlaylist(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item?.url && !String(item.url).startsWith("blob:"))
    .slice(0, 160)
    .map((item) => ({
      url: String(item.url || ""),
      type: String(item.type || ""),
      name: String(item.name || ""),
      size: Number(item.size || 0),
      path: String(item.path || ""),
      folderPath: String(item.folderPath || "")
    }));
}

function persistBackgroundSettings(settings) {
  const { localUrl, localType, localPlaylist, folderPreviewToken, ...persisted } = normalizeBackgroundSettings(settings);
  return {
    ...persisted,
    boundFolders: normalizeBackgroundFolders(persisted.boundFolders, persisted.boundFolderPath),
    playlist: normalizeBackgroundPlaylist(persisted.playlist).map((item) => ({
      ...item,
      url: stripBackgroundPreviewToken(item.url)
    }))
  };
}

function backgroundUrls(settings) {
  return String(settings?.urlsText || "")
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function activeBackgroundItems(settings) {
  const normalized = normalizeBackgroundSettings(settings);
  const ordered = (items) => normalized.slideshowOrder === "random" ? stableShuffle(items, `${normalized.interval}:${items.length}`) : items;
  const urls = backgroundUrls(normalized);
  if (normalized.mode === "slideshow") {
    if (normalized.localPlaylist.length > 0) return ordered(normalized.localPlaylist);
    if (normalized.playlist.length > 0) return ordered(normalized.playlist);
    if (normalized.assetUrl) {
      return [{
        url: normalized.assetUrl,
        type: normalized.assetType,
        name: normalized.assetName || "背景媒体"
      }];
    }
    return ordered(urls.map((url) => ({
      url,
      type: detectBackgroundUrlType(url),
      name: url.split("/").pop() || url
    })));
  }
  if (normalized.mode !== "media") return [];
  if (normalized.localUrl) {
    return [{ url: normalized.localUrl, type: normalized.localType, name: "本地预览" }];
  }
  if (normalized.assetUrl) {
    return [{ url: normalized.assetUrl, type: normalized.assetType, name: normalized.assetName || "背景媒体" }];
  }
  const firstUrl = urls[0];
  return firstUrl ? [{
    url: firstUrl,
    type: detectBackgroundUrlType(firstUrl),
    name: firstUrl.split("/").pop() || firstUrl
  }] : [];
}

function stableShuffle(items, seedText) {
  const list = [...items];
  let seed = 2166136261;
  for (const char of String(seedText || "")) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  for (let index = list.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    const swapIndex = Math.abs(seed) % (index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

// 粒子数量按层做上限控制。真实绘制交给 tsParticles，避免自己维护粒子生命周期。
function particleCountForLayer(layer, layerKey = "back") {
  const normalized = normalizeParticleLayer(layer, defaultParticleLayers[layerKey] || defaultParticleLayers.back);
  if (!normalized.enabled || normalized.density <= 0 || normalized.opacity <= 0) return 0;
  const meta = particlePresetMeta[normalized.preset] || particlePresetMeta.snow;
  return Math.min(260, Math.max(0, Math.round(normalized.density * meta.densityScale)));
}

function roleplayParticleSpawnIntervalMs(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  return Math.max(12, Math.min(180, 4200 / safeCount));
}

function detectBackgroundUrlType(url) {
  const clean = String(url || "").split("?")[0].split("#")[0].toLowerCase();
  return /\.(mp4|webm|mov)$/.test(clean) ? "video/url" : "image/url";
}

function isBackgroundVideoItem(item) {
  return Boolean(item?.url) && (
    String(item.type || "").startsWith("video/")
    || detectBackgroundUrlType(item.url).startsWith("video/")
  );
}

function particleDirectionAngle(direction) {
  if (direction === "up") return -90;
  if (direction === "right") return 0;
  if (direction === "left") return 180;
  if (direction === "diagonal") return 69;
  return 90;
}

function isParticleMovementDirection(value) {
  return particleDirectionOptions.some((item) => item.key === value);
}

function isParticleSpawnPosition(value) {
  return particleSpawnPositionOptions.some((item) => item.key === value);
}

function particleSpawnEdgesFromPosition(spawnPosition) {
  const edges = {
    top: { enabled: false, range: [0, 100] },
    right: { enabled: false, range: [0, 100] },
    bottom: { enabled: false, range: [0, 100] },
    left: { enabled: false, range: [0, 100] }
  };
  if (spawnPosition === "bottom") {
    edges.bottom.enabled = true;
  } else if (spawnPosition === "left") {
    edges.left.enabled = true;
  } else if (spawnPosition === "right") {
    edges.right.enabled = true;
  } else if (spawnPosition === "topLeft") {
    edges.top.enabled = true;
    edges.top.range = [0, 34];
    edges.left.enabled = true;
    edges.left.range = [0, 34];
  } else {
    edges.top.enabled = true;
  }
  return edges;
}

function normalizeParticleSpawnEdges(value, fallback, legacySpawnPosition = "top") {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : particleSpawnEdgesFromPosition(legacySpawnPosition);
  const normalized = {};
  particleSpawnEdgeOptions.forEach((edge) => {
    const edgeSource = source[edge.key] && typeof source[edge.key] === "object" ? source[edge.key] : {};
    const edgeFallback = fallbackSource[edge.key] && typeof fallbackSource[edge.key] === "object"
      ? fallbackSource[edge.key]
      : defaultParticleSpawnEdges[edge.key];
    const range = normalizeControlRange(edgeSource.range || edgeFallback.range, 0, 100);
    normalized[edge.key] = {
      enabled: typeof edgeSource.enabled === "boolean" ? edgeSource.enabled : Boolean(edgeFallback.enabled),
      range
    };
  });
  const hasEnabled = particleSpawnEdgeOptions.some((edge) => normalized[edge.key].enabled);
  if (!hasEnabled) {
    const fallbackKey = isParticleSpawnPosition(legacySpawnPosition) && legacySpawnPosition !== "topLeft" ? legacySpawnPosition : "top";
    normalized[fallbackKey].enabled = true;
  }
  return normalized;
}

function normalizeParticleSizeValue(sourceSize, fallbackSize, preset, sizeUnit) {
  const fallback = clampNumber(fallbackSize, particleSizeControlMin, particleSizeControlMax, 24);
  const raw = Number(sourceSize);
  if (!Number.isFinite(raw)) return fallback;
  if (sizeUnit === "px" || raw <= particleSizeControlMax) {
    return clampNumber(raw, particleSizeControlMin, particleSizeControlMax, fallback);
  }
  const meta = particlePresetMeta[preset] || particlePresetMeta.snow;
  const legacyPercent = clampNumber(raw, 1, 240, 100) / 100;
  // 旧版本“粒子尺寸”是百分比，又在片状粒子里叠了隐藏 sizeScale。
  // 新版本统一改为最终最大像素：旧配置迁移时只按基础 sprite 最大值换算，不再带隐藏倍率。
  const migratedMaxPixels = Math.round((meta.size?.[1] || fallback) * legacyPercent);
  return clampNumber(migratedMaxPixels, particleSizeControlMin, particleSizeControlMax, fallback);
}

function particleSpawnEdgesPrimaryPosition(spawnEdges, fallback = "top") {
  const normalized = normalizeParticleSpawnEdges(spawnEdges, particleSpawnEdgesFromPosition(fallback), fallback);
  const active = particleSpawnEdgeOptions.filter((edge) => normalized[edge.key]?.enabled);
  if (active.length === 2 && normalized.top.enabled && normalized.left.enabled) {
    const topRange = normalized.top.range || [0, 100];
    const leftRange = normalized.left.range || [0, 100];
    if (topRange[1] <= 40 && leftRange[1] <= 40) return "topLeft";
  }
  return active[0]?.key || fallback;
}

function particleSpawnEdgesLabel(spawnEdges) {
  const normalized = normalizeParticleSpawnEdges(spawnEdges, defaultParticleSpawnEdges, "top");
  const active = particleSpawnEdgeOptions.filter((edge) => normalized[edge.key]?.enabled);
  if (active.length <= 0) return "上边";
  if (active.length === 4) return "四边";
  return active.map((edge) => edge.label.replace("边", "")).join(" / ");
}

function particleSpawnEdgesSignature(spawnEdges) {
  const normalized = normalizeParticleSpawnEdges(spawnEdges, defaultParticleSpawnEdges, "top");
  return particleSpawnEdgeOptions
    .map((edge) => {
      const item = normalized[edge.key];
      return `${edge.key}:${item.enabled ? 1 : 0}:${item.range[0]}-${item.range[1]}`;
    })
    .join("|");
}

function particleSpawnEntryDirection(spawnPosition, fallbackDirection = "down") {
  return particleSpawnPositionEntryDirectionMap[spawnPosition] || fallbackDirection;
}

function particleSpawnPositionFromDirection(direction) {
  return particleLegacyDirectionToSpawnPositionMap[direction] || "top";
}

function particleSpriteRotationOffset() {
  // 当前粒子贴图的长轴默认朝向竖直向下；跟随速度方向时需要抵消 90 度，避免雨线和花瓣横过来。
  return -90;
}

function limitParticleVector(vector, maxLength) {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length)) return { x: 0, y: 0 };
  if (length <= maxLength || length === 0) return vector;
  const scale = maxLength / length;
  return { x: vector.x * scale, y: vector.y * scale };
}

function particleHashUnit(value) {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function smoothParticleStep(value) {
  const next = Math.max(0, Math.min(1, value));
  return next * next * (3 - 2 * next);
}

function particleFrameDeltaSeconds(state, now, delta) {
  const deltaValue = Number(delta?.value);
  if (Number.isFinite(deltaValue) && deltaValue > 0) {
    return Math.max(1 / 120, Math.min(0.08, deltaValue / 1000));
  }
  const previousNow = Number(state?.now);
  if (!Number.isFinite(previousNow)) return 1 / 60;
  const elapsedSeconds = (now - previousNow) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 1 / 60;
  return Math.max(1 / 120, Math.min(0.08, elapsedSeconds));
}

function particleVectorLength(vector) {
  return Math.hypot(Number(vector?.x) || 0, Number(vector?.y) || 0);
}

function particleVectorDot(first, second) {
  return (Number(first?.x) || 0) * (Number(second?.x) || 0)
    + (Number(first?.y) || 0) * (Number(second?.y) || 0);
}

function rotateParticleVector(vector, angle) {
  const x = Number(vector?.x) || 0;
  const y = Number(vector?.y) || 0;
  const sin = Math.sin(Number(angle) || 0);
  const cos = Math.cos(Number(angle) || 0);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

function normalizeParticleAngle(angle) {
  const value = Number(angle) || 0;
  const twoPi = Math.PI * 2;
  return ((value + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function shortestParticleAngleDelta(target, current) {
  return normalizeParticleAngle((Number(target) || 0) - (Number(current) || 0));
}

function smoothParticleAngleComponent(state, key, targetValue, deltaSeconds, attackSeconds, releaseSeconds) {
  const current = Number.isFinite(Number(state[key])) ? Number(state[key]) : Number(targetValue) || 0;
  const delta = shortestParticleAngleDelta(targetValue, current);
  const seconds = Math.abs(delta) >= Math.abs(shortestParticleAngleDelta(0, current)) ? attackSeconds : releaseSeconds;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, seconds));
  const next = normalizeParticleAngle(current + delta * alpha);
  state[key] = next;
  return next;
}

function particleTensorQuadratic(tensor, vector, fallback = 0.04) {
  const cov = tensor && typeof tensor === "object" ? tensor : {};
  const x = Number(vector?.x) || 0;
  const y = Number(vector?.y) || 0;
  const xx = clampParticleValue(cov.xx, 0.0012, 0.24, fallback);
  const xy = clampParticleValue(cov.xy, -0.10, 0.10, 0);
  const yy = clampParticleValue(cov.yy, 0.0012, 0.24, fallback);
  return Math.max(0.0001, xx * x * x + 2 * xy * x * y + yy * y * y);
}

function normalizeParticleVector(vector, fallback = { x: 1, y: 0 }) {
  const length = particleVectorLength(vector);
  if (length <= 0.0001) return fallback;
  return {
    x: (Number(vector?.x) || 0) / length,
    y: (Number(vector?.y) || 0) / length
  };
}

function calculateSheetParticlePrincipalAxis(covariance) {
  const xx = clampParticleValue(covariance?.xx, 0.0012, 0.18, 0.035);
  const xy = clampParticleValue(covariance?.xy, -0.08, 0.08, 0);
  const yy = clampParticleValue(covariance?.yy, 0.0012, 0.24, 0.055);
  const angle = Math.abs(xy) > 0.000001 || Math.abs(xx - yy) > 0.000001
    ? 0.5 * Math.atan2(2 * xy, xx - yy)
    : Math.PI / 2;
  return normalizeParticleVector({ x: Math.cos(angle), y: Math.sin(angle) }, { x: 0, y: 1 });
}

function calculateSheetParticleDirectionalLightModel(samples, massMoments, fallbackPole = { x: 0, y: 1 }) {
  const centerOfMass = massMoments?.centerOfMass || { x: 0, y: 0 };
  const dragCenter = massMoments?.dragCenter || centerOfMass;
  const massCovariance = massMoments?.massCovariance || { xx: 0.035, xy: 0, yy: 0.055 };
  const dragDelta = {
    x: (Number(dragCenter.x) || 0) - (Number(centerOfMass.x) || 0),
    y: (Number(dragCenter.y) || 0) - (Number(centerOfMass.y) || 0)
  };
  const dragDeltaLength = particleVectorLength(dragDelta);
  let lightPole = dragDeltaLength > 0.012 ? dragDelta : null;
  let confidence = clampParticleValue(dragDeltaLength * 4.8, 0.18, 0.88, 0.24);
  let mobilitySignal = dragDeltaLength * 2.8;

  if (!lightPole && Array.isArray(samples) && samples.length > 0) {
    const axis = calculateSheetParticlePrincipalAxis(massCovariance);
    const crossAxis = { x: -axis.y, y: axis.x };
    const totalMass = Math.max(0.0001, samples.reduce((sum, sample) => sum + Math.max(0, Number(sample.mass) || 0), 0));
    const totalDrag = Math.max(0.0001, samples.reduce((sum, sample) => sum + Math.max(0, Number(sample.drag ?? sample.mass) || 0), 0));
    const plus = { mass: 0, drag: 0, extent: 0, endCross: 0, endWeight: 0 };
    const minus = { mass: 0, drag: 0, extent: 0, endCross: 0, endWeight: 0 };
    samples.forEach((sample) => {
      const dx = (Number(sample.x) || 0) - (Number(centerOfMass.x) || 0);
      const dy = (Number(sample.y) || 0) - (Number(centerOfMass.y) || 0);
      const projection = dx * axis.x + dy * axis.y;
      const cross = dx * crossAxis.x + dy * crossAxis.y;
      const target = projection >= 0 ? plus : minus;
      const mass = Math.max(0, Number(sample.mass) || 0);
      const drag = Math.max(0, Number(sample.drag ?? sample.mass) || 0);
      const endWeight = smoothParticleStep(clampParticleValue((Math.abs(projection) - 0.05) / 0.42, 0, 1, 0)) * drag;
      target.mass += mass;
      target.drag += drag;
      target.extent = Math.max(target.extent, Math.abs(projection));
      target.endCross += Math.abs(cross) * endWeight;
      target.endWeight += endWeight;
    });
    const scoreSide = (side) => {
      const massRatio = side.mass / totalMass;
      const dragRatio = side.drag / totalDrag;
      const dragPerMass = dragRatio / Math.max(0.025, massRatio);
      const endWidth = side.endWeight > 0.0001 ? side.endCross / side.endWeight : 0.16;
      // 轻部不是固定的上/下/左/右，而是“同一轮廓主轴上，面积/质量更少、端部更窄、杠杆更长、单位质量受风更强”的连续区域。
      return dragPerMass * 0.38
        + (1 - massRatio) * 0.30
        + side.extent * 0.34
        + (1 - Math.min(1, endWidth * 3.2)) * 0.18;
    };
    const plusScore = scoreSide(plus);
    const minusScore = scoreSide(minus);
    const sign = plusScore >= minusScore ? 1 : -1;
    lightPole = { x: axis.x * sign, y: axis.y * sign };
    const scoreGap = Math.abs(plusScore - minusScore);
    confidence = clampParticleValue(0.24 + scoreGap * 0.90 + (Number(massMoments?.anisotropy) || 0) * 0.36, 0.20, 0.92, 0.38);
    mobilitySignal = scoreGap + Math.max(plusScore, minusScore) * 0.28;
  }

  const normalizedPole = normalizeParticleVector(lightPole || fallbackPole, fallbackPole);
  const anisotropy = clampParticleValue(massMoments?.anisotropy, 0, 0.94, 0);
  const eccentricity = clampParticleValue(massMoments?.massEccentricity, 0, 0.58, dragDeltaLength);
  return {
    lightPole: normalizedPole,
    lightMobility: clampParticleValue(0.78 + mobilitySignal * 0.42 + anisotropy * 0.28 + eccentricity * 0.42, 0.58, 1.92, 1),
    lightPoleConfidence: confidence
  };
}

function calculateSheetParticleShapeExposure(massMoments, localWindUnit) {
  const moments = normalizeSheetParticleMassMoments(massMoments);
  const unit = normalizeParticleVector(localWindUnit);
  const crossUnit = { x: -unit.y, y: unit.x };
  const dragCovariance = moments.dragCovariance || moments.massCovariance || { xx: 0.035, xy: 0, yy: 0.055 };
  const alongSpan = Math.sqrt(particleTensorQuadratic(dragCovariance, unit, 0.04));
  const crossSpan = Math.sqrt(particleTensorQuadratic(dragCovariance, crossUnit, 0.04));
  const averageSpan = Math.max(0.001, (alongSpan + crossSpan) * 0.5);
  // 迎风方向看到的横向轮廓越宽，实际受风面积越大；协方差让这个判断跟随贴图真实轮廓，而不是固定上下左右。
  const broadsideRatio = crossSpan / averageSpan;
  const shapeExposure = clampParticleValue(
    0.84 + (broadsideRatio - 1) * 0.44 + moments.anisotropy * 0.20,
    0.58,
    1.42,
    1
  );
  return {
    shapeExposure,
    alongSpan,
    crossSpan,
    broadsideRatio
  };
}

function calculateSheetParticleWindLoad(particle, field, massMoments, localWindUnit, flowPower, stableWindLength, accidentalStrength) {
  const physicalMassKg = Math.max(1e-9, Number(particle.physicalMassKg) || 1e-6);
  const weightNewton = Math.max(1e-9, Number(particle.weightNewton) || physicalMassKg * 9.80665);
  const dragAreaM2 = Math.max(1e-10, Number(particle.dragAreaM2) || Number(particle.projectedAreaMm2 || 0) * 1e-6 * 1.2);
  const weightScale = Math.max(0.25, Math.min(2.6, Number(field?.weightScale ?? 100) / 100));
  const shape = calculateSheetParticleShapeExposure(massMoments, localWindUnit);
  // 用户滑块是感性风强，这里映射成低速自然风范围。后续再用风载/重量压缩，避免轻物体和重物体共用同一套视觉倍率。
  const windSpeedMps = 0.10
    + Math.pow(Math.max(0, Math.min(1, flowPower)), 0.78) * 1.72
    + Math.min(1.35, accidentalStrength) * 0.70
    + Math.min(1.8, stableWindLength) * 0.18;
  const dynamicPressurePa = 0.5 * sheetParticleAirDensityKgM3 * windSpeedMps * windSpeedMps;
  const dragForceNewton = dynamicPressurePa * dragAreaM2 * shape.shapeExposure;
  const windLoadRatio = dragForceNewton / weightNewton;
  const windLoadDrive = clampParticleValue(1 - Math.exp(-windLoadRatio * 0.58), 0, 1.38, 0);
  const inverseWeightMobility = clampParticleValue(1 / Math.sqrt(weightScale), 0.62, 2.0, 1);
  const edgeMobility = clampParticleValue(
    inverseWeightMobility * (0.76 + windLoadDrive * 0.46 + (massMoments?.mobilityScale || 1) * 0.15 + shape.shapeExposure * 0.13),
    0.50,
    1.82,
    1
  );
  return {
    ...shape,
    windSpeedMps,
    dynamicPressurePa,
    dragForceNewton,
    windLoadRatio,
    windLoadDrive,
    edgeMobility,
    inverseWeightMobility,
    ballisticCoefficientKgM2: physicalMassKg / dragAreaM2
  };
}

function normalizedParticlePoint(point, fallback) {
  const source = point && typeof point === "object" ? point : fallback;
  const rawX = Number(source?.x ?? fallback.x);
  const rawY = Number(source?.y ?? fallback.y);
  const safeX = Number.isFinite(rawX) ? rawX : fallback.x;
  const safeY = Number.isFinite(rawY) ? rawY : fallback.y;
  return {
    x: Math.max(0, Math.min(1, safeX)),
    y: Math.max(0, Math.min(1, safeY))
  };
}

function integrateParticleTorqueAngle(state, key, velocityKey, torque, deltaSeconds, options = {}) {
  const current = Number.isFinite(state[key]) ? state[key] : 0;
  const velocity = Number.isFinite(state[velocityKey]) ? state[velocityKey] : 0;
  const inertia = Math.max(0.18, Number(options.inertia) || 1);
  const damping = Math.max(0.12, Number(options.damping) || 1);
  const restoring = Math.max(0, Number(options.restoring) || 0);
  const maxVelocity = Math.max(0.08, Number(options.maxVelocity) || 1.6);
  const maxAbsAngle = Math.max(0.12, Number(options.maxAbsAngle) || 0.8);
  const acceleration = ((Number(torque) || 0) - velocity * damping - current * restoring) / inertia;
  let nextVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity + acceleration * deltaSeconds));
  const rawAngle = current + nextVelocity * deltaSeconds;
  // 姿态边界不能硬撞墙；用软限制压近最大角，避免花瓣突然停住或反弹。
  const nextAngle = maxAbsAngle * Math.tanh(rawAngle / maxAbsAngle);
  if (Math.abs(nextAngle) > maxAbsAngle * 0.94 && Math.sign(nextVelocity) === Math.sign(nextAngle)) {
    nextVelocity *= 0.42;
  }
  state[velocityKey] = nextVelocity;
  state[key] = nextAngle;
  return nextAngle;
}

function smoothParticleVectorComponent(state, key, nextVector, deltaSeconds, attackSeconds, releaseSeconds) {
  const previous = state[key] || { x: 0, y: 0 };
  const previousLength = particleVectorLength(previous);
  const nextLength = particleVectorLength(nextVector);
  const seconds = nextLength >= previousLength ? attackSeconds : releaseSeconds;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, seconds));
  const smoothed = {
    x: previous.x + (nextVector.x - previous.x) * alpha,
    y: previous.y + (nextVector.y - previous.y) * alpha
  };
  state[key] = smoothed;
  return smoothed;
}

function smoothParticleUnitVectorComponent(state, key, nextVector, deltaSeconds, responseSeconds, fallback = { x: 1, y: 0 }, minLength = 0.018) {
  const previous = normalizeParticleVector(state[key], normalizeParticleVector(fallback));
  const nextLength = particleVectorLength(nextVector);
  // 风压方向不能在低风速或局部风消失时重新随机归一化，否则花瓣会突然折向另一边。
  const target = nextLength >= minLength
    ? normalizeParticleVector(nextVector, previous)
    : previous;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, Number(responseSeconds) || 0.36));
  const mixed = {
    x: previous.x + (target.x - previous.x) * alpha,
    y: previous.y + (target.y - previous.y) * alpha
  };
  const smoothed = normalizeParticleVector(mixed, previous);
  state[key] = smoothed;
  return smoothed;
}

function smoothParticleScalarComponent(state, key, nextValue, deltaSeconds, attackSeconds, releaseSeconds) {
  const previous = Number(state[key]) || 0;
  const target = Number.isFinite(Number(nextValue)) ? Number(nextValue) : 0;
  const seconds = Math.abs(target) >= Math.abs(previous) ? attackSeconds : releaseSeconds;
  const alpha = 1 - Math.exp(-deltaSeconds / Math.max(0.001, seconds));
  const smoothed = previous + (target - previous) * alpha;
  state[key] = smoothed;
  return smoothed;
}

function sampleParticleRange(min, max, seed) {
  const start = Number(min);
  const end = Number(max);
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? end : safeStart;
  const low = Math.min(safeStart, safeEnd);
  const high = Math.max(safeStart, safeEnd);
  if (high <= low) return low;
  return low + (high - low) * particleHashUnit(seed);
}

function normalizeParticlePoseWeights(weights) {
  const safeWeights = weights.map((value) => Math.max(0, Number(value) || 0));
  const total = safeWeights.reduce((sum, value) => sum + value, 0);
  if (total <= 0.0001) return [1, 0, 0, 0];
  return safeWeights.map((value) => value / total);
}

function threeSheetParticlePoseWeights(particle) {
  const poseResponse = Math.max(0.4, Math.min(2.2, Number(particle?.poseResponse) || 1));
  const yaw = Math.max(-1, Math.min(1, Number(particle?.yaw || 0) * poseResponse / 0.58));
  const pitch = Math.max(-1, Math.min(1, Number(particle?.pitch || 0) * poseResponse / 0.48));
  const twist = Math.max(-1, Math.min(1, Number(particle?.twist || 0) * poseResponse / 0.42));
  const lightDeform = particle?.lightDeform || {};
  const deformDrive = Math.max(0, Math.min(1.2, Math.hypot(Number(lightDeform.x) || 0, Number(lightDeform.y) || 0)));
  const deformLift = Math.max(0, Math.min(1.2, Number(lightDeform.lift) || 0));
  // 姿态贴图只接收当前物理姿态和轻部形变；底图必须始终保住单片花瓣轮廓，
  // 折叠图只作为翻面提示，不能在高风压时把花瓣替换成一条窄长贴图。
  const sideAmount = Math.min(0.92, Math.abs(yaw) * 0.78 + Math.abs(twist) * 0.18 + deformDrive * 0.24);
  const foldAmount = Math.min(0.66, Math.max(0, Math.abs(pitch) - 0.035) * 0.62 + Math.abs(yaw) * 0.12 + deformLift * 0.30);
  const left = Math.max(0, yaw) * (0.54 + sideAmount * 0.18) * (1 - foldAmount * 0.16);
  const right = Math.max(0, -yaw) * (0.54 + sideAmount * 0.18) * (1 - foldAmount * 0.16);
  const fold = foldAmount * (0.46 + Math.abs(twist) * 0.10 + deformLift * 0.10);
  const base = Math.max(0.42, 1 - sideAmount * 0.46 - fold * 0.40);
  return normalizeParticlePoseWeights([base, left, right, fold]);
}

function clampParticleValue(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function createSheetParticleMassMomentsFromSums(sums) {
  const massTotal = Math.max(0.0001, Number(sums.massTotal) || 0);
  const dragTotal = Math.max(0.0001, Number(sums.dragTotal ?? sums.massTotal) || 0);
  const massCenter = {
    x: clampParticleValue((Number(sums.massMomentX) || 0) / massTotal, -0.36, 0.36, 0),
    y: clampParticleValue((Number(sums.massMomentY) || 0) / massTotal, -0.42, 0.42, 0)
  };
  const dragCenter = {
    x: clampParticleValue((Number(sums.dragMomentX ?? sums.massMomentX) || 0) / dragTotal, -0.36, 0.36, massCenter.x),
    y: clampParticleValue((Number(sums.dragMomentY ?? sums.massMomentY) || 0) / dragTotal, -0.42, 0.42, massCenter.y)
  };
  const rawMassXX = Math.max(0.0008, (Number(sums.massSecondXX) || 0) / massTotal - massCenter.x * massCenter.x);
  const rawMassXY = (Number(sums.massSecondXY) || 0) / massTotal - massCenter.x * massCenter.y;
  const rawMassYY = Math.max(0.0008, (Number(sums.massSecondYY) || 0) / massTotal - massCenter.y * massCenter.y);
  const rawDragXX = Math.max(0.0008, (Number(sums.dragSecondXX ?? sums.massSecondXX) || 0) / dragTotal - dragCenter.x * dragCenter.x);
  const rawDragXY = (Number(sums.dragSecondXY ?? sums.massSecondXY) || 0) / dragTotal - dragCenter.x * dragCenter.y;
  const rawDragYY = Math.max(0.0008, (Number(sums.dragSecondYY ?? sums.massSecondYY) || 0) / dragTotal - dragCenter.y * dragCenter.y);
  const massCovariance = {
    xx: clampParticleValue(rawMassXX, 0.0012, 0.18, 0.035),
    xy: clampParticleValue(rawMassXY, -0.08, 0.08, 0),
    yy: clampParticleValue(rawMassYY, 0.0012, 0.24, 0.055)
  };
  const dragCovariance = {
    xx: clampParticleValue(rawDragXX, 0.0012, 0.18, massCovariance.xx),
    xy: clampParticleValue(rawDragXY, -0.08, 0.08, massCovariance.xy),
    yy: clampParticleValue(rawDragYY, 0.0012, 0.24, massCovariance.yy)
  };
  const trace = massCovariance.xx + massCovariance.yy;
  const diff = massCovariance.xx - massCovariance.yy;
  const radius = Math.sqrt(diff * diff + 4 * massCovariance.xy * massCovariance.xy);
  const major = Math.max(0.0001, (trace + radius) / 2);
  const minor = Math.max(0.0001, (trace - radius) / 2);
  const massEccentricity = Math.hypot(dragCenter.x - massCenter.x, dragCenter.y - massCenter.y);
  const lightModel = calculateSheetParticleDirectionalLightModel([], {
    centerOfMass: massCenter,
    dragCenter,
    massCovariance,
    dragCovariance,
    anisotropy: clampParticleValue((major - minor) / Math.max(0.0001, major + minor), 0, 0.94, 0),
    massEccentricity
  }, sums.lightPole || { x: 0, y: 1 });
  return {
    centerOfMass: massCenter,
    dragCenter,
    massCovariance,
    dragCovariance,
    anisotropy: clampParticleValue((major - minor) / Math.max(0.0001, major + minor), 0, 0.94, 0),
    massEccentricity: clampParticleValue(massEccentricity, 0, 0.58, 0),
    mobilityScale: clampParticleValue(0.72 + massEccentricity * 2.2 + Math.sqrt(Math.max(0.0001, major)) * 1.4, 0.58, 1.84, 1),
    lightPole: sums.lightPole || lightModel.lightPole,
    lightMobility: clampParticleValue(sums.lightMobility, 0.58, 1.92, lightModel.lightMobility),
    lightPoleConfidence: clampParticleValue(sums.lightPoleConfidence, 0.12, 0.96, lightModel.lightPoleConfidence)
  };
}

function normalizeSheetParticleMassMoments(source) {
  const moments = source?.massMoments || source?.moments || source?.physical?.silhouette?.massMoments || source || {};
  const centerSource = moments.centerOfMass || source?.centerOfMass || {};
  const dragSource = moments.dragCenter || moments.centerOfDrag || centerSource;
  const covarianceSource = moments.massCovariance || {};
  const dragCovarianceSource = moments.dragCovariance || covarianceSource;
  const centerOfMass = {
    x: clampParticleValue(centerSource.x, -0.36, 0.36, 0),
    y: clampParticleValue(centerSource.y, -0.42, 0.42, 0)
  };
  const dragCenter = {
    x: clampParticleValue(dragSource.x, -0.36, 0.36, centerOfMass.x),
    y: clampParticleValue(dragSource.y, -0.42, 0.42, centerOfMass.y)
  };
  const massCovariance = {
    xx: clampParticleValue(covarianceSource.xx, 0.0012, 0.18, 0.035),
    xy: clampParticleValue(covarianceSource.xy, -0.08, 0.08, 0),
    yy: clampParticleValue(covarianceSource.yy, 0.0012, 0.24, 0.055)
  };
  const dragCovariance = {
    xx: clampParticleValue(dragCovarianceSource.xx, 0.0012, 0.18, massCovariance.xx),
    xy: clampParticleValue(dragCovarianceSource.xy, -0.08, 0.08, massCovariance.xy),
    yy: clampParticleValue(dragCovarianceSource.yy, 0.0012, 0.24, massCovariance.yy)
  };
  const rawLightPole = moments.lightPole || source?.lightPole || {};
  const lightPole = normalizeParticleVector({
    x: clampParticleValue(rawLightPole.x, -1, 1, 0),
    y: clampParticleValue(rawLightPole.y, -1, 1, 1)
  }, { x: 0, y: 1 });
  return {
    centerOfMass,
    dragCenter,
    massCovariance,
    dragCovariance,
    anisotropy: clampParticleValue(moments.anisotropy, 0, 0.94, 0),
    massEccentricity: clampParticleValue(moments.massEccentricity, 0, 0.58, Math.hypot(dragCenter.x - centerOfMass.x, dragCenter.y - centerOfMass.y)),
    mobilityScale: clampParticleValue(moments.mobilityScale, 0.58, 1.84, 1),
    lightPole,
    lightMobility: clampParticleValue(moments.lightMobility ?? source?.lightMobility, 0.58, 1.92, 1),
    lightPoleConfidence: clampParticleValue(moments.lightPoleConfidence ?? source?.lightPoleConfidence, 0.12, 0.96, 0.32)
  };
}

function sheetParticleSilhouetteWidth(preset, y, seed) {
  const safeY = Math.max(0.001, Math.min(0.999, y));
  const asymmetry = sampleParticleRange(-0.08, 0.08, seed * 4.79);
  if (preset === "dandelion") {
    const tuft = Math.pow(Math.sin(Math.PI * safeY), 0.38) * (0.24 + safeY * 0.82);
    return {
      width: Math.max(0.02, tuft * (0.52 + sampleParticleRange(-0.05, 0.05, seed * 4.21))),
      centerX: asymmetry * (0.18 + safeY * 0.34)
    };
  }
  if (preset === "maple") {
    const lobes = 0.72 + 0.18 * Math.sin(safeY * Math.PI * 6 + seed);
    const waist = 0.72 + 0.28 * Math.sin(Math.PI * safeY);
    return {
      width: Math.max(0.04, Math.pow(Math.sin(Math.PI * safeY), 0.32) * lobes * waist),
      centerX: asymmetry * (0.16 + Math.sin(Math.PI * safeY) * 0.22)
    };
  }
  const shoulder = 0.78 + 0.30 * safeY;
  const taperedRoot = Math.pow(Math.sin(Math.PI * safeY), 0.46);
  const topNotch = 1 - 0.10 * Math.exp(-Math.pow((safeY - 0.92) / 0.10, 2));
  return {
    width: Math.max(0.035, taperedRoot * shoulder * topNotch),
    centerX: asymmetry * (0.12 + safeY * 0.28)
  };
}

function measureSheetParticleSilhouette(preset, seed) {
  const steps = 72;
  let total = 0;
  let momentX = 0;
  let momentY = 0;
  let secondXX = 0;
  let secondXY = 0;
  let secondYY = 0;
  const samples = [];
  for (let row = 0; row < steps; row += 1) {
    const y = (row + 0.5) / steps;
    const sample = sheetParticleSilhouetteWidth(preset, y, seed);
    const width = Math.max(0.001, sample.width);
    const centerX = clampParticleValue(sample.centerX, -0.42, 0.42, 0);
    const rowMass = width / steps;
    const localY = 0.5 - y;
    const rowVarianceX = width * width / 12;
    total += rowMass;
    momentX += rowMass * centerX;
    // PlaneGeometry 本地 y 轴向上；采样 y 从贴图上方向下，因此这里转成本地坐标。
    momentY += rowMass * localY;
    secondXX += rowMass * (centerX * centerX + rowVarianceX);
    secondXY += rowMass * centerX * localY;
    secondYY += rowMass * localY * localY;
    samples.push({ x: centerX, y: localY, mass: rowMass, drag: rowMass });
  }
  const safeTotal = Math.max(0.0001, total);
  const centerOfMass = {
    x: clampParticleValue(momentX / safeTotal, -0.24, 0.24, 0),
    y: clampParticleValue(momentY / safeTotal, -0.30, 0.30, 0)
  };
  const massMoments = createSheetParticleMassMomentsFromSums({
    massTotal: safeTotal,
    dragTotal: safeTotal,
    massMomentX: momentX,
    massMomentY: momentY,
    dragMomentX: momentX,
    dragMomentY: momentY,
    massSecondXX: secondXX,
    massSecondXY: secondXY,
    massSecondYY: secondYY,
    dragSecondXX: secondXX,
    dragSecondXY: secondXY,
    dragSecondYY: secondYY
  });
  const lightModel = calculateSheetParticleDirectionalLightModel(samples, massMoments, calculateSheetParticlePrincipalAxis(massMoments.massCovariance));
  const massMomentsWithLight = {
    ...massMoments,
    ...lightModel
  };
  return {
    fillRatio: clampParticleValue(total, 0.16, 0.94, 0.58),
    centerOfMass,
    massMoments: massMomentsWithLight,
    lightPole: lightModel.lightPole,
    lightMobility: lightModel.lightMobility,
    lightPoleConfidence: lightModel.lightPoleConfidence
  };
}

function averageParticleRange(range, fallback) {
  if (!Array.isArray(range) || range.length < 2) return fallback;
  const start = Number(range[0]);
  const end = Number(range[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return fallback;
  return (start + end) / 2;
}

function createSheetParticlePhysicalProfile(preset, sprite, seed, silhouetteOverride) {
  const material = sheetParticleMaterialProfile[preset] || sheetParticleMaterialProfile.sakura;
  const aspect = (sprite?.width && sprite?.height) ? sprite.width / sprite.height : 1;
  // 片状粒子的真实物理基准来自原始材质和原始贴图轮廓；屏幕上的随机缩放只影响视觉大小。
  const silhouette = silhouetteOverride || measureSheetParticleSilhouette(preset, 1);
  const physicalLengthMm = averageParticleRange(material.physicalLengthMm, 20);
  const physicalWidthMm = physicalLengthMm * aspect;
  const thicknessMm = averageParticleRange(material.thicknessMm, 0.06);
  const projectedAreaMm2 = physicalLengthMm * physicalWidthMm * silhouette.fillRatio * material.fillRatioScale;
  const volumeMm3 = projectedAreaMm2 * thicknessMm;
  const massKg = material.densityKgM3 * volumeMm3 * 1e-9;
  const dragAreaM2 = projectedAreaMm2 * 1e-6 * material.dragCoefficient;
  return {
    materialName: material.materialName,
    densityKgM3: material.densityKgM3,
    physicalLengthMm,
    physicalWidthMm,
    thicknessMm,
    projectedAreaMm2,
    volumeMm3,
    massKg,
    weightNewton: massKg * 9.80665,
    dragCoefficient: material.dragCoefficient,
    dragAreaM2,
    ballisticCoefficientKgM2: massKg / Math.max(1e-10, dragAreaM2),
    referenceBallisticCoefficientKgM2: massKg / Math.max(1e-10, dragAreaM2),
    normalizedMass: 1,
    windResponse: 1,
    silhouette
  };
}

function createSheetParticleWeightDistribution(preset, sprite, seed, silhouetteOverride) {
  const material = sheetParticleMaterialProfile[preset] || sheetParticleMaterialProfile.sakura;
  const physical = createSheetParticlePhysicalProfile(preset, sprite, seed, silhouetteOverride);
  const silhouette = physical.silhouette;
  const densityScale = clampParticleValue(physical.densityKgM3 / 840, 0.16, 1.8, 1);
  const massMoments = normalizeSheetParticleMassMoments(silhouette);
  return {
    // 同一预设内不再随机出不同物性；自然差异交给出生位置、相位和风场连续变化表现。
    stiffness: averageParticleRange(material.stiffnessRange, 1) * Math.pow(densityScale, 0.08),
    edgeFlex: averageParticleRange(material.edgeFlexRange, 1) / Math.pow(densityScale, 0.10),
    centerOfMass: silhouette.centerOfMass,
    massMoments,
    physical
  };
}

function normalizeSheetParticleWeightDistribution(weightDistribution) {
  const source = weightDistribution && typeof weightDistribution === "object" ? weightDistribution : {};
  return {
    stiffness: clampParticleValue(source.stiffness, 0.35, 1.85, 1),
    edgeFlex: clampParticleValue(source.edgeFlex, 0.35, 1.85, 1),
    massMoments: normalizeSheetParticleMassMoments(source.massMoments || source)
  };
}

function sheetParticleMassCenterFromDistribution(weightDistribution, seed) {
  const distribution = normalizeSheetParticleWeightDistribution(weightDistribution);
  const massMoments = distribution.massMoments;
  if (massMoments?.centerOfMass) {
    return massMoments.centerOfMass;
  }
  const sourceCenter = weightDistribution?.centerOfMass;
  if (sourceCenter && typeof sourceCenter === "object") {
    return {
      x: clampParticleValue(sourceCenter.x, -0.24, 0.24, 0),
      y: clampParticleValue(sourceCenter.y, -0.30, 0.30, 0)
    };
  }
  return {
    x: Math.max(-0.24, Math.min(0.24, sampleParticleRange(-0.045, 0.045, seed * 6.07))),
    y: Math.max(-0.30, Math.min(0.30, sampleParticleRange(-0.05, 0.05, seed * 6.41)))
  };
}

function particlePeriodRangeFromFrequencies(minFrequency, maxFrequency, fallbackMin = 0.08, fallbackMax = 0.32) {
  const lowFrequency = Math.max(particleFrequencyControlMin, Math.min(particleFrequencyControlMax, Number(minFrequency ?? fallbackMin)));
  const highFrequency = Math.max(lowFrequency, Math.min(particleFrequencyControlMax, Number(maxFrequency ?? fallbackMax)));
  const shortPeriod = 1 / highFrequency;
  const longPeriod = 1 / lowFrequency;
  return [
    Math.max(particlePeriodControlMin, Math.min(particlePeriodControlMax, Math.min(shortPeriod, longPeriod))),
    Math.max(particlePeriodControlMin, Math.min(particlePeriodControlMax, Math.max(shortPeriod, longPeriod)))
  ];
}

function roleplayWindFieldState(container) {
  if (!container || typeof container !== "object") return null;
  let state = roleplayWindFieldStates.get(container);
  if (!state) {
    state = {
      events: [],
      eventSeed: 0,
      nextAccidentalAt: 0,
      configKey: "",
      standardKey: "",
      standardSeed: 0,
      standardWind: null
    };
    roleplayWindFieldStates.set(container, state);
  }
  // 暴露只读调试入口，方便在真实页面里确认局部意外风是否生成并命中粒子。
  container.roleplayWindFieldState = state;
  return state;
}

function roleplayWindEventConfigKey(field, width, height) {
  return [
    Math.round(width),
    Math.round(height),
    field.turbulenceMin,
    field.turbulenceMax,
    field.turbulenceFrequencyMin,
    field.turbulenceFrequencyMax,
    field.turbulenceTimeMin,
    field.turbulenceTimeMax,
    field.rainStraightness
  ].join("|");
}

function roleplayWindEventEnvelope(event, now) {
  const age = Math.max(0, (now - event.startAt) / 1000);
  const remaining = Math.max(0, (event.endAt - now) / 1000);
  const attack = smoothParticleStep(Math.min(1, age / event.attackSeconds));
  const release = smoothParticleStep(Math.min(1, remaining / event.releaseSeconds));
  return Math.min(attack, release);
}

function roleplayStandardWindRanges(field) {
  const legacyFlowStrength = Math.max(0, Math.min(100, Number(field.flowStrength || 0)));
  const flowStrengthMin = Math.max(0, Math.min(100, Number(field.flowStrengthMin ?? Math.max(0, legacyFlowStrength - 14))));
  const flowStrengthMax = Math.max(flowStrengthMin, Math.min(100, Number(field.flowStrengthMax ?? Math.min(100, legacyFlowStrength + 14))));
  const flowFrequencyMin = Math.max(particleFrequencyControlMin, Math.min(particleFrequencyControlMax, Number(field.flowFrequencyMin ?? 0.08)));
  const flowFrequencyMax = Math.max(flowFrequencyMin, Math.min(particleFrequencyControlMax, Number(field.flowFrequencyMax ?? 0.28)));
  const [flowPeriodMin, flowPeriodMax] = particlePeriodRangeFromFrequencies(flowFrequencyMin, flowFrequencyMax, 0.08, 0.28);
  const legacyWindAdjust = Math.max(-45, Math.min(45, Number(field.windStrength || 0)));
  const windAdjustMin = Math.max(-45, Math.min(45, Number(field.windAdjustMin ?? Math.max(-45, legacyWindAdjust - 8))));
  const windAdjustMax = Math.max(windAdjustMin, Math.min(45, Number(field.windAdjustMax ?? Math.min(45, legacyWindAdjust + 8))));
  return {
    flowStrengthMin,
    flowStrengthMax,
    flowPeriodMin,
    flowPeriodMax,
    windAdjustMin,
    windAdjustMax
  };
}

function roleplayStandardWindConfigKey(field) {
  const ranges = roleplayStandardWindRanges(field);
  return [
    Math.round(Number(field.windAngle ?? 0) * 100) / 100,
    ranges.flowStrengthMin,
    ranges.flowStrengthMax,
    ranges.flowPeriodMin,
    ranges.flowPeriodMax,
    ranges.windAdjustMin,
    ranges.windAdjustMax
  ].join("|");
}

function createRoleplayStandardWindSegment(state, ranges, startAt, fromStrength, fromAdjust) {
  const seed = state.standardSeed += 1;
  const periodSeconds = sampleParticleRange(ranges.flowPeriodMin, ranges.flowPeriodMax, seed + 0.23);
  return {
    startAt,
    endAt: startAt + Math.max(particlePeriodControlMin, periodSeconds) * 1000,
    fromStrength,
    toStrength: sampleParticleRange(ranges.flowStrengthMin, ranges.flowStrengthMax, seed + 0.47),
    fromAdjust,
    toAdjust: sampleParticleRange(ranges.windAdjustMin, ranges.windAdjustMax, seed + 0.71),
    periodSeconds
  };
}

function readRoleplayStandardWind(container, field, now) {
  const state = roleplayWindFieldState(container);
  if (!state) {
    return { strength: 0, adjustDegrees: 0, frequency: 0.08 };
  }
  const ranges = roleplayStandardWindRanges(field);
  const configKey = roleplayStandardWindConfigKey(field);
  if (state.standardKey !== configKey || !state.standardWind) {
    state.standardKey = configKey;
    state.standardSeed = 0;
    const initialStrength = sampleParticleRange(ranges.flowStrengthMin, ranges.flowStrengthMax, 0.19);
    const initialAdjust = sampleParticleRange(ranges.windAdjustMin, ranges.windAdjustMax, 0.37);
    state.standardWind = createRoleplayStandardWindSegment(state, ranges, now, initialStrength, initialAdjust);
  }

  let segment = state.standardWind;
  let guard = 0;
  // 按真实秒数推进风段；长时间切后台时最多快进一批，再从当前时间续上，避免恢复时突然抖动。
  while (now >= segment.endAt && guard < 512) {
    segment = createRoleplayStandardWindSegment(state, ranges, segment.endAt, segment.toStrength, segment.toAdjust);
    state.standardWind = segment;
    guard += 1;
  }
  if (now >= segment.endAt) {
    segment = createRoleplayStandardWindSegment(state, ranges, now, segment.toStrength, segment.toAdjust);
    state.standardWind = segment;
  }

  const duration = Math.max(1, segment.endAt - segment.startAt);
  const progress = smoothParticleStep(Math.max(0, Math.min(1, (now - segment.startAt) / duration)));
  return {
    strength: segment.fromStrength + (segment.toStrength - segment.fromStrength) * progress,
    adjustDegrees: segment.fromAdjust + (segment.toAdjust - segment.fromAdjust) * progress,
    frequency: 1 / Math.max(particlePeriodControlMin, segment.periodSeconds)
  };
}

function createRoleplayWindEvent(state, field, now, width, height) {
  const minSize = Math.max(1, Math.min(width, height));
  const turbulenceFallback = Math.max(0, Math.min(100, Number(field.turbulence || 0)));
  const strengthMin = Math.max(0, Math.min(100, Number(field.turbulenceMin ?? turbulenceFallback * 0.45)));
  const strengthMax = Math.max(strengthMin, Math.min(100, Number(field.turbulenceMax ?? turbulenceFallback)));
  const timeMin = Math.max(0.2, Math.min(12, Number(field.turbulenceTimeMin ?? 1.2)));
  const timeMax = Math.max(timeMin, Math.min(12, Number(field.turbulenceTimeMax ?? 4.8)));
  const seed = state.eventSeed += 1;
  const strength = sampleParticleRange(strengthMin, strengthMax, seed + 0.17);
  const durationSeconds = sampleParticleRange(timeMin, timeMax, seed + 0.31);
  const radiusBase = minSize * sampleParticleRange(0.30, 0.62, seed + 0.53);
  return {
    id: seed,
    startAt: now,
    endAt: now + durationSeconds * 1000,
    attackSeconds: Math.max(0.12, Math.min(durationSeconds * 0.42, 1.8)),
    releaseSeconds: Math.max(0.18, Math.min(durationSeconds * 0.52, 2.6)),
    x: sampleParticleRange(0, width, seed + 0.71),
    y: sampleParticleRange(0, height, seed + 0.89),
    radius: Math.max(120, radiusBase * (0.86 + strength / 120)),
    angle: sampleParticleRange(0, Math.PI * 2, seed + 1.13),
    strength: Math.pow(strength / 100, 0.78),
    hits: 0
  };
}

function updateRoleplayWindEvents(container, field, now, width, height) {
  const state = roleplayWindFieldState(container);
  if (!state) return [];
  const configKey = roleplayWindEventConfigKey(field, width, height);
  if (state.configKey !== configKey) {
    state.configKey = configKey;
    state.events = [];
    state.eventSeed = 0;
    // 配置变化后如果启用了意外风，立即生成一次局部事件，避免预览阶段长时间看不出效果。
    state.nextAccidentalAt = Math.max(0, Number(field.turbulenceMax ?? field.turbulence ?? 0)) > 0 ? now : 0;
  }
  state.events = state.events.filter((event) => event.endAt > now);
  const [intervalMin, intervalMax] = particlePeriodRangeFromFrequencies(field.turbulenceFrequencyMin, field.turbulenceFrequencyMax, 0.08, 0.32);
  const timeMin = Math.max(0.2, Math.min(12, Number(field.turbulenceTimeMin ?? 1.2)));
  const timeMax = Math.max(timeMin, Math.min(12, Number(field.turbulenceTimeMax ?? 4.8)));
  const averageInterval = (intervalMin + intervalMax) / 2;
  const averageDuration = (timeMin + timeMax) / 2;
  const maxEvents = Math.max(1, Math.min(6, Math.ceil(averageDuration / Math.max(0.08, averageInterval)) + 1));
  if (!state.nextAccidentalAt) {
    state.nextAccidentalAt = now + sampleParticleRange(intervalMin, intervalMax, state.eventSeed + 2.7) * 1000;
  }
  let guard = 0;
  while (now >= state.nextAccidentalAt && guard < 8) {
    if (state.events.length < maxEvents) {
      state.events.push(createRoleplayWindEvent(state, field, now, width, height));
    } else {
      state.eventSeed += 1;
    }
    state.nextAccidentalAt += sampleParticleRange(intervalMin, intervalMax, state.eventSeed + 3.9) * 1000;
    guard += 1;
  }
  return state.events;
}

function particleSpawnSeed(seed) {
  return particleHashUnit(seed * 1.913);
}

function roleplaySpawnEdgePosition(spawnConfig, size, seed = 0, radius = 10) {
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const legacySpawnPosition = typeof spawnConfig === "string" ? spawnConfig : "top";
  const spawnEdges = typeof spawnConfig === "string"
    ? particleSpawnEdgesFromPosition(spawnConfig)
    : normalizeParticleSpawnEdges(spawnConfig, defaultParticleSpawnEdges, legacySpawnPosition);
  const first = particleSpawnSeed(seed + 0.11);
  const second = particleSpawnSeed(seed + 3.71);
  const edgePick = particleSpawnSeed(seed + 7.33);
  const edgeOffset = Math.max(10, radius + 8 + second * 18);
  const activeEdges = particleSpawnEdgeOptions
    .map((edge) => {
      const config = spawnEdges[edge.key] || defaultParticleSpawnEdges[edge.key];
      const range = normalizeControlRange(config.range, 0, 100);
      const spanRatio = Math.max(0.01, (range[1] - range[0]) / 100);
      const edgePixels = (edge.key === "top" || edge.key === "bottom") ? width : height;
      return {
        key: edge.key,
        range,
        weight: config.enabled ? Math.max(1, edgePixels * spanRatio) : 0
      };
    })
    .filter((edge) => edge.weight > 0);
  const safeEdges = activeEdges.length > 0 ? activeEdges : [{ key: "top", range: [0, 100], weight: width }];
  const totalWeight = safeEdges.reduce((sum, edge) => sum + edge.weight, 0);
  let cursor = edgePick * totalWeight;
  let selected = safeEdges[0];
  for (const edge of safeEdges) {
    cursor -= edge.weight;
    if (cursor <= 0) {
      selected = edge;
      break;
    }
  }
  const rangeStart = selected.range[0] / 100;
  const rangeEnd = selected.range[1] / 100;
  const along = rangeStart + first * Math.max(0.001, rangeEnd - rangeStart);
  const spawnMeta = {
    edge: selected.key,
    range: selected.range,
    along: Math.round(along * 1000) / 10
  };
  if (selected.key === "bottom") {
    return { x: along * width, y: height + edgeOffset, ...spawnMeta };
  }
  if (selected.key === "left") {
    return { x: -edgeOffset, y: along * height, ...spawnMeta };
  }
  if (selected.key === "right") {
    return { x: width + edgeOffset, y: along * height, ...spawnMeta };
  }
  return { x: along * width, y: -edgeOffset, ...spawnMeta };
}

function roleplayParticleOutsideCanvas(particle, size, marginOverride) {
  const position = particle.getPosition?.() || particle.position;
  if (!position) return false;
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const radius = particle.getRadius?.() || 10;
  const fallbackMargin = Math.max(32, radius * 2.5);
  const margin = Number.isFinite(marginOverride) ? Math.max(0, marginOverride) : fallbackMargin;
  return position.x < -margin
    || position.x > width + margin
    || position.y < -margin
    || position.y > height + margin;
}

function createRoleplayParticleFlowField(normalized) {
  const meta = particlePresetMeta[normalized.preset] || particlePresetMeta.snow;
  const visualProfile = sheetParticleVisualProfile[normalized.preset] || {};
  const activeSpawnEdgeCount = particleSpawnEdgeOptions.filter((edge) => normalized.spawnEdges?.[edge.key]?.enabled).length;
  const entryDirection = activeSpawnEdgeCount > 1
    ? normalized.movementDirection
    : particleSpawnEntryDirection(normalized.spawnPosition, normalized.movementDirection);
  const swayStrength = normalized.preset === "rain"
    ? 0
    : Math.min(100, normalized.turbulenceMax * (0.9 + meta.random) + Math.max(Math.abs(normalized.windAdjustMin), Math.abs(normalized.windAdjustMax)) * 0.34);
  return {
    preset: normalized.preset,
    spawnAngle: particleDirectionAngle(entryDirection),
    spawnPosition: normalized.spawnPosition,
    spawnEdges: normalized.spawnEdges,
    movementAngle: particleDirectionAngle(normalized.movementDirection),
    windAngle: particleDirectionAngle(normalized.windDirection),
    flowStrength: normalized.flowStrength,
    flowStrengthMin: normalized.flowStrengthMin,
    flowStrengthMax: normalized.flowStrengthMax,
    flowFrequencyMin: normalized.flowFrequencyMin,
    flowFrequencyMax: normalized.flowFrequencyMax,
    windStrength: normalized.wind,
    windAdjustMin: normalized.windAdjustMin,
    windAdjustMax: normalized.windAdjustMax,
    shearStrength: normalized.shearStrength,
    movementSpeed: normalized.speed,
    weightScale: normalized.weightScale,
    swayStrength,
    turbulence: normalized.preset === "rain" ? Math.min(10, normalized.turbulenceMax) : normalized.turbulenceMax,
    turbulenceMin: normalized.preset === "rain" ? Math.min(6, normalized.turbulenceMin) : normalized.turbulenceMin,
    turbulenceMax: normalized.preset === "rain" ? Math.min(10, normalized.turbulenceMax) : normalized.turbulenceMax,
    turbulenceFrequencyMin: normalized.turbulenceFrequencyMin,
    turbulenceFrequencyMax: normalized.turbulenceFrequencyMax,
    turbulenceTimeMin: normalized.turbulenceTimeMin,
    turbulenceTimeMax: normalized.turbulenceTimeMax,
    surfaceResponse: Number(visualProfile.surfaceResponse) || 1,
    rainStraightness: normalized.preset === "rain" ? 0.92 : 0
  };
}

function roleplayParticleLeavingCanvas(particle, size, marginOverride) {
  const position = particle.getPosition?.() || particle.position;
  if (!position) return false;
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const radius = particle.getRadius?.() || 10;
  const fallbackMargin = Math.max(32, radius * 2.5);
  const margin = Number.isFinite(marginOverride) ? Math.max(0, marginOverride) : fallbackMargin;
  const velocity = particle.velocity || { x: 0, y: 0 };
  const vx = Number(velocity.x) || 0;
  const vy = Number(velocity.y) || 0;
  // 粒子刚从指定边缘出生时本来就在画布外；只有继续远离画布时才重生，避免卡在出生边缘。
  return (position.x < -margin && vx <= 0)
    || (position.x > width + margin && vx >= 0)
    || (position.y < -margin && vy <= 0)
    || (position.y > height + margin && vy >= 0);
}

function resetRoleplayParticleVelocity(particle, field) {
  let movementAngle = Number(field?.movementAngle ?? field?.spawnAngle ?? 90) * Math.PI / 180;
  const rainStraightness = Math.max(0, Math.min(1, Number(field?.rainStraightness || 0)));
  if (rainStraightness > 0.5) {
    const baseWindAngle = Number(field?.windAngle ?? 0) * Math.PI / 180;
    const windAdjust = ((Number(field?.windAdjustMin ?? 0) + Number(field?.windAdjustMax ?? 0)) / 2) * (1 - rainStraightness * 0.45) * Math.PI / 180;
    const windAngle = baseWindAngle + windAdjust;
    const fallbackFlowStrength = Math.max(0, Math.min(100, Number(field?.flowStrength ?? 0)));
    const flowStrengthMin = Math.max(0, Math.min(100, Number(field?.flowStrengthMin ?? fallbackFlowStrength)));
    const flowStrengthMax = Math.max(flowStrengthMin, Math.min(100, Number(field?.flowStrengthMax ?? fallbackFlowStrength)));
    const flowStrength = ((flowStrengthMin + flowStrengthMax) / 2) / 100;
    const movementWeight = 0.84;
    const windWeight = (0.24 + flowStrength * 0.42) * rainStraightness;
    const x = Math.cos(movementAngle) * movementWeight + Math.cos(windAngle) * windWeight;
    const y = Math.sin(movementAngle) * movementWeight + Math.sin(windAngle) * windWeight;
    if (Math.hypot(x, y) > 0.001) movementAngle = Math.atan2(y, x);
  }
  const movementSpeed = Math.max(0.08, Math.min(2.6, Number(field?.movementSpeed ?? 70) / 70));
  const velocityLength = Math.max(0.36, Math.min(1.32, 0.42 + movementSpeed * 0.34));
  particle.direction = movementAngle;
  if (particle.velocity) {
    particle.velocity.angle = movementAngle;
    particle.velocity.length = velocityLength;
  }
  if (particle.initialVelocity) {
    particle.initialVelocity.angle = movementAngle;
    particle.initialVelocity.length = velocityLength;
  }
  particle.roleplayFlowState = undefined;
}

function parkRoleplayParticleUntilSpawn(particle, container) {
  const size = container?.canvas?.size || {};
  const x = -Math.max(1200, Number(size.width) || 1200) * 2;
  const y = -Math.max(900, Number(size.height) || 900) * 2;
  if (particle.position) {
    particle.position.x = x;
    particle.position.y = y;
  }
  if (particle.initialPosition) {
    particle.initialPosition.x = x;
    particle.initialPosition.y = y;
  }
  if (particle.velocity) {
    particle.velocity.x = 0;
    particle.velocity.y = 0;
    particle.velocity.length = 0;
  }
}

function scheduleRoleplayParticleSpawn(particle, container, delayMs, seedOffset = 0) {
  const now = performance.now();
  particle.roleplaySpawnState = {
    active: false,
    readyAt: now + Math.max(0, Number(delayMs) || 0),
    seedOffset
  };
  particle.roleplayFlowState = undefined;
  parkRoleplayParticleUntilSpawn(particle, container);
}

function resetRoleplayParticleToSpawn(particle, container, options = {}) {
  const field = particle?.options?.move?.path?.options?.roleplayFlowField;
  if (!field) return;
  const resetIndex = Math.max(0, Number(particle.roleplaySpawnResetIndex) || 0) + 1;
  particle.roleplaySpawnResetIndex = resetIndex;
  const seedOffset = Number(options.seedOffset ?? resetIndex * 37.91) || 0;
  const position = roleplaySpawnEdgePosition(
    field.spawnEdges || field.spawnPosition,
    container?.canvas?.size,
    particle.id * 11.37 + seedOffset,
    particle.getRadius?.() || 10
  );
  particle.roleplaySpawnState = {
    active: true,
    readyAt: 0,
    seedOffset
  };
  if (particle.position) {
    particle.position.x = position.x;
    particle.position.y = position.y;
  }
  if (particle.initialPosition) {
    particle.initialPosition.x = position.x;
    particle.initialPosition.y = position.y;
  }
  resetRoleplayParticleVelocity(particle, field);
}

const roleplaySpawnPositionPlugin = {
  id: roleplaySpawnPositionPluginName,
  loadOptions() {},
  needsPlugin(options) {
    return Boolean(options?.particles?.move?.path?.options?.roleplayFlowField?.spawnPosition);
  },
  async getPlugin(container) {
    return {
      particlePosition(position, particle) {
        if (position) return undefined;
        const field = particle?.options?.move?.path?.options?.roleplayFlowField;
        if (!field) return undefined;
        const state = roleplayWindFieldState(container);
        const interval = Math.max(24, Number(field.spawnIntervalMs) || 90);
        const queuedAt = Math.max(performance.now(), Number(state?.nextSpawnAt) || performance.now());
        if (state) state.nextSpawnAt = queuedAt + interval;
        scheduleRoleplayParticleSpawn(
          particle,
          container,
          queuedAt - performance.now() + particleHashUnit((Number(particle.id) || 1) * 2.17) * interval * 0.75,
          particle.id
        );
        return {
          x: -Math.max(1200, Number(container.canvas.size?.width) || 1200) * 2,
          y: -Math.max(900, Number(container.canvas.size?.height) || 900) * 2
        };
      },
      particleUpdate(particle) {
        const field = particle?.options?.move?.path?.options?.roleplayFlowField;
        const spawnState = particle.roleplaySpawnState;
        if (field && spawnState && !spawnState.active) {
          if (performance.now() >= spawnState.readyAt) {
            resetRoleplayParticleToSpawn(particle, container, { seedOffset: spawnState.seedOffset });
          } else {
            parkRoleplayParticleUntilSpawn(particle, container);
          }
          return;
        }
        if (field && roleplayParticleLeavingCanvas(particle, container.canvas.size)) {
          const state = roleplayWindFieldState(container);
          const interval = Math.max(24, Number(field.spawnIntervalMs) || 90);
          const queuedAt = Math.max(performance.now(), Number(state?.nextSpawnAt) || performance.now());
          if (state) state.nextSpawnAt = queuedAt + interval;
          scheduleRoleplayParticleSpawn(
            particle,
            container,
            queuedAt - performance.now() + particleHashUnit((Number(particle.id) || 1) * 3.41 + queuedAt * 0.001) * interval * 0.8,
            queuedAt * 0.019
          );
        }
      },
      particleBounce(particle) {
        const field = particle?.options?.move?.path?.options?.roleplayFlowField;
        if (!field) return false;
        const spawnState = particle.roleplaySpawnState;
        if (spawnState && !spawnState.active) {
          parkRoleplayParticleUntilSpawn(particle, container);
          return true;
        }
        if (roleplayParticleLeavingCanvas(particle, container.canvas.size, particle.getRadius?.() || 0)) {
          scheduleRoleplayParticleSpawn(particle, container, Number(field.spawnIntervalMs) || 90, performance.now() * 0.017);
        }
        // 使用 bounce 模式只为阻止引擎删除粒子，真正的重生位置仍由出现方位控制。
        return true;
      }
    };
  }
};

// 自定义路径生成器只模拟连续气流：标准风方向微调、风切变和不遵循标准风向的意外风，不再使用局部圆形力场。
const roleplayFlowPathGenerator = {
  init(container) {
    roleplayWindFieldState(container);
  },
  reset(particle) {
    if (particle) particle.roleplayFlowState = undefined;
  },
  update() {},
  generate(particle, delta) {
    const field = particle?.options?.move?.path?.options?.roleplayFlowField;
    if (!field) return { x: 0, y: 0, z: 0 };

    const canvas = particle.container?.canvas?.size || {};
    const width = Math.max(1, Number(canvas.width) || 1);
    const height = Math.max(1, Number(canvas.height) || 1);
    const span = Math.max(width, height);
    const position = particle.getPosition?.() || particle.position || { x: 0, y: 0 };
    const movementAngle = Number(field.movementAngle ?? field.spawnAngle ?? 90) * Math.PI / 180;
    const baseWindAngle = Number(field.windAngle ?? 0) * Math.PI / 180;
    const movement = { x: Math.cos(movementAngle), y: Math.sin(movementAngle) };
    const baseMain = { x: Math.cos(baseWindAngle), y: Math.sin(baseWindAngle) };
    const baseSide = { x: -baseMain.y, y: baseMain.x };
    const along = (position.x * baseMain.x + position.y * baseMain.y) / span;
    const cross = (position.x * baseSide.x + position.y * baseSide.y) / span;
    const crossOffset = Math.max(-1, Math.min(1, cross * 2 - 1));
    const ranges = roleplayStandardWindRanges(field);
    const shear = Math.max(-1, Math.min(1, Number(field.shearStrength || 0) / 100));
    const sway = Math.max(0, Math.min(1, Number(field.swayStrength || 0) / 100));
    const movementSpeed = Math.max(0.08, Math.min(2.6, Number(field.movementSpeed ?? 70) / 70));
    const movementPower = Math.min(2.35, Math.pow(movementSpeed, 1.16));
    const turbulenceFrequencyMin = Math.max(particleFrequencyControlMin, Math.min(particleFrequencyControlMax, Number(field.turbulenceFrequencyMin ?? 0.08)));
    const turbulenceFrequencyMax = Math.max(turbulenceFrequencyMin, Math.min(particleFrequencyControlMax, Number(field.turbulenceFrequencyMax ?? 0.32)));
    const rainStraightness = Math.max(0, Math.min(1, Number(field.rainStraightness || 0)));
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const flowState = particle.roleplayFlowState && typeof particle.roleplayFlowState === "object" ? particle.roleplayFlowState : {};
    const deltaSeconds = particleFrameDeltaSeconds(flowState, now, delta);
    flowState.now = now;
    particle.roleplayFlowState = flowState;
    const standardWind = readRoleplayStandardWind(particle.container, field, now);
    const flowStrength = standardWind.strength;
    const flowPower = flowStrength / 100;
    const windFlow = smoothParticleStep(flowPower);
    const flowScale = Math.max(0.12, Math.min(1.5, flowStrength / 70));
    const windAdjustAngle = standardWind.adjustDegrees * (1 - rainStraightness * 0.45) * Math.PI / 180;
    const windAngle = baseWindAngle + windAdjustAngle;
    const main = { x: Math.cos(windAngle), y: Math.sin(windAngle) };
    const side = { x: -main.y, y: main.x };
    const accidentalEvents = updateRoleplayWindEvents(particle.container, field, now, width, height);
    const accidentalVector = accidentalEvents.reduce((sum, event) => {
      const distanceRatio = Math.hypot(position.x - event.x, position.y - event.y) / event.radius;
      if (!Number.isFinite(distanceRatio) || distanceRatio >= 1) return sum;
      // 意外风是局部风团，不应只有中心点可见；使用较缓的距离衰减，让边缘区域也能被风带到。
      const falloff = Math.pow(Math.max(0, 1 - distanceRatio), 0.52);
      const envelope = roleplayWindEventEnvelope(event, now);
      const particleLocalVariation = 0.86 + 0.14 * particleHashUnit(event.id * 4.97 + particle.id * 0.379);
      const power = event.strength * falloff * envelope * particleLocalVariation;
      if (power > 0.001) event.hits += 1;
      return {
        x: sum.x + Math.cos(event.angle) * power,
        y: sum.y + Math.sin(event.angle) * power
      };
    }, { x: 0, y: 0 });
    const limitedAccidentalVector = limitParticleVector(accidentalVector, 1.15);
    const accidentalStrength = particleVectorLength(limitedAccidentalVector);
    const [accidentalPeriodMin, accidentalPeriodMax] = particlePeriodRangeFromFrequencies(turbulenceFrequencyMin, turbulenceFrequencyMax, 0.08, 0.32);
    const accidentalWavePeriod = sampleParticleRange(accidentalPeriodMin, accidentalPeriodMax, particle.id * 1.371 + 9.1);
    const accidentalWaveFrequency = 1 / Math.max(particlePeriodControlMin, accidentalWavePeriod);
    const accidentalPhase = now * 0.001 * Math.PI * 2 * Math.max(standardWind.frequency, accidentalWaveFrequency) + particle.id * 0.73;
    const swayWave = (
      Math.sin(accidentalPhase * 0.82 + along * 8.2 + particle.id * 0.37)
      + Math.sin(accidentalPhase * 0.54 - cross * 6.8 + particle.id * 0.21) * 0.42
    ) / 1.42;
    const velocity = particle.velocity || { x: main.x, y: main.y };

    // tsParticles 的 path 返回值会被逐帧 addTo(velocity)，所以这里返回“转向修正量”而不是持续风力。
    // 运动方向只保留粒子出生后的惯性；风向是独立目标方向，风力越强，目标速度越靠近风向。
    const hasStandardWind = ranges.flowStrengthMax > 0.5;
    const windPresence = hasStandardWind ? 1 : 0;
    const persistentWindCarry = windPresence * (0.12 + Math.min(0.38, Math.max(ranges.flowStrengthMin, ranges.flowStrengthMax * 0.18) / 100 * 0.50));
    const movementCarry = (0.08 + 0.42 * movementPower) * Math.max(0.20, 0.54 - 0.18 * windFlow - 0.08 * windPresence) + 0.018 * (1 - rainStraightness);
    const windCarry = persistentWindCarry + windFlow * (0.42 + 0.62 * windFlow);
    const shearAlong = shear * crossOffset * (0.025 + 0.115 * Math.max(windFlow, persistentWindCarry));
    const stableAlong = windCarry + shearAlong;
    const stableSide = sway * swayWave * (0.035 + 0.11 * Math.max(windFlow, persistentWindCarry)) * (1 - rainStraightness);
    const accidentalCarry = (0.08 + 0.56 * (1 - rainStraightness)) * (1 - rainStraightness * 0.45);
    const stableWindComponent = smoothParticleVectorComponent(flowState, "stableWind", {
      x: main.x * stableAlong + side.x * stableSide,
      y: main.y * stableAlong + side.y * stableSide
    }, deltaSeconds, 0.92, 1.48);
    const accidentalWindComponent = smoothParticleVectorComponent(flowState, "accidentalWind", {
      x: limitedAccidentalVector.x * accidentalCarry,
      y: limitedAccidentalVector.y * accidentalCarry
    }, deltaSeconds, 0.62, 1.26);
    const targetLimit = 0.74 + windFlow * 0.78 + Math.min(1.6, movementPower) * 0.34 + accidentalStrength * 0.20;
    const target = smoothParticleVectorComponent(flowState, "targetVelocity", limitParticleVector({
      x: movement.x * movementCarry + stableWindComponent.x + accidentalWindComponent.x,
      y: movement.y * movementCarry + stableWindComponent.y + accidentalWindComponent.y
    }, targetLimit), deltaSeconds, 0.42, 0.74);
    const cappedVelocity = limitParticleVector(velocity, targetLimit * 1.32);
    if (cappedVelocity !== velocity) {
      velocity.x = cappedVelocity.x;
      velocity.y = cappedVelocity.y;
    }
    const steeringSeconds = Math.max(0.18, 0.44 - 0.09 * windFlow - 0.04 * Math.min(1.4, movementPower) - 0.016 * flowScale);
    const steering = 1 - Math.exp(-deltaSeconds / steeringSeconds);
    const vx = (target.x - velocity.x) * steering;
    const vy = (target.y - velocity.y) * steering;

    return { x: vx, y: vy, z: 0 };
  }
};

function loadParticlesEngineOnce() {
  if (!particlesEnginePromise) {
    particlesEnginePromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
      await engine.addPlugin(roleplaySpawnPositionPlugin, false);
      await engine.addPathGenerator(roleplayFlowPathGeneratorName, roleplayFlowPathGenerator, false);
    }).then(() => {
      particlesEngineReady = true;
    });
  }
  return particlesEnginePromise;
}

function useParticlesEngineReady() {
  const [ready, setReady] = useState(particlesEngineReady);
  useEffect(() => {
    if (particlesEngineReady) {
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    loadParticlesEngineOnce()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        console.error("初始化 tsParticles 失败", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}

function particleShapeOptions(layer) {
  const sprite = particleSpriteMap[layer.preset] || particleSpriteMap.snow;
  return {
    type: "image",
    options: {
      image: {
        ...sprite,
        src: particleSpriteVersionedSrc(sprite.src),
        replaceColor: false,
        gif: false
      }
    }
  };
}

function createTsParticlesOptions(layer, layerKey) {
  const normalized = normalizeParticleLayer(layer, defaultParticleLayers[layerKey] || defaultParticleLayers.back);
  const meta = particlePresetMeta[normalized.preset] || particlePresetMeta.snow;
  const sprite = particleSpriteMap[normalized.preset] || particleSpriteMap.snow;
  const preloadSprites = [{ ...sprite, gif: false, replaceColor: false }];
  const count = particleCountForLayer(normalized, layerKey);
  const opacity = Math.max(0, Math.min(1, normalized.opacity / 100));
  const flowField = createRoleplayParticleFlowField(normalized);
  flowField.spawnIntervalMs = roleplayParticleSpawnIntervalMs(count);
  // tsParticles 的 speed 只保留基础位移倍率，用户的“运动速度”交给路径场中的运动方向分量处理。
  const presetSpeedFactor = normalized.preset === "rain" ? 0.96 : 0.86;
  const speed = meta.baseSpeed * presetSpeedFactor * (0.88 + normalized.flowStrength / 260);
  const drift = 0;
  const maxParticleSize = clampNumber(normalized.size, particleSizeControlMin, particleSizeControlMax, 12);
  const minParticleSize = Math.max(1, maxParticleSize * ((meta.size?.[0] || 1) / Math.max(1, meta.size?.[1] || maxParticleSize)));
  const activeSpawnEdgeCount = particleSpawnEdgeOptions.filter((edge) => normalized.spawnEdges?.[edge.key]?.enabled).length;
  const entryDirection = activeSpawnEdgeCount > 1
    ? normalized.movementDirection
    : particleSpawnEntryDirection(normalized.spawnPosition, normalized.movementDirection);
  // 出现方位、运动方向和风向互相独立；雨也接受主风影响，但会削弱扰动以保持统一斜线，不做歪七扭八的随机路径。
  const enablePathField = [
    normalized.flowStrengthMax > 1,
    Math.abs(normalized.windAdjustMin) > 0.5,
    Math.abs(normalized.windAdjustMax) > 0.5,
    Math.abs(normalized.windAdjustMax - normalized.windAdjustMin) > 0.5,
    Math.abs(normalized.shearStrength) > 1,
    flowField.swayStrength > 1,
    normalized.turbulenceMax > 4,
    Math.abs(normalized.speed - 70) > 1
  ].some(Boolean);
  return {
    autoPlay: true,
    background: { color: { value: "transparent" } },
    detectRetina: true,
    fpsLimit: 60,
    fullScreen: { enable: false },
    pauseOnBlur: false,
    pauseOnOutsideViewport: false,
    smooth: true,
    preload: preloadSprites,
    particles: {
      color: { value: meta.color },
      move: {
        attract: { enable: false },
        decay: 0,
        direction: particleTsDirectionMap[entryDirection] || "bottom",
        drift,
        enable: true,
        outModes: { default: "bounce" },
        path: {
          clamp: false,
          delay: { value: 0 },
          enable: enablePathField,
          generator: roleplayFlowPathGeneratorName,
          options: {
            roleplayFlowField: flowField
          }
        },
        random: false,
        speed: { min: speed * (normalized.preset === "rain" ? 0.82 : 0.58), max: speed * (normalized.preset === "rain" ? 1.08 : 1.36) },
        spin: {
          acceleration: 0,
          enable: false
        },
        straight: true,
        vibrate: false,
        warp: true
      },
      number: {
        density: {
          enable: true,
          width: 1200,
          height: 780
        },
        limit: { mode: "delete", value: count + 24 },
        value: count
      },
      opacity: {
        value: { min: opacity * (normalized.preset === "rain" ? 0.22 : 0.36), max: opacity }
      },
      reduceDuplicates: false,
      rotate: {
        animation: {
          enable: false,
          speed: 0,
          sync: true
        },
        path: normalized.preset === "rain",
        value: normalized.preset === "rain" ? particleSpriteRotationOffset() : 0
      },
      shape: particleShapeOptions(normalized),
      size: {
        animation: { enable: false },
        value: {
          min: minParticleSize,
          max: maxParticleSize
        }
      }
    },
    interactivity: {
      detectsOn: "canvas",
      events: {
        onClick: { enable: false },
        onHover: { enable: false },
        resize: true
      }
    },
    style: {
      pointerEvents: "none"
    }
  };
}

const threeSheetParticleVertexShader = `
  attribute vec3 instanceOffset;
  attribute vec2 instanceScale;
  attribute vec4 instanceAngles;
  attribute vec4 instanceSurface;
  attribute vec4 instancePoseWeights;
  attribute vec4 instanceWeight;
  attribute vec4 instanceFlow;
  attribute vec4 instanceMassModel;
  attribute vec4 instanceMassTensor;
  attribute vec4 instanceShapeModel;
  attribute vec4 instanceLightDeform;
  attribute vec4 sheetShape;
  attribute float sheetFace;
  varying vec2 vUv;
  varying float vOpacity;
  varying float vShade;
  varying float vLight;
  varying float vFacing;
  varying vec2 vLocal;
  varying float vDepthShade;
  varying float vEdgeLift;
  varying vec4 vPoseWeights;
  varying vec2 vWindLocal;
  varying float vTiltAmount;
  varying float vCurveDepth;
  varying float vFacingSigned;
  varying float vLongFlip;
  varying float vCrossFlip;
  varying float vSideRim;
  varying float vSheetFace;

  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
  }

  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
  }

  mat3 rotateZ(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
  }

  mat2 rotate2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, s, -s, c);
  }

  vec2 limitVector2(vec2 value, float maxLength) {
    float currentLength = length(value);
    if (currentLength <= maxLength || currentLength <= 0.0001) return value;
    return value * (maxLength / currentLength);
  }

  void main() {
    vec2 unit = position.xy;
    vec2 local = unit * instanceScale;
    float bodyRoll = instanceAngles.x;
    float longitudinal = smoothstep(-0.50, 0.50, unit.y);
    float edge = smoothstep(0.08, 0.50, abs(unit.x));
    float stiffness = max(0.35, instanceWeight.z);
    float edgeFlex = max(0.35, instanceWeight.w);
    float bend = instanceSurface.y * edgeFlex / stiffness;
    float curl = instanceSurface.z * edgeFlex / stiffness;
    float twist = instanceAngles.w * edgeFlex / max(0.45, stiffness);
    float shapeModelResponse = clamp(instanceShapeModel.z, 0.58, 1.92);
    float shapeModelConfidence = clamp(instanceShapeModel.w, 0.0, 1.0);
    float shapePresence = clamp(sheetShape.x, 0.0, 1.0);
    float shapeDragDensity = clamp(sheetShape.y, 0.0, 1.5);
    float shapeEdge = clamp(sheetShape.z, 0.0, 1.5);
    float shapeMobility = clamp(sheetShape.w, 0.20, 2.40);
    float visibleShape = smoothstep(0.12, 0.58, shapePresence);
    mat2 worldToBody = rotate2D(-bodyRoll);
    vec2 lightDeformVector = worldToBody * instanceLightDeform.xy;
    float lightDeformLift = clamp(instanceLightDeform.z, 0.0, 1.45);
    float lightDeformPulse = clamp(instanceLightDeform.w, -1.0, 1.0);
    float explicitLightDrive = length(lightDeformVector);
    vec2 flowDirection = normalize(worldToBody * instanceFlow.xy + vec2(0.0001, 0.0));
    vec2 explicitLightDirection = explicitLightDrive > 0.001 ? lightDeformVector / explicitLightDrive : flowDirection;
    float longitudinalLever = pow(longitudinal, 1.45);
    float edgeLever = edge * edge;
    float flowPressure = clamp(instanceFlow.z, 0.0, 1.6);
    float massContrast = clamp(instanceFlow.w, 0.0, 1.0);
    vec2 massCenter = clamp(instanceMassModel.xy, vec2(-0.32, -0.38), vec2(0.32, 0.38));
    vec2 dragCenter = clamp(instanceMassModel.zw, vec2(-0.32, -0.38), vec2(0.32, 0.38));
    vec2 leverFromMass = unit - massCenter;
    float covXX = max(0.0012, instanceMassTensor.x);
    float covXY = clamp(instanceMassTensor.y, -0.08, 0.08);
    float covYY = max(0.0012, instanceMassTensor.z);
    float determinant = max(0.00008, covXX * covYY - covXY * covXY);
    float tensorDistance = sqrt(max(0.0, (
      covYY * leverFromMass.x * leverFromMass.x
      - 2.0 * covXY * leverFromMass.x * leverFromMass.y
      + covXX * leverFromMass.y * leverFromMass.y
    ) / determinant));
    float continuousMobility = smoothstep(0.70, 2.65, tensorDistance) * clamp(instanceMassTensor.w, 0.58, 1.84);
    float alongWind = dot(leverFromMass, flowDirection);
    float downwindSide = smoothstep(-0.08, 0.48, alongWind);
    vec2 windCrossDirection = vec2(-explicitLightDirection.y, explicitLightDirection.x);
    float shapeDownwind = smoothstep(-0.20, 0.62, dot(leverFromMass, explicitLightDirection));
    float shapeCrossLever = smoothstep(0.02, 0.46, abs(dot(leverFromMass, windCrossDirection)));
    float shapeAnchor = (1.0 - shapeDownwind) * (0.62 + (1.0 - min(1.0, shapeEdge)) * 0.28);
    float shapeCoverage = visibleShape * (0.64 + min(shapeDragDensity, 1.0) * 0.36);
    float localShapeMobility = clamp(
      shapeCoverage
        * shapeMobility
        * (0.44 + shapeEdge * 0.52 + shapeDownwind * 0.38 + shapeCrossLever * 0.14)
        * (0.62 + continuousMobility * 0.34)
        * shapeModelResponse
        * (0.80 + shapeModelConfidence * 0.20),
      0.0,
      1.45
    );
    float localFlexMask = clamp(
      continuousMobility * downwindSide * (0.36 + edge * 0.58 + abs(unit.y) * 0.22) * (0.44 + lightDeformLift * 0.42),
      0.0,
      1.0
    );
    float windShapeManifold = clamp(
      localShapeMobility
        * (0.52 + shapeDownwind * 0.48)
        * (0.78 + shapeDragDensity * 0.24)
        * (0.82 + edge * 0.10),
      0.0,
      1.18
    );
    float lightSurfaceMask = clamp(localShapeMobility * (0.26 + shapeEdge * 0.28 + shapeDownwind * 0.20), 0.0, 0.98);
    float lightSideLift = lightDeformLift * lightSurfaceMask * (0.38 + edge * 0.18 + shapeEdge * 0.20)
      + lightDeformLift * windShapeManifold * (0.32 + edge * 0.18);
    float zCurve = (
      longitudinalLever * bend * 0.68
      + unit.x * curl * 0.36
      + unit.x * (longitudinal - 0.34) * twist * 0.34
      + edgeLever * bend * 0.24
      + lightSideLift * 0.42
      + dot(unit - massCenter, explicitLightDirection) * lightDeformLift * lightSurfaceMask * 0.14
      + dot(unit - massCenter, explicitLightDirection) * lightDeformLift * windShapeManifold * 0.18
      + lightDeformPulse * lightSurfaceMask * edge * 0.055
      + lightDeformPulse * windShapeManifold * (0.040 + edge * 0.032)
      + alongWind * flowPressure * massContrast * 0.048
    ) * instanceScale.y;
    // 轮廓层仍然锁定主体尺寸，但允许一个很小的受限弯面深度进入三维投影。
    // 上一版完全隔离 zCurve 后，画面只剩二维压缩，看不到真实翻起。
    // 这里的深度被限制在贴图高度的一小段，只制造弯面视差，不再沿风向拉伸透明边缘。
    float curveLimit = instanceScale.y * (0.18 + min(0.16, flowPressure * 0.070 + lightDeformLift * 0.060));
    float visibleCurveZ = clamp(zCurve * 0.92, -curveLimit, curveLimit);
    float sheetThickness = min(instanceScale.x, instanceScale.y) * (0.024 + 0.024 * flowPressure);
    vec3 p = vec3(local.x, local.y, visibleCurveZ + sheetFace * sheetThickness);
    // 这里才是真正的薄片三维姿态：yaw 绕花瓣长轴翻起，pitch 绕横轴俯仰。
    // 旧版最大角度不到九十度，背面几乎不会进入相机，肉眼仍像单张平面贴图。
    // tanh 让角度接近极限时自然变缓，同时允许少量越过 90 度显示背面。
    float yawDrive = instanceAngles.y * 3.20 + lightDeformVector.x * 0.16;
    float pitchDrive = instanceAngles.z * 2.55 - lightDeformVector.y * 0.10;
    float yawBase = 1.10 * tanh(yawDrive);
    // 翻面强度只能来自当前真实气流，不再按固定“少数触发/低频触发”处理。
    // 横向风载越强、整体风压越大、轻部抬升越明显、形状质量差异越明显，才会更接近背面。
    float sideWindLoad = abs(lightDeformVector.x) * (0.58 + flowPressure * 0.28);
    float surfaceWindLoad = flowPressure * (0.36 + lightDeformLift * 0.26);
    float windFlipDrive = clamp(pow(max(0.0, sideWindLoad + surfaceWindLoad + massContrast * 0.12), 1.12), 0.0, 1.0);
    float yawFlip = 1.76 * tanh(yawDrive * (1.12 + windFlipDrive * 0.72));
    float visualYaw = mix(yawBase, yawFlip, windFlipDrive);
    float visualPitch = 0.94 * tanh(pitchDrive);
    mat3 surfaceTilt = rotateY(visualYaw) * rotateX(visualPitch);
    mat3 bodyRotation = rotateZ(bodyRoll);
    p = bodyRotation * surfaceTilt * p;
    vec3 localNormal = normalize(vec3(
      -curl * 0.42 - unit.x * bend * 0.24 - twist * (longitudinal - 0.34) * 0.26,
      -bend * (0.36 + longitudinal * 0.58),
      1.0
    ));
    localNormal.xy -= explicitLightDirection * lightDeformLift * lightSurfaceMask * 0.24;
    localNormal.xy -= explicitLightDirection * lightDeformLift * windShapeManifold * 0.26;
    localNormal = normalize(localNormal * sheetFace);
    vec3 surfaceNormal = normalize(bodyRotation * surfaceTilt * localNormal);
    vec3 lightDirection = normalize(vec3(-0.22, 0.38, 0.90));

    vUv = uv;
    vOpacity = instanceSurface.x;
    vShade = instanceSurface.w;
    vFacing = abs(surfaceNormal.z);
    vLight = clamp(dot(surfaceNormal, lightDirection) * 0.5 + 0.5, 0.34, 1.0);
    vLocal = unit;
    vDepthShade = clamp(0.52 + zCurve / max(1.0, instanceScale.y * 0.42), 0.0, 1.0);
    vEdgeLift = clamp(edge * (abs(bend) + abs(curl) + abs(twist) + explicitLightDrive * 1.12 + lightDeformLift * 0.64) * 1.54, 0.0, 1.0);
    vPoseWeights = instancePoseWeights;
    vWindLocal = explicitLightDirection;
    vTiltAmount = clamp(1.0 - abs(surfaceNormal.z), 0.0, 1.0);
    vCurveDepth = clamp(0.50 + visibleCurveZ / max(1.0, instanceScale.y * 0.22), 0.0, 1.0);
    vFacingSigned = surfaceNormal.z;
    vLongFlip = abs(sin(visualYaw));
    vCrossFlip = abs(sin(visualPitch));
    vSideRim = clamp((smoothstep(0.14, 0.50, abs(unit.x)) * vLongFlip + smoothstep(0.22, 0.50, abs(unit.y)) * vCrossFlip) * (0.42 + vTiltAmount * 0.72), 0.0, 1.0);
    vSheetFace = sheetFace;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + instanceOffset, 1.0);
  }
`;

const threeSheetParticleFragmentShader = `
  uniform sampler2D map;
  uniform vec3 tintColor;
  uniform float tintStrength;
  uniform float colorLift;
  uniform float colorSaturation;
  uniform float shadeStrength;
  uniform float alphaBoost;
  uniform vec2 atlasUvPad;
  varying vec2 vUv;
  varying float vOpacity;
  varying float vShade;
  varying float vLight;
  varying float vFacing;
  varying vec2 vLocal;
  varying float vDepthShade;
  varying float vEdgeLift;
  varying vec4 vPoseWeights;
  varying vec2 vWindLocal;
  varying float vTiltAmount;
  varying float vCurveDepth;
  varying float vFacingSigned;
  varying float vLongFlip;
  varying float vCrossFlip;
  varying float vSideRim;
  varying float vSheetFace;

  vec4 samplePose(float poseIndex) {
    vec2 paddedUv = clamp(vUv, vec2(0.006, 0.006), vec2(0.994, 0.994));
    vec2 cellUv = atlasUvPad + paddedUv * max(vec2(0.01, 0.01), vec2(1.0, 1.0) - atlasUvPad * 2.0);
    return texture2D(map, vec2((cellUv.x + poseIndex) * 0.25, cellUv.y));
  }

  void main() {
    vec4 basePose = samplePose(0.0);
    vec4 leftPose = samplePose(1.0);
    vec4 rightPose = samplePose(2.0);
    vec4 foldPose = samplePose(3.0);
    // 多姿态贴图只改变内部颜色和明暗，不再用不同姿态的 alpha 替换外轮廓。
    // 这样翻面不会突然把单片花瓣变成另一张窄长贴图。
    float alpha = basePose.a;
    if (alpha < 0.045) discard;
    // 姿态素材重新参与内部明暗，但 alpha 永远来自基础轮廓。
    // 当某个姿态素材在该 UV 处透明时，退回基础色，避免透明边缘颜色被采样成脏刺。
    float leftMask = smoothstep(0.035, 0.22, leftPose.a);
    float rightMask = smoothstep(0.035, 0.22, rightPose.a);
    float foldMask = smoothstep(0.035, 0.22, foldPose.a);
    vec3 leftColor = mix(basePose.rgb, leftPose.rgb, leftMask);
    vec3 rightColor = mix(basePose.rgb, rightPose.rgb, rightMask);
    vec3 foldColor = mix(basePose.rgb, foldPose.rgb, foldMask);
    float poseWeightTotal = max(0.001, vPoseWeights.x + vPoseWeights.y + vPoseWeights.z + vPoseWeights.w);
    vec3 poseColor = (
      basePose.rgb * vPoseWeights.x
      + leftColor * vPoseWeights.y
      + rightColor * vPoseWeights.z
      + foldColor * vPoseWeights.w
    ) / poseWeightTotal;
    float poseStrength = clamp(vPoseWeights.y + vPoseWeights.z + vPoseWeights.w, 0.0, 1.0);
    vec3 mixedColor = mix(basePose.rgb, poseColor, poseStrength);
    float edgeClean = smoothstep(0.10, 0.56, alpha);
    mixedColor = mix(tintColor, mixedColor, edgeClean);
    float backFace = step(vSheetFace, 0.0);
    float faceShade = mix(1.0, 0.82, backFace);
    float lightShade = mix(0.88, 1.16, vLight);
    float facingAlpha = mix(0.42, 1.0, smoothstep(0.08, 0.82, vFacing));
    float tiltAmount = 1.0 - smoothstep(0.24, 0.92, vFacing);
    float tiltShade = mix(1.0, 0.82, tiltAmount);
    float curvatureShade = mix(0.985, 1.075, vDepthShade);
    float softRim = smoothstep(0.16, 0.50, abs(vLocal.x)) * vEdgeLift;
    vec2 windLocal = normalize(vWindLocal + vec2(0.0001, 0.0));
    float windSide = dot(vLocal, windLocal);
    float windBand = smoothstep(-0.42, 0.58, windSide);
    float foldCue = smoothstep(0.16, 0.72, abs(windSide)) * vTiltAmount;
    float curveLight = mix(0.72, 1.28, vCurveDepth);
    float underside = smoothstep(0.18, -0.18, vFacingSigned);
    float foldRidge = (1.0 - smoothstep(0.00, 0.34, abs(windSide - 0.10))) * (0.18 + tiltAmount * 0.34) * (0.22 + vEdgeLift * 0.30);
    float leeRidge = (1.0 - smoothstep(0.00, 0.42, abs(windSide + 0.46))) * (0.14 + tiltAmount * 0.28) * (0.18 + vEdgeLift * 0.24);
    float longAxisCue = (1.0 - smoothstep(0.00, 0.105, abs(vLocal.x))) * vLongFlip * tiltAmount;
    float crossAxisCue = (1.0 - smoothstep(0.00, 0.130, abs(vLocal.y))) * vCrossFlip * tiltAmount;
    float foldAxisCue = max(longAxisCue, crossAxisCue * 0.72);
    float silhouetteBand = smoothstep(0.055, 0.17, alpha) * (1.0 - smoothstep(0.28, 0.58, alpha));
    float sideThicknessCue = silhouetteBand * vSideRim * smoothstep(0.16, 0.82, tiltAmount);
    float axisSide = clamp(windSide, -1.0, 1.0);
    float axisVolume = axisSide * (vLongFlip * 0.34 + vCrossFlip * 0.18) * smoothstep(0.16, 0.84, tiltAmount);
    float liftedSurface = mix(curvatureShade * curveLight, 1.18, softRim * (0.38 + tiltAmount * 0.48));
    float windSurfaceShade = mix(0.78, 1.24, windBand) * mix(1.0, 1.18, foldCue + foldRidge * 0.40);
    float shade = mix(1.0, vShade * faceShade * lightShade * tiltShade * windSurfaceShade, shadeStrength);
    vec3 color = mixedColor * shade * liftedSurface;
    color = mix(color, vec3(0.98, 0.66, 0.81), underside * (0.34 + tiltAmount * 0.28) + leeRidge * 0.20);
    color = mix(color, vec3(1.0, 0.94, 0.982), tiltAmount * 0.16 + foldCue * 0.10 + softRim * 0.08 + foldRidge * 0.13 + foldAxisCue * 0.28);
    color *= 1.0 + axisVolume * 0.18;
    color = mix(color, vec3(0.96, 0.60, 0.77), max(0.0, -axisVolume) * 0.24);
    color = mix(color, vec3(1.0, 0.96, 0.988), max(0.0, axisVolume) * 0.18);
    color = mix(color, vec3(0.98, 0.62, 0.78), sideThicknessCue * 0.58);
    color = mix(color, tintColor, tintStrength);
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = clamp(mix(vec3(luma), color, colorSaturation) * colorLift, 0.0, 1.0);
    float finalAlpha = min(0.98, pow(alpha, 1.08) * edgeClean * vOpacity * facingAlpha * alphaBoost + sideThicknessCue * vOpacity * 0.12);
    gl_FragColor = vec4(color * finalAlpha, finalAlpha);
  }
`;

function bleedTransparentAtlasPixels(context, width, height, options = {}) {
  const alphaThreshold = Math.max(1, Math.min(48, Number(options.alphaThreshold) || 10));
  const iterations = Math.max(1, Math.min(12, Number(options.iterations) || 7));
  let imageData = context.getImageData(0, 0, width, height);
  let current = new Uint8ClampedArray(imageData.data);
  const stride = width * 4;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Uint8ClampedArray(current);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * stride + x * 4;
        if (current[index + 3] >= alphaThreshold) continue;
        let red = 0;
        let green = 0;
        let blue = 0;
        let weight = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = y + offsetY;
          if (sampleY < 0 || sampleY >= height) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const sampleX = x + offsetX;
            if (sampleX < 0 || sampleX >= width) continue;
            const sampleIndex = sampleY * stride + sampleX * 4;
            const alpha = current[sampleIndex + 3];
            if (alpha < alphaThreshold) continue;
            const sampleWeight = alpha / 255;
            red += current[sampleIndex] * sampleWeight;
            green += current[sampleIndex + 1] * sampleWeight;
            blue += current[sampleIndex + 2] * sampleWeight;
            weight += sampleWeight;
          }
        }
        if (weight <= 0) continue;
        next[index] = red / weight;
        next[index + 1] = green / weight;
        next[index + 2] = blue / weight;
        // 只扩散透明像素的颜色，不扩张 alpha，避免把贴图轮廓变粗。
        next[index + 3] = current[index + 3];
      }
    }
    current = next;
  }
  imageData.data.set(current);
  context.putImageData(imageData, 0, 0);
}

function createThinSheetParticleGeometry(segmentsX = 10, segmentsY = 16) {
  const columns = Math.max(1, Math.floor(segmentsX));
  const rows = Math.max(1, Math.floor(segmentsY));
  const verticesPerFace = (columns + 1) * (rows + 1);
  const positions = [];
  const uvs = [];
  const sheetFaces = [];
  const indices = [];
  const appendFace = (faceSign) => {
    const baseIndex = positions.length / 3;
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        positions.push(u - 0.5, v - 0.5, 0);
        uvs.push(u, v);
        sheetFaces.push(faceSign);
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = baseIndex + row * (columns + 1) + column;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        if (faceSign > 0) {
          indices.push(a, b, d, a, d, c);
        } else {
          indices.push(a, d, b, a, c, d);
        }
      }
    }
  };
  appendFace(1);
  appendFace(-1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("sheetFace", new THREE.Float32BufferAttribute(sheetFaces, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.userData = { verticesPerFace };
  return geometry;
}

function loadThreeSheetPoseAtlasTexture(sprites, renderer) {
  return Promise.all(sprites.map((sprite) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve({ sprite, image });
    image.onerror = () => reject(new Error(`三维粒子姿态贴图加载失败：${sprite.src}`));
    image.src = particleSpriteVersionedSrc(sprite.src);
  }))).then((entries) => {
    const cellWidth = Math.max(...entries.map(({ sprite, image }) => Number(sprite.width) || image.naturalWidth || 64));
    const cellHeight = Math.max(...entries.map(({ sprite, image }) => Number(sprite.height) || image.naturalHeight || 64));
    const scale = Math.max(2, Math.ceil(192 / Math.max(cellWidth, cellHeight)));
    const gutter = Math.max(6, Math.ceil(scale * 3));
    const cellCanvasWidth = cellWidth * scale + gutter * 2;
    const cellCanvasHeight = cellHeight * scale + gutter * 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(32, cellCanvasWidth * 4);
    canvas.height = Math.max(32, cellCanvasHeight);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建三维粒子姿态图集画布");
    context.clearRect(0, 0, canvas.width, canvas.height);
    entries.slice(0, 4).forEach(({ sprite, image }, index) => {
      const sourceWidth = Number(sprite.width) || image.naturalWidth || cellWidth;
      const sourceHeight = Number(sprite.height) || image.naturalHeight || cellHeight;
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const offsetX = index * cellCanvasWidth + gutter + (cellWidth * scale - drawWidth) / 2;
      const offsetY = gutter + (cellHeight * scale - drawHeight) / 2;
      context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    });
    bleedTransparentAtlasPixels(context, canvas.width, canvas.height, { alphaThreshold: 10, iterations: 8 });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData = {
      uvPad: {
        x: gutter / cellCanvasWidth,
        y: gutter / cellCanvasHeight
      }
    };
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = Boolean(renderer.capabilities.isWebGL2);
    texture.minFilter = texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    texture.needsUpdate = true;
    return texture;
  });
}

function sheetParticlePixelMassWeight(preset, red, green, blue, alpha, normalizedX, normalizedY) {
  if (preset !== "dandelion") return alpha;
  const brownMaterial = clampParticleValue((red - blue) / 150 + (red - green) / 180, 0, 1, 0);
  const lowerBody = smoothParticleStep(clampParticleValue((normalizedY - 0.58) / 0.34, 0, 1, 0));
  const centralAxis = 1 - clampParticleValue(Math.abs(normalizedX - 0.5) / 0.22, 0, 1, 1);
  const seedWeight = lowerBody * (0.8 + brownMaterial * 3.8);
  const stemWeight = centralAxis * smoothParticleStep(clampParticleValue((normalizedY - 0.34) / 0.42, 0, 1, 0)) * 0.72;
  const tuftWeight = 0.10 + (1 - lowerBody) * 0.12;
  // 蒲公英不是同材质薄片：冠毛面积大但很轻，底部种子和茎面积小却更重。
  return alpha * Math.max(0.05, tuftWeight + stemWeight + seedWeight);
}

function sheetParticlePixelAt(pixels, width, height, x, y) {
  const safeX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (safeY * width + safeX) * 4;
  return {
    red: pixels[index],
    green: pixels[index + 1],
    blue: pixels[index + 2],
    alpha: pixels[index + 3] / 255
  };
}

function buildSheetParticleShapeField(pixels, width, height, preset) {
  const columns = 33;
  const rows = 49;
  const values = new Float32Array(columns * rows * 4);
  const sampleRadius = Math.max(2, Math.round(Math.min(width, height) * 0.035));
  const sampleStep = Math.max(1, Math.round(sampleRadius / 3));
  for (let row = 0; row < rows; row += 1) {
    const normalizedY = row / Math.max(1, rows - 1);
    const pixelY = normalizedY * (height - 1);
    for (let column = 0; column < columns; column += 1) {
      const normalizedX = column / Math.max(1, columns - 1);
      const pixelX = normalizedX * (width - 1);
      let coverage = 0;
      let massTotal = 0;
      let dragTotal = 0;
      let sampleCount = 0;
      for (let offsetY = -sampleRadius; offsetY <= sampleRadius; offsetY += sampleStep) {
        for (let offsetX = -sampleRadius; offsetX <= sampleRadius; offsetX += sampleStep) {
          const sample = sheetParticlePixelAt(pixels, width, height, pixelX + offsetX, pixelY + offsetY);
          const sampleX = Math.max(0, Math.min(1, (pixelX + offsetX) / Math.max(1, width - 1)));
          const sampleY = Math.max(0, Math.min(1, (pixelY + offsetY) / Math.max(1, height - 1)));
          const mass = sheetParticlePixelMassWeight(preset, sample.red, sample.green, sample.blue, sample.alpha, sampleX, sampleY);
          coverage += sample.alpha;
          massTotal += mass;
          dragTotal += sample.alpha;
          sampleCount += 1;
        }
      }
      const center = sheetParticlePixelAt(pixels, width, height, pixelX, pixelY);
      const left = sheetParticlePixelAt(pixels, width, height, pixelX - sampleStep, pixelY);
      const right = sheetParticlePixelAt(pixels, width, height, pixelX + sampleStep, pixelY);
      const top = sheetParticlePixelAt(pixels, width, height, pixelX, pixelY - sampleStep);
      const bottom = sheetParticlePixelAt(pixels, width, height, pixelX, pixelY + sampleStep);
      const safeSamples = Math.max(1, sampleCount);
      const localCoverage = coverage / safeSamples;
      const localMass = massTotal / safeSamples;
      const localDrag = dragTotal / safeSamples;
      const edgeGradient = Math.hypot(right.alpha - left.alpha, bottom.alpha - top.alpha);
      const windCatchPerMass = localDrag / Math.max(0.035, localMass);
      const thinRegion = 1 - smoothParticleStep(clampParticleValue(localCoverage, 0, 1, 0));
      const localMobility = clampParticleValue(
        0.46 + windCatchPerMass * 0.30 + edgeGradient * 0.70 + thinRegion * 0.42,
        0.20,
        2.40,
        1
      );
      const targetIndex = (row * columns + column) * 4;
      values[targetIndex] = clampParticleValue(center.alpha, 0, 1, 0);
      values[targetIndex + 1] = clampParticleValue(localDrag, 0, 1.5, 0);
      values[targetIndex + 2] = clampParticleValue(edgeGradient + thinRegion * 0.55, 0, 1.5, 0);
      values[targetIndex + 3] = localMobility;
    }
  }
  return { columns, rows, values };
}

function sampleSheetParticleShapeField(shapeField, normalizedX, normalizedY) {
  if (!shapeField?.values || !shapeField.columns || !shapeField.rows) return [1, 1, 0, 1];
  const x = clampParticleValue(normalizedX, 0, 1, 0) * (shapeField.columns - 1);
  const y = clampParticleValue(normalizedY, 0, 1, 0) * (shapeField.rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(shapeField.columns - 1, x0 + 1);
  const y1 = Math.min(shapeField.rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const read = (column, row, channel) => shapeField.values[(row * shapeField.columns + column) * 4 + channel] || 0;
  return [0, 1, 2, 3].map((channel) => {
    const top = read(x0, y0, channel) * (1 - tx) + read(x1, y0, channel) * tx;
    const bottom = read(x0, y1, channel) * (1 - tx) + read(x1, y1, channel) * tx;
    return top * (1 - ty) + bottom * ty;
  });
}

function writeSheetParticleShapeAttribute(geometry, target, shapeField) {
  const uv = geometry.getAttribute("uv");
  if (!uv) return;
  for (let index = 0; index < uv.count; index += 1) {
    const uvX = uv.getX(index);
    const uvY = uv.getY(index);
    // 贴图测量使用图像坐标，y 轴从上往下；PlaneGeometry 的 uv.y 是从下往上。
    const sample = sampleSheetParticleShapeField(shapeField, uvX, 1 - uvY);
    const targetIndex = index * 4;
    target[targetIndex] = sample[0];
    target[targetIndex + 1] = sample[1];
    target[targetIndex + 2] = sample[2];
    target[targetIndex + 3] = sample[3];
  }
}

function measureSheetParticleSpriteSilhouette(sprite, preset) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const width = Math.max(16, Number(sprite.width) || image.naturalWidth || 64);
      const height = Math.max(16, Number(sprite.height) || image.naturalHeight || 64);
      const scale = Math.max(3, Math.ceil(192 / Math.max(width, height)));
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("无法创建粒子轮廓测量画布"));
        return;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const shapeField = buildSheetParticleShapeField(pixels, canvas.width, canvas.height, preset);
      let total = 0;
      let dragTotal = 0;
      let momentX = 0;
      let momentY = 0;
      let dragMomentX = 0;
      let dragMomentY = 0;
      let secondXX = 0;
      let secondXY = 0;
      let secondYY = 0;
      let dragSecondXX = 0;
      let dragSecondXY = 0;
      let dragSecondYY = 0;
      const samples = [];
      for (let y = 0; y < canvas.height; y += 1) {
        let rowMass = 0;
        for (let x = 0; x < canvas.width; x += 1) {
          const pixelIndex = (y * canvas.width + x) * 4;
          const alpha = pixels[pixelIndex + 3] / 255;
          if (alpha <= 0.02) continue;
          const normalizedX = x / Math.max(1, canvas.width - 1);
          const normalizedY = y / Math.max(1, canvas.height - 1);
          const localX = normalizedX - 0.5;
          const localY = 0.5 - normalizedY;
          const mass = sheetParticlePixelMassWeight(preset, pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2], alpha, normalizedX, normalizedY);
          const drag = alpha;
          total += mass;
          dragTotal += drag;
          rowMass += mass;
          momentX += mass * localX;
          momentY += mass * localY;
          dragMomentX += drag * localX;
          dragMomentY += drag * localY;
          secondXX += mass * localX * localX;
          secondXY += mass * localX * localY;
          secondYY += mass * localY * localY;
          dragSecondXX += drag * localX * localX;
          dragSecondXY += drag * localX * localY;
          dragSecondYY += drag * localY * localY;
          samples.push({ x: localX, y: localY, mass, drag });
        }
        if (rowMass <= 0) continue;
      }
      const safeTotal = Math.max(0.0001, total);
      const safeDragTotal = Math.max(0.0001, dragTotal);
      const centerOfMass = {
        x: clampParticleValue(momentX / safeTotal, -0.24, 0.24, 0),
        y: clampParticleValue(momentY / safeTotal, -0.30, 0.30, 0)
      };
      const massMoments = createSheetParticleMassMomentsFromSums({
        massTotal: safeTotal,
        dragTotal: safeDragTotal,
        massMomentX: momentX,
        massMomentY: momentY,
        dragMomentX,
        dragMomentY,
        massSecondXX: secondXX,
        massSecondXY: secondXY,
        massSecondYY: secondYY,
        dragSecondXX,
        dragSecondXY,
        dragSecondYY
      });
      const lightModel = calculateSheetParticleDirectionalLightModel(samples, massMoments, calculateSheetParticlePrincipalAxis(massMoments.massCovariance));
      const massMomentsWithLight = {
        ...massMoments,
        ...lightModel
      };
      resolve({
        fillRatio: clampParticleValue(total / (canvas.width * canvas.height), 0.03, 0.94, 0.58),
        centerOfMass,
        massMoments: massMomentsWithLight,
        shapeField,
        lightPole: lightModel.lightPole,
        lightMobility: lightModel.lightMobility,
        lightPoleConfidence: lightModel.lightPoleConfidence
      });
    };
    image.onerror = () => reject(new Error(`粒子轮廓贴图加载失败：${sprite.src}`));
    image.src = particleSpriteVersionedSrc(sprite.src);
  });
}

function threeSheetParticleLeavingCanvas(particle, size, marginOverride) {
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const margin = Math.max(48, Number(marginOverride) || particle.size * 3);
  return particle.x < -margin
    || particle.x > width + margin
    || particle.y < -margin
    || particle.y > height + margin;
}

function resetThreeSheetParticle(particle, size, field, seedOffset = 0) {
  const position = roleplaySpawnEdgePosition(field.spawnEdges || field.spawnPosition, size, particle.id * 11.37 + seedOffset, particle.size || 12);
  const movementAngle = Number(field.movementAngle ?? field.spawnAngle ?? 90) * Math.PI / 180;
  const speedScale = Math.max(0.2, Math.min(2.8, Number(field.movementSpeed ?? 70) / 70));
  const initialSpeed = 34 + speedScale * 42 + particleHashUnit(particle.id * 0.83 + seedOffset) * 18;
  const bodyRollRest = normalizeParticleAngle(sampleParticleRange(-Math.PI, Math.PI, particle.id * 2.37 + seedOffset * 0.19));
  particle.active = true;
  particle.spawnedAt = performance.now();
  particle.x = position.x;
  particle.y = position.y;
  particle.spawnEdge = position.edge || "top";
  particle.spawnRange = Array.isArray(position.range) ? position.range : [0, 100];
  particle.spawnAlong = Number(position.along) || 0;
  particle.vx = Math.cos(movementAngle) * initialSpeed;
  particle.vy = Math.sin(movementAngle) * initialSpeed;
  particle.bodyRollRest = bodyRollRest;
  particle.bodyRoll = bodyRollRest;
  particle.yaw = 0;
  particle.yawVelocity = 0;
  particle.pitch = 0;
  particle.pitchVelocity = 0;
  particle.twist = 0;
  particle.twistVelocity = 0;
  particle.flowState = {};
}

function scheduleThreeSheetParticleSpawn(particle, size, field, now, delayMs, seedOffset = 0) {
  particle.active = false;
  particle.spawnReadyAt = now + Math.max(0, Number(delayMs) || 0);
  particle.spawnSeedOffset = seedOffset;
  particle.x = -Math.max(1000, Number(size?.width) || 1000) * 2;
  particle.y = -Math.max(1000, Number(size?.height) || 1000) * 2;
  particle.vx = 0;
  particle.vy = 0;
  particle.bodyRollRest = Number.isFinite(Number(particle.bodyRollRest)) ? particle.bodyRollRest : 0;
  particle.bodyRoll = Number.isFinite(Number(particle.bodyRoll)) ? particle.bodyRoll : particle.bodyRollRest;
  particle.yaw = 0;
  particle.yawVelocity = 0;
  particle.pitch = 0;
  particle.pitchVelocity = 0;
  particle.twist = 0;
  particle.twistVelocity = 0;
  particle.flowState = {};
}

function createThreeSheetParticles(count, normalized, layerKey, size, silhouetteOverride) {
  const meta = particlePresetMeta[normalized.preset] || particlePresetMeta.sakura;
  const sprite = particleSpriteMap[normalized.preset] || particleSpriteMap.sakura;
  const field = createRoleplayParticleFlowField(normalized);
  const visualProfile = sheetParticleVisualProfile[normalized.preset] || { opacityScale: 0.58 };
  const opacity = Math.max(0, Math.min(1, normalized.opacity / 100)) * visualProfile.opacityScale;
  const aspect = (sprite.width && sprite.height) ? sprite.width / sprite.height : 1;
  const maxParticleBound = clampNumber(normalized.size, particleSizeControlMin, particleSizeControlMax, 24);
  // “粒子最大尺寸”按最终屏幕外接尺寸理解。片状粒子有身体朝向和三维倾斜，
  // 所以先按对角线和受限弯面投影反推贴图高度，保证旋转后也不会超过用户设置的像素上限。
  const curveProjectionSafety = 1.06;
  const maxParticleHeight = maxParticleBound / (Math.sqrt(1 + aspect * aspect) * curveProjectionSafety);
  const minParticleHeight = Math.max(2, maxParticleHeight * ((meta.size?.[0] || 1) / Math.max(1, meta.size?.[1] || maxParticleHeight)));
  const opacityRange = Array.isArray(visualProfile.opacityRange) ? visualProfile.opacityRange : [0.58, 1];
  const createdAt = performance.now();
  const spawnIntervalMs = roleplayParticleSpawnIntervalMs(count);
  const weightScale = Math.max(0.25, Math.min(2.6, Number(field.weightScale ?? normalized.weightScale ?? 100) / 100));
  return Array.from({ length: count }, (_, index) => {
    const seed = (layerKey === "front" ? 1000 : 0) + index + 1;
    const height = sampleParticleRange(minParticleHeight, maxParticleHeight, seed * 1.17);
    const weightDistribution = createSheetParticleWeightDistribution(normalized.preset, sprite, seed, silhouetteOverride);
    const physical = weightDistribution.physical || {};
    const basePhysicalMassKg = Math.max(1e-9, Number(physical.massKg) || 1e-6);
    const scaledPhysicalMassKg = basePhysicalMassKg * weightScale;
    const scaledWeightNewton = Math.max(1e-9, Number(physical.weightNewton) || basePhysicalMassKg * 9.80665) * weightScale;
    const mass = clampParticleValue((physical.normalizedMass || 1) * weightScale, 0.25, 4.80, 1);
    const normalizedWeight = normalizeSheetParticleWeightDistribution(weightDistribution);
    const massMoments = normalizedWeight.massMoments;
    const centerOfMass = massMoments.centerOfMass || sheetParticleMassCenterFromDistribution(weightDistribution, seed);
    const covarianceTrace = (massMoments.massCovariance?.xx || 0.035) + (massMoments.massCovariance?.yy || 0.055);
    const particle = {
      id: seed,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: height,
      width: height * aspect,
      height,
      opacity: Math.min(1, opacity * sampleParticleRange(opacityRange[0], opacityRange[1], seed * 1.91)),
      depth: sampleParticleRange(-32, 32, seed * 2.13),
      phase: sampleParticleRange(0, Math.PI * 2, seed * 2.71),
      poseResponse: Number(visualProfile.poseResponse) || 1,
      mass,
      physicalMassKg: scaledPhysicalMassKg,
      weightNewton: scaledWeightNewton,
      materialDensityKgM3: physical.densityKgM3,
      projectedAreaMm2: physical.projectedAreaMm2,
      dragAreaM2: physical.dragAreaM2,
      dragCoefficient: physical.dragCoefficient,
      ballisticCoefficientKgM2: scaledPhysicalMassKg / Math.max(1e-10, Number(physical.dragAreaM2) || 1e-8),
      weightScale,
      windResponse: clampParticleValue((physical.windResponse || 1) / Math.sqrt(Math.max(0.25, mass)), 0.28, 2.35, 1),
      angularInertia: mass
        * (0.82 + normalizedWeight.stiffness * 0.22 + massMoments.anisotropy * 0.24 + covarianceTrace * 1.35),
      centerOfMass,
      massMoments,
      weightDistribution,
      bodyRollRest: 0,
      bodyRoll: 0,
      yaw: 0,
      yawVelocity: 0,
      pitch: 0,
      pitchVelocity: 0,
      twist: 0,
      twistVelocity: 0,
      flowState: {}
    };
    // 初始发射按时间排队，避免打开设置后同一帧突然刷出一整片粒子。
    scheduleThreeSheetParticleSpawn(
      particle,
      size,
      field,
      createdAt,
      index * spawnIntervalMs + particleHashUnit(seed * 8.31) * spawnIntervalMs * 0.8,
      index * 31.7
    );
    return particle;
  });
}

function updateThreeSheetParticle(particle, field, host, size, now, deltaSeconds) {
  if (!particle.active) {
    if (now < (Number(particle.spawnReadyAt) || 0)) return false;
    resetThreeSheetParticle(particle, size, field, particle.spawnSeedOffset || 0);
  }
  const width = Math.max(1, Number(size?.width) || 1);
  const height = Math.max(1, Number(size?.height) || 1);
  const span = Math.max(width, height);
  const movementAngle = Number(field.movementAngle ?? field.spawnAngle ?? 90) * Math.PI / 180;
  const baseWindAngle = Number(field.windAngle ?? 0) * Math.PI / 180;
  const movement = { x: Math.cos(movementAngle), y: Math.sin(movementAngle) };
  const baseMain = { x: Math.cos(baseWindAngle), y: Math.sin(baseWindAngle) };
  const baseSide = { x: -baseMain.y, y: baseMain.x };
  const along = (particle.x * baseMain.x + particle.y * baseMain.y) / span;
  const cross = (particle.x * baseSide.x + particle.y * baseSide.y) / span;
  const crossOffset = Math.max(-1, Math.min(1, cross * 2 - 1));
  const ranges = roleplayStandardWindRanges(field);
  const standardWind = readRoleplayStandardWind(host, field, now);
  const flowStrength = standardWind.strength;
  const flowPower = flowStrength / 100;
  const windFlow = smoothParticleStep(flowPower);
  const windAdjustAngle = standardWind.adjustDegrees * Math.PI / 180;
  const windAngle = baseWindAngle + windAdjustAngle;
  const main = { x: Math.cos(windAngle), y: Math.sin(windAngle) };
  const side = { x: -main.y, y: main.x };
  const shear = Math.max(-1, Math.min(1, Number(field.shearStrength || 0) / 100));
  const sway = Math.max(0, Math.min(1, Number(field.swayStrength || 0) / 100));
  const surfaceResponse = Math.max(0.6, Math.min(3.6, Number(field.surfaceResponse) || 1));
  const mass = Math.max(0.4, Number(particle.mass) || 1);
  const windResponse = Math.max(0.42, Math.min(1.55, Number(particle.windResponse) || 1));
  const angularInertia = Math.max(0.28, Number(particle.angularInertia) || mass);
  const weightDistribution = normalizeSheetParticleWeightDistribution(particle.weightDistribution);
  const massMoments = normalizeSheetParticleMassMoments(particle.massMoments || weightDistribution.massMoments);
  const centerOfMass = massMoments.centerOfMass || { x: 0, y: 0 };
  const dragCenter = massMoments.dragCenter || centerOfMass;
  const massCovariance = massMoments.massCovariance || { xx: 0.035, xy: 0, yy: 0.055 };
  const massContrast = Math.min(1, massMoments.massEccentricity * 3.8 + massMoments.anisotropy * 0.54 + 0.12);
  const stiffness = Math.max(0.35, weightDistribution.stiffness);
  const edgeFlex = Math.max(0.35, weightDistribution.edgeFlex);
  const flexResponse = Math.max(0.36, Math.min(2.2, edgeFlex / stiffness));
  const movementSpeed = Math.max(0.08, Math.min(2.8, Number(field.movementSpeed ?? 70) / 70));
  const movementPower = Math.min(2.5, Math.pow(movementSpeed, 1.12));
  const accidentalEvents = updateRoleplayWindEvents(host, field, now, width, height);
  const accidentalVector = accidentalEvents.reduce((sum, event) => {
    const distanceRatio = Math.hypot(particle.x - event.x, particle.y - event.y) / event.radius;
    if (!Number.isFinite(distanceRatio) || distanceRatio >= 1) return sum;
    // 意外风要真实影响命中区域，不能被距离衰减压到肉眼不可见。
    const falloff = Math.pow(Math.max(0, 1 - distanceRatio), 0.52);
    const envelope = roleplayWindEventEnvelope(event, now);
    const power = event.strength * falloff * envelope * (0.84 + particleHashUnit(event.id * 4.3 + particle.id * 0.27) * 0.22);
    if (power > 0.001) event.hits += 1;
    return {
      x: sum.x + Math.cos(event.angle) * power,
      y: sum.y + Math.sin(event.angle) * power
    };
  }, { x: 0, y: 0 });
  const limitedAccidentalVector = limitParticleVector(accidentalVector, 1.4);
  const accidentalStrength = particleVectorLength(limitedAccidentalVector);
  const accidentalFrequency = Math.max(
    standardWind.frequency,
    Math.max(particleFrequencyControlMin, Number(field.turbulenceFrequencyMax ?? 0.32))
  );
  const phase = now * 0.001 * Math.PI * 2 * accidentalFrequency + particle.phase;
  const visualFlutterFrequency = Math.max(0.14, Math.min(0.92, standardWind.frequency * 0.58 + 0.18 + windFlow * 0.18));
  const visualPhase = now * 0.001 * Math.PI * 2 * visualFlutterFrequency + particle.phase;
  const bodyRollForces = normalizeParticleAngle(
    Number.isFinite(Number(particle.bodyRoll)) ? particle.bodyRoll : Number(particle.bodyRollRest) || 0
  );
  const swayWave = (
    Math.sin(visualPhase * 0.92 + along * 7.4)
    + Math.sin(visualPhase * 0.47 - cross * 5.8 + particle.id * 0.31) * 0.46
  ) / 1.46;

  const hasStandardWind = ranges.flowStrengthMax > 0.5;
  const persistentWindCarry = hasStandardWind ? 0.12 + Math.min(0.42, Math.max(ranges.flowStrengthMin, ranges.flowStrengthMax * 0.18) / 100 * 0.55) : 0;
  const movementCarry = (0.24 + 0.50 * movementPower) * Math.max(0.24, 0.62 - 0.18 * windFlow);
  const windCarry = persistentWindCarry + windFlow * (0.60 + 0.72 * windFlow);
  const stableAlong = (windCarry + shear * crossOffset * (0.04 + 0.16 * Math.max(windFlow, persistentWindCarry))) * windResponse;
  const stableSide = sway * swayWave * (0.08 + 0.16 * Math.max(windFlow, persistentWindCarry)) * windResponse;
  const accidentalCarry = (0.90 + 1.10 * accidentalStrength) * windResponse;
  const stableWind = {
    x: main.x * stableAlong + side.x * stableSide,
    y: main.y * stableAlong + side.y * stableSide
  };
  const accidentalWind = {
    x: limitedAccidentalVector.x * accidentalCarry,
    y: limitedAccidentalVector.y * accidentalCarry
  };
  const targetDirection = limitParticleVector({
    x: movement.x * movementCarry + stableWind.x + accidentalWind.x,
    y: movement.y * movementCarry + stableWind.y + accidentalWind.y
  }, 1.8 + movementPower * 0.22 + accidentalStrength * 0.24);
  const pixelSpeed = 42 + movementPower * 46 + windFlow * 74 + accidentalStrength * 30;
  const targetVelocity = {
    x: targetDirection.x * pixelSpeed,
    y: targetDirection.y * pixelSpeed
  };
  const steeringSeconds = Math.max(0.20, (0.62 - 0.16 * windFlow) * Math.sqrt(mass));
  const steering = 1 - Math.exp(-deltaSeconds / steeringSeconds);
  particle.vx += (targetVelocity.x - particle.vx) * steering;
  particle.vy += (targetVelocity.y - particle.vy) * steering;
  const speedLimit = (250 + windFlow * 110 + accidentalStrength * 70) * (0.92 + windResponse * 0.14);
  const capped = limitParticleVector({ x: particle.vx, y: particle.vy }, speedLimit);
  particle.vx = capped.x;
  particle.vy = capped.y;
  particle.x += particle.vx * deltaSeconds;
  particle.y += particle.vy * deltaSeconds;
  particle.flowState.stableWind = stableWind;
  particle.flowState.accidentalWind = accidentalWind;
  particle.flowState.targetVelocity = targetVelocity;

  const rawSurfaceVector = {
    x: stableWind.x + accidentalWind.x,
    y: stableWind.y + accidentalWind.y
  };
  const rawSurfaceWorld = { x: rawSurfaceVector.x, y: -rawSurfaceVector.y };
  const fallbackSurfaceWorld = { x: main.x, y: -main.y };
  const localWindUnit = normalizeParticleVector(
    rotateParticleVector(rawSurfaceWorld, -bodyRollForces),
    rotateParticleVector(fallbackSurfaceWorld, -bodyRollForces)
  );
  const stableWindLength = particleVectorLength(stableWind);
  const aerodynamicLoad = calculateSheetParticleWindLoad(
    particle,
    field,
    massMoments,
    localWindUnit,
    flowPower,
    stableWindLength,
    accidentalStrength
  );
  const surfaceWindGain = (0.58 + aerodynamicLoad.windLoadDrive * 0.82)
    * (0.72 + aerodynamicLoad.shapeExposure * 0.28)
    * (0.74 + aerodynamicLoad.edgeMobility * 0.22)
    * (0.92 + (windResponse - 1) * 0.10);
  const surfaceWindRaw = {
    x: (stableWind.x * 150 + accidentalWind.x * 280) * surfaceWindGain,
    y: (stableWind.y * 150 + accidentalWind.y * 280) * surfaceWindGain
  };
  const pressureWindRaw = {
    // 这里只允许真实气流驱动表面翻转。粒子自身的下落/运动方向速度不是风，
    // 不能参与轻边受风判断，否则花瓣会被错误拉成轻端总朝竖直下方。
    x: surfaceWindRaw.x,
    y: surfaceWindRaw.y
  };
  const pressureWind = smoothParticleVectorComponent(particle.flowState, "surfacePressureWind", pressureWindRaw, deltaSeconds, 0.15, 0.60);
  const pressureWindLength = particleVectorLength(pressureWind);
  const pressure = Math.min(1.35, pressureWindLength / (182 - aerodynamicLoad.windLoadDrive * 34));
  const pressureWindWorld = { x: pressureWind.x, y: -pressureWind.y };
  const pressureWindDirectionWorld = smoothParticleUnitVectorComponent(
    particle.flowState,
    "pressureWindDirectionWorld",
    pressureWindWorld,
    deltaSeconds,
    0.38 + mass * 0.05,
    { x: main.x, y: -main.y },
    2.8
  );
  // 贴图局部坐标来自自身身体朝向，不再默认等于屏幕竖直方向。
  const pressureWindLocal = rotateParticleVector(pressureWindWorld, -bodyRollForces);
  const pressureWindLocalUnit = rotateParticleVector(pressureWindDirectionWorld, -bodyRollForces);
  const accidentalWindLocal = rotateParticleVector({ x: accidentalWind.x, y: -accidentalWind.y }, -bodyRollForces);
  const sidePressure = Math.max(-1, Math.min(1, pressureWindLocal.x / 142));
  const frontPressure = Math.max(-1, Math.min(1, pressureWindLocal.y / 152));
  const localPressureLength = Math.hypot(sidePressure, frontPressure);
  const localPressureUnit = pressureWindLocalUnit;
  const pressureCenterDistance = (
    0.12
    + pressure * 0.13
    + aerodynamicLoad.windLoadDrive * 0.11
    + massMoments.mobilityScale * 0.026
  ) * (0.70 + edgeFlex * 0.10 + aerodynamicLoad.shapeExposure * 0.18);
  const pressureCenterX = clampParticleValue(
    dragCenter.x + localPressureUnit.x * pressureCenterDistance + (dragCenter.x - centerOfMass.x) * 0.22,
    -0.42,
    0.42,
    dragCenter.x
  );
  const pressureCenterY = clampParticleValue(
    dragCenter.y + localPressureUnit.y * pressureCenterDistance + (dragCenter.y - centerOfMass.y) * 0.22,
    -0.48,
    0.48,
    dragCenter.y
  );
  const leverX = pressureCenterX - (Number(centerOfMass.x) || 0);
  const leverY = pressureCenterY - (Number(centerOfMass.y) || 0);
  const leverLength = Math.hypot(leverX, leverY);
  const surfacePressureDrive = Math.min(
    1.22,
    (0.18 + Math.pow(Math.max(0, pressure), 0.74))
      * (0.38 + Math.min(1.35, localPressureLength) * 0.40)
      * (0.62 + aerodynamicLoad.windLoadDrive * 0.66)
      * (0.76 + aerodynamicLoad.shapeExposure * 0.22)
  );
  const windSwayDrive = Math.min(
    1.28,
    Math.pow(Math.max(0, windFlow), 0.56) * (0.30 + aerodynamicLoad.windLoadDrive * 0.22)
      + surfacePressureDrive * 0.46
      + aerodynamicLoad.windLoadDrive * 0.22
      + accidentalStrength * 0.30
  );
  const bodyRollRest = normalizeParticleAngle(Number(particle.bodyRollRest) || 0);
  const windFlutterJitter = (
    Math.sin(visualPhase * 0.52 + along * 3.6) * 0.58
    + Math.sin(visualPhase * 0.31 + cross * 4.2) * 0.42
  ) * Math.min(0.105, windSwayDrive * 0.045 + accidentalStrength * 0.035);
  const bodyRollPressureLean = sidePressure * Math.min(0.48, surfacePressureDrive * 0.34);
  const bodyRollAccidentalLean = accidentalWindLocal.x * Math.min(0.42, 0.18 + accidentalStrength * 0.30);
  const bodyRoll = smoothParticleAngleComponent(
    particle,
    "bodyRoll",
    normalizeParticleAngle(bodyRollRest + bodyRollPressureLean + bodyRollAccidentalLean + windFlutterJitter),
    deltaSeconds,
    0.18,
    0.54
  );
  const flutterFlex = (0.66 + Math.min(2.2, flexResponse) * 0.18) * (0.84 + aerodynamicLoad.edgeMobility * 0.18);
  const flutterYaw = windFlutterJitter * (0.10 + Math.abs(sidePressure) * 0.20) * surfaceResponse * windResponse * flutterFlex;
  const flutterPitch = windFlutterJitter * (0.08 + Math.abs(frontPressure) * 0.18) * surfaceResponse * windResponse * flutterFlex;
  const tensorTrace = Math.max(0.001, massCovariance.xx + massCovariance.yy);
  const tensorLever = Math.sqrt(Math.max(0, (leverX * leverX + leverY * leverY) / tensorTrace));
  const continuousLightResponse = 1 + (pressure * 0.20 + leverLength * 1.36 + massContrast * 0.42 + tensorLever * 0.08) * (0.40 + edgeFlex * 0.12);
  const shapeConfidence = clampParticleValue(massMoments.lightPoleConfidence, 0.12, 0.96, 0.32);
  const shapeMobility = clampParticleValue(massMoments.lightMobility, 0.58, 1.92, 1);
  const lightRegionDrive = Math.min(
    1.55,
    (surfacePressureDrive * 0.64 + aerodynamicLoad.windLoadDrive * 0.34 + windSwayDrive * 0.18)
      * (0.72 + shapeMobility * 0.26)
      * (0.76 + shapeConfidence * 0.24)
      * (0.84 + edgeFlex * 0.10)
      * 1.54
  );
  // 这条通道只描述“轻部区域被风推到风向前方”，方向来自真实气流，区域来自轮廓质量矩。
  const lightDeformWorldUnit = pressureWindDirectionWorld;
  const lightDeformVectorTarget = {
    x: lightDeformWorldUnit.x * lightRegionDrive,
    y: lightDeformWorldUnit.y * lightRegionDrive
  };
  const lightDeformLiftTarget = Math.min(
    1.55,
    (surfacePressureDrive * 0.56 + aerodynamicLoad.windLoadDrive * 0.38 + pressure * 0.20)
      * (0.62 + shapeMobility * 0.28)
      * (0.80 + shapeConfidence * 0.22)
      * 1.46
  );
  const lightDeformPulseTarget = (
    Math.sin(visualPhase * 0.86 + particle.phase * 0.57) * 0.18
    + Math.sin(visualPhase * 0.39 + particle.id * 0.23) * 0.09
  ) * lightDeformLiftTarget * (0.62 + windSwayDrive * 0.28);
  const lightDeformVector = smoothParticleVectorComponent(particle.flowState, "lightDeformVector", lightDeformVectorTarget, deltaSeconds, 0.12, 0.48);
  const lightDeformLift = smoothParticleScalarComponent(particle.flowState, "lightDeformLift", lightDeformLiftTarget, deltaSeconds, 0.14, 0.54);
  const lightDeformPulse = smoothParticleScalarComponent(particle.flowState, "lightDeformPulse", lightDeformPulseTarget, deltaSeconds, 0.10, 0.36);
  const carryWindRaw = {
    x: stableWind.x + accidentalWind.x,
    y: stableWind.y + accidentalWind.y
  };
  const carryWindLength = particleVectorLength(carryWindRaw);
  const windProjectionSource = carryWindLength > 0.02 ? carryWindRaw : pressureWind;
  const windProjectionLength = Math.max(0.001, particleVectorLength(windProjectionSource));
  const worldWindProjection = {
    x: windProjectionSource.x / windProjectionLength,
    // Three.js 正交世界坐标 y 轴向上，页面粒子物理坐标 y 轴向下，所以这里需要取反。
    y: -windProjectionSource.y / windProjectionLength
  };
  const windProjection = {
    x: worldWindProjection.x,
    y: worldWindProjection.y,
    worldX: worldWindProjection.x,
    worldY: worldWindProjection.y,
    pressure: Math.min(1.6, surfacePressureDrive * 0.76 + aerodynamicLoad.windLoadDrive * 0.42 + carryWindLength * 0.36 + accidentalStrength * 0.22),
    massContrast: Math.min(1, massContrast * 0.72 + (aerodynamicLoad.shapeExposure - 0.58) * 0.20 + aerodynamicLoad.windLoadDrive * 0.12)
  };
  const torqueFlex = (0.70 + Math.min(2.2, flexResponse) * 0.16) * (0.76 + aerodynamicLoad.edgeMobility * 0.26);
  const yawTorque = (
    sidePressure * (0.42 + Math.abs(leverY) * 1.00 + massContrast * 0.14 + aerodynamicLoad.shapeExposure * 0.14) * continuousLightResponse
    + frontPressure * leverX * 0.42
  ) * surfaceResponse * windResponse * torqueFlex * (0.58 + aerodynamicLoad.windLoadDrive * 0.58) + flutterYaw;
  const pitchTorque = (
    -frontPressure * (0.42 + Math.abs(leverX) * 0.96 + massContrast * 0.13 + aerodynamicLoad.shapeExposure * 0.12) * continuousLightResponse
    + sidePressure * leverY * 0.38
  ) * surfaceResponse * windResponse * (0.76 + Math.min(2.2, flexResponse) * 0.14) * (0.58 + aerodynamicLoad.windLoadDrive * 0.58) + flutterPitch - accidentalStrength * 0.014;
  const surfaceFlutter = (
    windFlutterJitter * 0.38
    + sidePressure * surfacePressureDrive * 0.030
    + accidentalWindLocal.x * accidentalStrength * 0.060
  ) * Math.min(1.10, 0.34 + surfacePressureDrive * 0.52 + accidentalStrength * 0.38) * Math.min(1.22, surfaceResponse * 0.44) * windResponse * flutterFlex;
  const twistTorque = surfaceFlutter + sidePressure * (0.068 + edgeFlex * 0.044) + (leverX - leverY) * 0.09 + massContrast * frontPressure * 0.044;
  particle.yaw = integrateParticleTorqueAngle(particle, "yaw", "yawVelocity", yawTorque, deltaSeconds, {
    inertia: angularInertia * (1.02 + stiffness * 0.12 + massMoments.anisotropy * 0.10),
    damping: 1.22 + mass * 0.36 + stiffness * 0.34,
    restoring: 0.42 + massContrast * 0.18 + stiffness * 0.10,
    maxVelocity: (1.04 + edgeFlex * 0.16) / Math.sqrt(mass),
    maxAbsAngle: 0.76
  });
  particle.pitch = integrateParticleTorqueAngle(particle, "pitch", "pitchVelocity", pitchTorque, deltaSeconds, {
    inertia: angularInertia * (1.10 + stiffness * 0.14 + massMoments.anisotropy * 0.12),
    damping: 1.28 + mass * 0.40 + stiffness * 0.38 + massContrast * 0.10,
    restoring: 0.44 + massContrast * 0.22 + stiffness * 0.12,
    maxVelocity: (1.00 + massMoments.mobilityScale * 0.10 + edgeFlex * 0.12) / Math.sqrt(mass),
    maxAbsAngle: 0.72
  });
  particle.twist = integrateParticleTorqueAngle(particle, "twist", "twistVelocity", twistTorque, deltaSeconds, {
    inertia: angularInertia * (1.22 + stiffness * 0.18),
    damping: 1.54 + mass * 0.48 + stiffness * 0.40,
    restoring: 0.58 + stiffness * 0.18,
    maxVelocity: (0.76 + edgeFlex * 0.20) / Math.sqrt(mass),
    maxAbsAngle: 0.46
  });
  particle.pressureCenter = { x: pressureCenterX, y: pressureCenterY };
  const localFlexDrive = (0.62 + Math.min(2.2, flexResponse) * 0.20 + aerodynamicLoad.edgeMobility * 0.18);
  particle.bend = Math.max(0, Math.min(0.78, (Math.abs(particle.pitch) * 0.36 + surfacePressureDrive * 0.28 + aerodynamicLoad.windLoadDrive * 0.14 + accidentalStrength * 0.052) * localFlexDrive));
  particle.curl = Math.max(-0.68, Math.min(0.68, (particle.yaw * 0.26 + particle.twist * 0.32 + lightDeformVector.x * surfacePressureDrive * 0.070) * localFlexDrive));
  particle.shade = Math.max(0.84, Math.min(1.25, 1.00 + Math.abs(particle.pitch) * 0.070 + Math.abs(particle.yaw) * 0.058 + surfacePressureDrive * 0.046 + aerodynamicLoad.shapeExposure * 0.010 - massContrast * 0.006));
  particle.aerodynamics = {
    massContrast,
    shapeConfidence,
    shapeMobility
  };
  particle.lightDeform = {
    x: lightDeformVector.x,
    y: lightDeformVector.y,
    lift: lightDeformLift,
    pulse: lightDeformPulse,
    drive: lightRegionDrive,
    shapeConfidence,
    shapeMobility
  };
  particle.windProjection = windProjection;
  particle.localWindResponse = {
    sidePressure,
    frontPressure,
    bodyRoll,
    bodyRollRest,
    pressureWindLocal,
    pressureWindDirectionWorld,
    pressureWindLocalUnit,
    accidentalWindLocal,
    accidentalStrength,
    stableWind,
    accidentalWind,
    surfaceWindRaw,
    movementVelocity: { x: particle.vx, y: particle.vy },
    surfaceWindGain,
    pressureWindLength,
    surfacePressureDrive,
    windSwayDrive,
    lightDeformDriveTarget: lightRegionDrive,
    aerodynamicLoad,
    pressureCenter: particle.pressureCenter,
    centerOfMass,
    dragCenter,
    shapeConfidence,
    shapeMobility,
    lightDeform: particle.lightDeform,
    massMoments,
    continuousLightResponse
  };
  return true;
}

function ThreeSheetParticleLayer({ layer, layerKey }) {
  const rootRef = useRef(null);
  const normalized = normalizeParticleLayer(layer, defaultParticleLayers[layerKey] || defaultParticleLayers.back);
  const count = particleCountForLayer(normalized, layerKey);
  const renderKey = [
    layerKey,
    normalized.preset,
    normalized.density,
    normalized.spawnPosition,
    particleSpawnEdgesSignature(normalized.spawnEdges),
    normalized.movementDirection,
    normalized.windDirection,
    normalized.windAdjustMin,
    normalized.windAdjustMax,
    normalized.flowStrengthMin,
    normalized.flowStrengthMax,
    normalized.flowFrequencyMin,
    normalized.flowFrequencyMax,
    normalized.shearStrength,
    normalized.turbulenceMin,
    normalized.turbulenceMax,
    normalized.turbulenceFrequencyMin,
    normalized.turbulenceFrequencyMax,
    normalized.turbulenceTimeMin,
    normalized.turbulenceTimeMax,
    normalized.speed,
    normalized.weightScale,
    normalized.size,
    normalized.opacity
  ].join(":");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !normalized.enabled || count <= 0 || normalized.opacity <= 0) return undefined;
    let cancelled = false;
    let frameId = 0;
    const size = {
      width: Math.max(1, root.clientWidth || window.innerWidth || 1),
      height: Math.max(1, root.clientHeight || window.innerHeight || 1)
    };
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.className = "three-sheet-particle-canvas";
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, size.width / size.height, 1, 2600);
    camera.position.set(0, 0, 900);
    camera.lookAt(0, 0, 0);

    const sprite = particleSpriteMap[normalized.preset] || particleSpriteMap.sakura;
    const poseSprites = particleSpritePoseMap[normalized.preset] || [sprite, sprite, sprite, sprite];
    const meta = particlePresetMeta[normalized.preset] || particlePresetMeta.sakura;
    const visualProfile = sheetParticleVisualProfile[normalized.preset] || {};
    const tintColor = new THREE.Color(visualProfile.tintColor || (Array.isArray(meta.color) ? meta.color[0] : meta.color));
    const tintStrength = Number(visualProfile.tintStrength ?? 0.30);
    const field = createRoleplayParticleFlowField(normalized);
    const fieldHost = { id: `three-sheet-${layerKey}` };
    let particles = null;
    const silhouettePromise = measureSheetParticleSpriteSilhouette(sprite, normalized.preset)
      .catch((error) => {
        console.warn(error);
        return null;
      });
    const geometryBase = createThinSheetParticleGeometry(10, 16);
    const geometry = new THREE.InstancedBufferGeometry().copy(geometryBase);
    geometry.instanceCount = count;
    const offsets = new Float32Array(count * 3);
    const scales = new Float32Array(count * 2);
    const angles = new Float32Array(count * 4);
    const surfaces = new Float32Array(count * 4);
    const poseWeights = new Float32Array(count * 4);
    const weights = new Float32Array(count * 4);
    const flows = new Float32Array(count * 4);
    const massModels = new Float32Array(count * 4);
    const massTensors = new Float32Array(count * 4);
    const shapeModels = new Float32Array(count * 4);
    const lightDeforms = new Float32Array(count * 4);
    const shapeProfiles = new Float32Array((geometry.getAttribute("uv")?.count || 0) * 4);
    writeSheetParticleShapeAttribute(geometry, shapeProfiles, null);
    const offsetAttribute = new THREE.InstancedBufferAttribute(offsets, 3).setUsage(THREE.DynamicDrawUsage);
    const scaleAttribute = new THREE.InstancedBufferAttribute(scales, 2).setUsage(THREE.DynamicDrawUsage);
    const angleAttribute = new THREE.InstancedBufferAttribute(angles, 4).setUsage(THREE.DynamicDrawUsage);
    const surfaceAttribute = new THREE.InstancedBufferAttribute(surfaces, 4).setUsage(THREE.DynamicDrawUsage);
    const poseWeightAttribute = new THREE.InstancedBufferAttribute(poseWeights, 4).setUsage(THREE.DynamicDrawUsage);
    const weightAttribute = new THREE.InstancedBufferAttribute(weights, 4);
    const flowAttribute = new THREE.InstancedBufferAttribute(flows, 4).setUsage(THREE.DynamicDrawUsage);
    const massModelAttribute = new THREE.InstancedBufferAttribute(massModels, 4);
    const massTensorAttribute = new THREE.InstancedBufferAttribute(massTensors, 4);
    const shapeModelAttribute = new THREE.InstancedBufferAttribute(shapeModels, 4);
    const lightDeformAttribute = new THREE.InstancedBufferAttribute(lightDeforms, 4).setUsage(THREE.DynamicDrawUsage);
    const shapeProfileAttribute = new THREE.BufferAttribute(shapeProfiles, 4);
    geometry.setAttribute("instanceOffset", offsetAttribute);
    geometry.setAttribute("instanceScale", scaleAttribute);
    geometry.setAttribute("instanceAngles", angleAttribute);
    geometry.setAttribute("instanceSurface", surfaceAttribute);
    geometry.setAttribute("instancePoseWeights", poseWeightAttribute);
    geometry.setAttribute("instanceWeight", weightAttribute);
    geometry.setAttribute("instanceFlow", flowAttribute);
    geometry.setAttribute("instanceMassModel", massModelAttribute);
    geometry.setAttribute("instanceMassTensor", massTensorAttribute);
    geometry.setAttribute("instanceShapeModel", shapeModelAttribute);
    geometry.setAttribute("instanceLightDeform", lightDeformAttribute);
    geometry.setAttribute("sheetShape", shapeProfileAttribute);
    const applyStaticParticleWeights = (items) => {
      items.forEach((particle, index) => {
        const distribution = normalizeSheetParticleWeightDistribution(particle.weightDistribution);
        const weightIndex = index * 4;
        weights[weightIndex] = 0;
        weights[weightIndex + 1] = 0;
        weights[weightIndex + 2] = distribution.stiffness;
        weights[weightIndex + 3] = distribution.edgeFlex;
        const massMoments = normalizeSheetParticleMassMoments(particle.massMoments || distribution.massMoments);
        const massIndex = index * 4;
        massModels[massIndex] = massMoments.centerOfMass?.x || 0;
        massModels[massIndex + 1] = massMoments.centerOfMass?.y || 0;
        massModels[massIndex + 2] = massMoments.dragCenter?.x || massModels[massIndex];
        massModels[massIndex + 3] = massMoments.dragCenter?.y || massModels[massIndex + 1];
        massTensors[massIndex] = massMoments.massCovariance?.xx || 0.035;
        massTensors[massIndex + 1] = massMoments.massCovariance?.xy || 0;
        massTensors[massIndex + 2] = massMoments.massCovariance?.yy || 0.055;
        massTensors[massIndex + 3] = massMoments.mobilityScale || 1;
        shapeModels[massIndex] = 0;
        shapeModels[massIndex + 1] = 0;
        shapeModels[massIndex + 2] = massMoments.lightMobility || 1;
        shapeModels[massIndex + 3] = massMoments.lightPoleConfidence || 0.32;
      });
      weightAttribute.needsUpdate = true;
      massModelAttribute.needsUpdate = true;
      massTensorAttribute.needsUpdate = true;
      shapeModelAttribute.needsUpdate = true;
    };
    const particlesPromise = silhouettePromise.then((silhouette) => {
      writeSheetParticleShapeAttribute(geometry, shapeProfiles, silhouette?.shapeField);
      shapeProfileAttribute.needsUpdate = true;
      const created = createThreeSheetParticles(count, normalized, layerKey, size, silhouette);
      particles = created;
      applyStaticParticleWeights(created);
      return created;
    });

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        tintColor: { value: tintColor },
        tintStrength: { value: tintStrength },
        colorLift: { value: Number(visualProfile.colorLift) || 1 },
        colorSaturation: { value: Number(visualProfile.colorSaturation) || 1 },
        shadeStrength: { value: Number(visualProfile.shadeStrength ?? 1) },
        alphaBoost: { value: Number(visualProfile.alphaBoost) || 1.34 },
        atlasUvPad: { value: new THREE.Vector2(0, 0) }
      },
      vertexShader: threeSheetParticleVertexShader,
      fragmentShader: threeSheetParticleFragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.FrontSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);

    const resize = () => {
      size.width = Math.max(1, root.clientWidth || window.innerWidth || 1);
      size.height = Math.max(1, root.clientHeight || window.innerHeight || 1);
      renderer.setSize(size.width, size.height, false);
      camera.aspect = size.width / size.height;
      // 透视相机的距离按视口高度反推，使 z=0 平面仍然等于屏幕像素坐标。
      // 这样不会破坏粒子位置，同时 z 方向的翻起会产生真实透视深度。
      const halfFovRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const cameraDistance = (size.height * 0.5) / Math.tan(halfFovRadians);
      camera.position.set(0, 0, cameraDistance);
      camera.near = Math.max(1, cameraDistance - 1400);
      camera.far = cameraDistance + 1400;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);

    const texturePromise = loadThreeSheetPoseAtlasTexture(poseSprites, renderer).then((texture) => {
      material.uniforms.map.value = texture;
      material.uniforms.atlasUvPad.value.set(texture.userData?.uvPad?.x || 0, texture.userData?.uvPad?.y || 0);
      material.needsUpdate = true;
      return texture;
    });

    let previousTime = performance.now();
    const animate = async () => {
      if (cancelled) return;
      await texturePromise;
      const activeParticles = await particlesPromise;
      if (cancelled) return;
      const now = performance.now();
      const deltaSeconds = Math.max(1 / 120, Math.min(0.08, (now - previousTime) / 1000 || 1 / 60));
      previousTime = now;
      for (let index = 0; index < activeParticles.length; index += 1) {
        const particle = activeParticles[index];
        const isActive = updateThreeSheetParticle(particle, field, fieldHost, size, now, deltaSeconds);
        if (isActive && threeSheetParticleLeavingCanvas(particle, size)) {
          const spawnIntervalMs = roleplayParticleSpawnIntervalMs(activeParticles.length);
          const queuedAt = Math.max(now, Number(fieldHost.nextSheetSpawnAt) || now);
          const jitter = particleHashUnit(now * 0.003 + particle.id * 0.47) * spawnIntervalMs * 0.65;
          scheduleThreeSheetParticleSpawn(particle, size, field, now, queuedAt - now + jitter, now * 0.017 + index * 29.3);
          fieldHost.nextSheetSpawnAt = queuedAt + spawnIntervalMs;
        }
        const offsetIndex = index * 3;
        offsets[offsetIndex] = particle.x - size.width / 2;
        offsets[offsetIndex + 1] = size.height / 2 - particle.y;
        offsets[offsetIndex + 2] = particle.depth;
        const scaleIndex = index * 2;
        scales[scaleIndex] = particle.width;
        scales[scaleIndex + 1] = particle.height;
        const angleIndex = index * 4;
        angles[angleIndex] = particle.bodyRoll || 0;
        angles[angleIndex + 1] = particle.yaw;
        angles[angleIndex + 2] = particle.pitch;
        angles[angleIndex + 3] = particle.twist;
        const surfaceIndex = index * 4;
        const spawnFade = particle.active ? Math.min(1, Math.max(0, (now - (particle.spawnedAt || now)) / 520)) : 0;
        surfaces[surfaceIndex] = particle.opacity * spawnFade;
        surfaces[surfaceIndex + 1] = particle.bend || 0;
        surfaces[surfaceIndex + 2] = particle.curl || 0;
        surfaces[surfaceIndex + 3] = particle.shade || 1;
        const lightDeformIndex = index * 4;
        lightDeforms[lightDeformIndex] = particle.lightDeform?.x || 0;
        lightDeforms[lightDeformIndex + 1] = particle.lightDeform?.y || 0;
        lightDeforms[lightDeformIndex + 2] = particle.lightDeform?.lift || 0;
        lightDeforms[lightDeformIndex + 3] = particle.lightDeform?.pulse || 0;
        const flowIndex = index * 4;
        flows[flowIndex] = particle.windProjection?.x || 0;
        flows[flowIndex + 1] = particle.windProjection?.y || -1;
        flows[flowIndex + 2] = particle.windProjection?.pressure || 0;
        flows[flowIndex + 3] = particle.windProjection?.massContrast || 0;
        const poseWeightIndex = index * 4;
        const weights = threeSheetParticlePoseWeights(particle);
        poseWeights[poseWeightIndex] = weights[0];
        poseWeights[poseWeightIndex + 1] = weights[1];
        poseWeights[poseWeightIndex + 2] = weights[2];
        poseWeights[poseWeightIndex + 3] = weights[3];
      }
      offsetAttribute.needsUpdate = true;
      scaleAttribute.needsUpdate = true;
      angleAttribute.needsUpdate = true;
      surfaceAttribute.needsUpdate = true;
      poseWeightAttribute.needsUpdate = true;
      lightDeformAttribute.needsUpdate = true;
      flowAttribute.needsUpdate = true;
      renderer.render(scene, camera);
      if (typeof window !== "undefined") {
        window.__roleplayThreeSheetParticles = {
          ...(window.__roleplayThreeSheetParticles || {}),
          [layerKey]: {
            count: activeParticles.length,
            preset: normalized.preset,
            rotationModel: "无追风航向自转；薄片使用前后双层表面、透视相机、长轴/横轴三维翻转、正反面分色和柔和侧缘厚度提示",
            sizeLimitPx: normalized.size,
            sizeModel: "按最终屏幕外接尺寸限制，片状粒子先按对角线和弯面投影余量反推贴图高度",
            maxVisualBoundPx: Math.max(...activeParticles.map((particle) => Math.hypot(particle.width, particle.height))),
            spawnEdges: normalized.spawnEdges,
            spawnDebug: activeParticles.slice(0, 18).map((particle) => ({
              edge: particle.spawnEdge,
              range: particle.spawnRange,
              along: particle.spawnAlong,
              x: Math.round(particle.x),
              y: Math.round(particle.y),
              active: Boolean(particle.active)
            })),
            activeCount: activeParticles.filter((particle) => particle.active).length,
            windEvents: safeArray(fieldHost.roleplayWindFieldState?.events).map((event) => ({
              id: event.id,
              x: event.x,
              y: event.y,
              radius: event.radius,
              strength: event.strength,
              hits: event.hits,
              ageMs: now - event.startAt,
              remainingMs: event.endAt - now
            })),
            sample: activeParticles.slice(0, 12).map((particle) => {
              const lightDeform = particle.lightDeform || {};
              const windProjection = particle.windProjection || {};
              const yawDrive = (Number(particle.yaw) || 0) * 3.20 + (Number(lightDeform.x) || 0) * 0.16;
              const yawBase = 1.10 * Math.tanh(yawDrive);
              const flowPressure = Math.max(0, Math.min(1.6, Number(windProjection.pressure) || 0));
              const massContrast = Math.max(0, Math.min(1, Number(windProjection.massContrast) || 0));
              const sideWindLoad = Math.abs(Number(lightDeform.x) || 0) * (0.58 + flowPressure * 0.28);
              const surfaceWindLoad = flowPressure * (0.36 + (Number(lightDeform.lift) || 0) * 0.26);
              const windFlipDrive = Math.max(0, Math.min(1, Math.pow(Math.max(0, sideWindLoad + surfaceWindLoad + massContrast * 0.12), 1.12)));
              const visualYaw = yawBase + (1.76 * Math.tanh(yawDrive * (1.12 + windFlipDrive * 0.72)) - yawBase) * windFlipDrive;
              const visualPitch = 0.94 * Math.tanh((Number(particle.pitch) || 0) * 2.55 - (Number(lightDeform.y) || 0) * 0.10);
              return {
                active: Boolean(particle.active),
                spawnReadyAt: particle.spawnReadyAt,
                bodyRoll: particle.bodyRoll,
                bodyRollRest: particle.bodyRollRest,
                yaw: particle.yaw,
                pitch: particle.pitch,
                twist: particle.twist,
                shaderVisualYaw: visualYaw,
                shaderVisualPitch: visualPitch,
                windFlipDrive,
                shaderBackFaceLikelyVisible: Math.cos(visualYaw) * Math.cos(visualPitch) < 0,
                mass: particle.mass,
                width: particle.width,
                height: particle.height,
                visualBoundPx: Math.hypot(particle.width, particle.height),
                spawnEdge: particle.spawnEdge,
                spawnRange: particle.spawnRange,
                spawnAlong: particle.spawnAlong,
                physicalMassKg: particle.physicalMassKg,
                weightNewton: particle.weightNewton,
                materialDensityKgM3: particle.materialDensityKgM3,
                projectedAreaMm2: particle.projectedAreaMm2,
                dragAreaM2: particle.dragAreaM2,
                ballisticCoefficientKgM2: particle.ballisticCoefficientKgM2,
                weightScale: particle.weightScale,
                centerOfMass: particle.centerOfMass,
                weightDistribution: particle.weightDistribution,
                aerodynamics: particle.aerodynamics,
                lightDeform: particle.lightDeform,
                windProjection: particle.windProjection,
                localWindResponse: particle.localWindResponse,
                pressureCenter: particle.pressureCenter,
                angularInertia: particle.angularInertia,
                bend: particle.bend,
                curl: particle.curl,
                poseWeights: threeSheetParticlePoseWeights(particle)
              };
            })
          }
        };
      }
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scene.remove(mesh);
      geometry.dispose();
      geometryBase.dispose();
      material.uniforms.map.value?.dispose?.();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (typeof window !== "undefined" && window.__roleplayThreeSheetParticles) {
        delete window.__roleplayThreeSheetParticles[layerKey];
      }
    };
  }, [renderKey, count]);

  if (!normalized.enabled || count <= 0 || normalized.opacity <= 0) return null;
  return (
    <div
      key={renderKey}
      ref={rootRef}
      id={`roleplay-three-sheet-particles-${layerKey}`}
      className={`particle-canvas particle-canvas-${layerKey} particles-${normalized.preset} three-sheet-particle-layer`}
      aria-hidden="true"
    />
  );
}

function backgroundFileExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

function backgroundFileAllowed(file, formats) {
  const ext = backgroundFileExtension(file);
  const allowed = new Set((formats || []).map((item) => String(item || "").toLowerCase()));
  return allowed.has(ext);
}

function revokeBackgroundObjectUrls(settings) {
  const normalized = normalizeBackgroundSettings(settings);
  if (normalized.localUrl) URL.revokeObjectURL(normalized.localUrl);
  for (const item of normalized.localPlaylist) {
    if (item?.url) URL.revokeObjectURL(item.url);
  }
}

function collectBackgroundObjectUrls(settings) {
  const normalized = normalizeBackgroundSettings(settings);
  return new Set([
    normalized.localUrl,
    ...normalized.localPlaylist.map((item) => item?.url || "")
  ].filter((url) => url.startsWith("blob:")));
}

function revokeStaleBackgroundObjectUrls(previous, next) {
  const previousUrls = collectBackgroundObjectUrls(previous);
  const nextUrls = collectBackgroundObjectUrls(next);
  for (const url of previousUrls) {
    if (!nextUrls.has(url)) URL.revokeObjectURL(url);
  }
}

function revokeDraftOnlyBackgroundObjectUrls(draft, committed) {
  const committedUrls = collectBackgroundObjectUrls(committed);
  for (const url of collectBackgroundObjectUrls(draft)) {
    if (!committedUrls.has(url)) URL.revokeObjectURL(url);
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function planningRunCount(run, key) {
  const direct = safeArray(run?.[key]).length;
  if (direct > 0) return direct;
  const counts = run?.counts && typeof run.counts === "object" ? run.counts : {};
  return Math.max(0, Number(counts[key] || 0) || 0);
}

function shortText(value, length = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function formatPlanningFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 KB";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function isPlannerDroppedTextFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return type.startsWith("text/")
    || ["application/json", "application/xml", "application/x-yaml"].includes(type)
    || PLANNING_DROPPED_TEXT_EXTENSIONS.has(extension);
}

function clipPlanningDroppedFileText(text) {
  const source = String(text || "");
  const clipped = source.slice(0, PLANNING_DROPPED_FILE_MAX_CHARS);
  return {
    text: clipped,
    truncated: clipped.length < source.length,
    originalChars: source.length
  };
}

function normalizePlanningComposerAttachmentFile(file, index = 0) {
  if (!file || typeof file !== "object") return null;
  const name = String(file.name || file.label || `拖入文件 ${index + 1}`).trim();
  const text = String(file.text || "").slice(0, PLANNING_DROPPED_FILE_MAX_CHARS);
  if (!name && !text) return null;
  return {
    id: String(file.id || `drop:${name}:${file.size || 0}:${file.lastModified || 0}:${text.length}`),
    type: "dropped_file",
    typeLabel: "文件",
    color: file.color || "cyan",
    label: name,
    detail: String(file.detail || `${formatPlanningFileSize(file.size)}${file.truncated ? " · 已截取" : ""}`),
    name,
    size: Number(file.size || 0),
    lastModified: Number(file.lastModified || 0),
    text,
    truncated: Boolean(file.truncated),
    originalChars: Number(file.originalChars || text.length || 0)
  };
}

function buildPlanningMessageAttachments({ mentions = [], files = [] } = {}) {
  return {
    mentions: safeArray(mentions).map((mention) => ({
      id: String(mention.id || ""),
      type: String(mention.type || ""),
      typeLabel: String(mention.typeLabel || planningMentionTypeLabel(mention.type)),
      label: String(mention.label || ""),
      detail: String(mention.detail || ""),
      color: String(mention.color || planningMentionTypeColor(mention.type))
    })).filter((mention) => mention.id || mention.label),
    files: safeArray(files).map(normalizePlanningComposerAttachmentFile).filter(Boolean)
  };
}

function planningMessageAttachmentFiles(message) {
  return safeArray(message?.attachments?.files).map(normalizePlanningComposerAttachmentFile).filter(Boolean);
}

function planningMessageAttachmentMentions(message) {
  return safeArray(message?.attachments?.mentions).map((mention) => ({
    id: String(mention.id || ""),
    type: String(mention.type || ""),
    typeLabel: String(mention.typeLabel || planningMentionTypeLabel(mention.type)),
    label: String(mention.label || ""),
    detail: String(mention.detail || ""),
    color: String(mention.color || planningMentionTypeColor(mention.type))
  })).filter((mention) => mention.id || mention.label);
}

function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatElapsedTime(startValue, endValue = Date.now()) {
  const start = new Date(startValue || "").getTime();
  const end = typeof endValue === "number" ? endValue : new Date(endValue || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "0s";
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function splitLines(value) {
  return String(value || "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value) {
  return safeArray(value).join("\n");
}

function prettyJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value || "");
  }
}

function parseJsonField(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return JSON.parse(text);
}

function tryParsePlanningJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function makeRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function makePlanningBranchId() {
  return `branch_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

const PLANNING_THREAD_PAGE_SIZE = 40;
const PLANNING_THREAD_PRELOAD_TOP = 180;
const PLANNING_DROPPED_FILE_LIMIT = 8;
const PLANNING_DROPPED_FILE_MAX_BYTES = 3 * 1024 * 1024;
const PLANNING_DROPPED_FILE_MAX_CHARS = 60000;
const PLANNING_DROPPED_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "jsonl",
  "csv",
  "tsv",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "java",
  "cs",
  "cpp",
  "c",
  "h",
  "hpp",
  "rs",
  "go",
  "rb",
  "php",
  "sql",
  "log",
  "ini",
  "toml"
]);

function mergePlanningMessages(...groups) {
  const map = new Map();
  groups.flatMap((group) => safeArray(group)).forEach((message) => {
    if (!message?.id) return;
    map.set(message.id, { ...(map.get(message.id) || {}), ...message });
  });
  const serverIdentityKeys = new Set();
  for (const message of map.values()) {
    if (message.clientOptimistic) continue;
    serverIdentityKeys.add([
      message.runId || "",
      message.role || "",
      String(message.content || "").trim()
    ].join("\u0001"));
  }
  return Array.from(map.values()).sort((left, right) => {
    const byTime = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
    if (byTime !== 0) return byTime;
    return String(left.id || "").localeCompare(String(right.id || ""));
  }).filter((message) => {
    if (!message.clientOptimistic) return true;
    const key = [
      message.runId || "",
      message.role || "",
      String(message.content || "").trim()
    ].join("\u0001");
    return !serverIdentityKeys.has(key);
  });
}

function mergePlanningRunSnapshots(previous, incoming) {
  if (!incoming?.id) return previous || null;
  const terminalStatuses = new Set(["completed", "failed", "cancelled", "blocked", "paused"]);
  const incomingStatus = String(incoming.status || "");
  const incomingIsTerminal = terminalStatuses.has(incomingStatus) || isPlanningRunDisplayTerminal(incoming);
  if (!previous?.id || previous.id !== incoming.id) {
    return {
      ...incoming,
      branchId: normalizeClientPlanningBranchId(incoming.branchId || "main"),
      clientOptimistic: incomingIsTerminal ? false : Boolean(incoming.clientOptimistic)
    };
  }
  const previousStatus = String(previous.status || "");
  const previousIsTerminal = terminalStatuses.has(previousStatus) || isPlanningRunDisplayTerminal(previous);
  const incomingUpdatedAt = Date.parse(incoming.updatedAt || incoming.finishedAt || incoming.createdAt || "");
  const previousUpdatedAt = Date.parse(previous.updatedAt || previous.finishedAt || previous.createdAt || "");
  const incomingLooksNewer = Number.isFinite(incomingUpdatedAt) && (!Number.isFinite(previousUpdatedAt) || incomingUpdatedAt >= previousUpdatedAt);
  const incomingDowngradesPreparing = !incomingIsTerminal
    && ["running", "awaiting_approval"].includes(previousStatus)
    && incomingStatus === "queued";
  const incomingDowngradesPhase = !incomingIsTerminal
    && ["preparing", "starting", "running"].includes(String(previous.phase || ""))
    && String(incoming.phase || "") === "queued";
  const incomingDowngradesTerminal = previousIsTerminal
    && !incomingIsTerminal
    && incomingStatus === "running"
    && !isPlanningRunPersisting(incoming);
  // 终态快照必须优先于本地 running / preparing 快照。
  // SSE 与轮询可能乱序，旧运行态不能因为 updatedAt 解析失败而覆盖 completed。
  const incomingTerminalWins = incomingIsTerminal && (!previousIsTerminal || incomingLooksNewer || !Number.isFinite(incomingUpdatedAt));
  const mergeById = (left, right) => {
    const map = new Map();
    safeArray(left).forEach((item, index) => map.set(item?.id || `left_${index}`, item));
    safeArray(right).forEach((item, index) => {
      const key = item?.id || `right_${index}`;
      map.set(key, { ...(map.get(key) || {}), ...item });
    });
    return Array.from(map.values());
  };
  const next = {
    ...previous,
    ...incoming,
    status: incomingTerminalWins ? incoming.status : incomingDowngradesTerminal || incomingDowngradesPreparing ? previous.status : incoming.status,
    phase: incomingTerminalWins ? incoming.phase : incomingDowngradesTerminal || incomingDowngradesPhase ? previous.phase : incoming.phase,
    events: mergeById(previous.events, incoming.events),
    items: mergeById(previous.items, incoming.items),
    parts: mergeById(previous.parts, incoming.parts),
    publicParts: incomingIsTerminal
      ? safeArray(incoming.publicParts)
      : mergeById(previous.publicParts, incoming.publicParts),
    // 终态 run 的 displaySteps 是后端整理后的“公开过程流”。
    // 这里不能再把运行中旧步骤合并进去，否则页面会在不刷新时残留
    // “正在检查 / 检查完成 / 思考下一步”等中间态，违背完成后自动收纳语义。
    displaySteps: incomingIsTerminal
      ? safeArray(incoming.displaySteps)
      : mergeById(previous.displaySteps, incoming.displaySteps),
    processSteps: incomingIsTerminal
      ? safeArray(incoming.processSteps)
      : mergeById(previous.processSteps, incoming.processSteps),
    turnItems: incomingIsTerminal
      ? safeArray(incoming.turnItems)
      : mergeById(previous.turnItems, incoming.turnItems),
    activityTimeline: incomingIsTerminal
      ? safeArray(incoming.activityTimeline)
      : mergeById(previous.activityTimeline, incoming.activityTimeline),
    approvals: mergeById(previous.approvals, incoming.approvals),
    diagnostics: mergeById(previous.diagnostics, incoming.diagnostics),
    checkpoints: mergeById(previous.checkpoints, incoming.checkpoints),
    novelId: incoming.novelId || previous.novelId || "",
    branchId: normalizeClientPlanningBranchId(incoming.branchId || previous.branchId || "main"),
    clientOptimistic: incomingIsTerminal ? false : Boolean(previous.clientOptimistic || incoming.clientOptimistic)
  };
  if (!incoming.status) next.status = previous.status;
  if (!incoming.phase) next.phase = previous.phase;
  return next;
}

function normalizeClientPlanningBranchId(value) {
  const text = String(value || "main").trim();
  return text || "main";
}

function planningMessagesBeforeEditPoint(messages, editDraft) {
  const sourceBranchId = normalizeClientPlanningBranchId(editDraft?.branchId || "main");
  const targetMessageId = String(editDraft?.messageId || "").trim();
  const targetRunId = String(editDraft?.runId || "").trim();
  const sourceMessages = safeArray(messages).filter((message) => normalizeClientPlanningBranchId(message.branchId || "main") === sourceBranchId);
  let targetIndex = sourceMessages.findIndex((message) => message.id === targetMessageId);
  if (targetIndex < 0 && targetRunId) {
    targetIndex = sourceMessages.findIndex((message) => message.role === "user" && message.runId === targetRunId);
  }
  if (targetIndex < 0) return sourceMessages;
  return sourceMessages.slice(0, targetIndex);
}

function findPendingEditOptimisticMessage(messages, branchId = "") {
  const targetBranchId = branchId ? normalizeClientPlanningBranchId(branchId) : "";
  return safeArray(messages).find((message) => {
    if (!message?.clientOptimistic || !message.replaceFromMessageId) return false;
    if (!targetBranchId) return true;
    return normalizeClientPlanningBranchId(message.branchId || "main") === targetBranchId;
  }) || null;
}

function buildPlanningEditOptimisticMessages(messages, editDraft, optimisticUserMessage) {
  const baseMessages = planningMessagesBeforeEditPoint(messages, editDraft);
  return mergePlanningMessages(baseMessages, [optimisticUserMessage]);
}

function mergePlanningMessagesWithPendingEdit(previousMessages, incomingMessages, options = {}) {
  const pendingEdit = findPendingEditOptimisticMessage(previousMessages, options.branchId || "");
  if (!pendingEdit) return mergePlanningMessages(previousMessages, incomingMessages);
  const editPoint = {
    branchId: pendingEdit.branchId || options.branchId || "main",
    messageId: pendingEdit.replaceFromMessageId,
    runId: pendingEdit.replaceFromRunId || pendingEdit.forkFromRunId || ""
  };
  const previousBase = planningMessagesBeforeEditPoint(previousMessages, editPoint);
  const incomingList = safeArray(incomingMessages).filter((message) => normalizeClientPlanningBranchId(message.branchId || "main") === normalizeClientPlanningBranchId(editPoint.branchId || "main"));
  const incomingHasReplacementRun = incomingList.some((message) => message.runId && message.runId === pendingEdit.runId);
  const incomingHasEditedServerMessage = incomingList.some((message) => (
    message.role === "user"
    && !message.clientOptimistic
    && String(message.content || "").trim() === String(pendingEdit.content || "").trim()
  ));
  const safeIncoming = incomingHasReplacementRun || incomingHasEditedServerMessage
    ? incomingList
    : planningMessagesBeforeEditPoint(incomingList, editPoint);
  const pendingStillNeeded = incomingHasReplacementRun || incomingHasEditedServerMessage ? [] : [pendingEdit];
  return mergePlanningMessages(previousBase, safeIncoming, pendingStillNeeded);
}

function buildPlanningContinuationPrompt(run, fallbackMessage = "") {
  const preview = String(run?.userMessagePreview || fallbackMessage || "").trim();
  return [
    "继续上一轮未完成的策划会话。",
    run?.id ? `上一轮编号：${run.id}` : "",
    preview ? `原始消息：${preview}` : "",
    "请先根据当前会话、运行轨迹、工具观察和已写入资料判断还缺什么，再继续检索、编辑、检查或收束。"
  ].filter(Boolean).join("\n");
}

function planningRunStatusLabel(status) {
  return {
    queued: "排队中",
    running: "运行中",
    awaiting_approval: "等待确认",
    completed: "已完成",
    failed: "失败",
    cancelled: "已终止",
    blocked: "已阻断",
    paused: "已暂停"
  }[String(status || "")] || "未知";
}

function planningRunPhaseLabel(phase) {
  return {
    queued: "等待运行",
    preparing: "整理上下文",
    starting: "开始处理",
    running: "正在处理",
    model_call: "正在思考",
    tool_execution: "处理资料",
    evidence: "读取资料",
    sub_agent: "协同处理",
    observation: "整理结果",
    planning: "整理计划",
    steering: "继续处理",
    context_budget: "整理上下文",
    json_repair: "整理模型输出",
    self_review: "检查结果",
    verifier: "检查结果",
    persisting: "保存结果",
    awaiting_approval: "等待确认",
    approval_approved: "确认已批准",
    approval_rejected: "确认已拒绝",
    awaiting_user: "等待你继续",
    completed: "已完成",
    failed: "失败",
    cancelled: "已终止",
    safety_budget: "运行保护",
    safety_budget_paused: "运行保护暂停",
    tool_opportunity_paused: "等待继续处理",
    blocked: "已阻断"
  }[String(phase || "")] || "正在处理";
}

function planningTaskStatusLabel(status) {
  return {
    pending: "待办",
    in_progress: "进行中",
    completed: "完成",
    blocked: "阻断"
  }[String(status || "")] || "待办";
}

function planningReviewStatusLabel(status) {
  return {
    passed: "通过",
    warning: "警告",
    failed: "失败",
    skipped: "跳过"
  }[String(status || "")] || "未知";
}

function isPlanningRunTerminal(run) {
  return ["completed", "failed", "cancelled", "blocked", "paused"].includes(String(run?.status || ""));
}

function isPlanningRunPersisting(run) {
  return String(run?.phase || "") === "persisting" || run?.persisting === true;
}

function isPlanningRunDisplayTerminal(run) {
  if (!run) return false;
  if (isPlanningRunTerminal(run)) return true;
  // 后端在最终快照落盘前会短暂广播 persisting。它不是可继续的模型思考态，
  // UI 应按“结果已出，正在同步”处理，避免主消息卡在正在思考。
  return isPlanningRunPersisting(run) && Boolean(run.messageId || run.finishedAt || safeArray(run.parts).length || safeArray(run.displaySteps).length || safeArray(run.processSteps).length || safeArray(run.turnItems).length);
}

function isPlanningRunPlainAwaitingReply(run) {
  const status = String(run?.status || "");
  const hasReply = Boolean(String(run?.reply || run?.assistantMessagePreview || "").trim());
  if (!hasReply) return false;
  const userText = String(run?.userMessagePreview || run?.userMessage || "").trim();
  const explicitReplyOnly = planningDisplayTextLooksLikeLightReplyRequest(userText);
  if (status !== "completed" && !(status === "blocked" && explicitReplyOnly)) return false;
  const toolReport = run?.skillOpReport || {};
  const toolCount = safeArray(toolReport.searches).length
    + safeArray(toolReport.applied).length
    + safeArray(toolReport.preflights).length
    + safeArray(toolReport.skipped).length
    + safeArray(toolReport.evidenceReads).length
    + safeArray(toolReport.nativeToolCalls).length;
  const hasVisibleToolPart = safeArray(run?.parts).some((part) => {
    const type = String(part?.type || "");
    if (type === "assistant_text" || type === "review" || type === "status") return false;
    return ["tool", "approval"].includes(type);
  });
  const visibleParts = visiblePlanningRunParts(run?.parts, { compact: true, live: false });
  const visibleDisplaySteps = safeArray(run?.displaySteps)
    .filter((step) => shouldShowPlanningCodexServerStep(step, false))
    .map((step, index) => normalizePlanningCodexDisplayStep(step, index))
    .filter(Boolean);
  const onlySyntheticReviewSteps = visibleDisplaySteps.length > 0 && visibleDisplaySteps.every((step) => {
    const text = String(step?.text || "");
    return /思考下一步|检查通过|自然语言回复已完成|已检查\s*\d+\s*项|确定性完成判定|模型审查|自检未发现明显/.test(text);
  });
  const hasUserVisibleProcess = visibleParts.some((part) => {
    if (part.type === "tool") return true;
    if (part.type === "approval" && part.status === "awaiting_approval") return true;
    if (explicitReplyOnly && part.type === "review") return false;
    if (part.type === "review") {
      return !/自然语言回复已完成|检查通过|自检未发现明显/.test(String(part.text || ""));
    }
    return false;
  }) || (visibleDisplaySteps.length > 0 && !onlySyntheticReviewSteps);
  const hasHardCheck = !explicitReplyOnly && (["failed", "blocked", "warning"].includes(String(run?.completionVerifier?.status || ""))
    || ["failed", "blocked", "warning"].includes(String(run?.selfReview?.status || ""))
    || safeArray(run?.diagnostics).some((item) => item?.retryable === false || ["error", "warning"].includes(String(item?.level || ""))));
  // 兼容旧运行：早期轻回复可能被自动证据调度误跑过项目检索。
  // 只要用户明确要求“只回复 / 不检索 / 不读取 / 不写入”，并且没有真正用户可见的写入、审批或失败，
  // 主消息流就按普通回复收束，不再把模型审查和后台检索当成 Codex 过程展示。
  if (explicitReplyOnly && !hasUserVisibleProcess && !hasHardCheck) return true;
  return toolCount === 0 && !hasVisibleToolPart && !hasUserVisibleProcess && !hasHardCheck;
}

function isPlanningRunSoftToolPause(run) {
  if (!run) return false;
  const phase = String(run.phase || "");
  const reason = String(run.clientStatusReason || run.resumeState?.reason || "");
  if (phase === "tool_opportunity_paused" || reason === "soft_tool_opportunity_pause" || reason === "tool_opportunity_wait") return true;
  return safeArray(run.diagnostics).some((item) => String(item?.code || "") === "agent.tool_opportunity_repeated");
}

function planningToolStats(report) {
  const searches = safeArray(report?.searches);
  const applied = safeArray(report?.applied);
  const preflights = safeArray(report?.preflights);
  const skipped = safeArray(report?.skipped);
  const evidenceReads = safeArray(report?.evidenceReads);
  const nativeToolCalls = safeArray(report?.nativeToolCalls);
  const requested = Number(report?.requested || 0);
  const total = searches.length + applied.length + preflights.length + skipped.length + nativeToolCalls.length;
  return {
    total: total || requested,
    requested,
    searches: searches.length,
    writes: applied.length,
    checks: preflights.length,
    skipped: skipped.length,
    evidenceReads: evidenceReads.length,
    nativeToolCalls: nativeToolCalls.length
  };
}

function planningRunEventStats(run) {
  const events = safeArray(run?.events);
  const items = safeArray(run?.items);
  const toolEvents = events.filter((event) => event.phase === "tool_execution" && event.type !== "phase");
  const toolItems = items.filter((item) => item.phase === "tool_execution" || item.type === "tool_call" || item.type === "tool_result");
  const evidenceItems = items.filter((item) => item.phase === "evidence" || item.type === "evidence_read" || item.type === "evidence_plan");
  const toolTimeline = buildPlanningToolTimeline({ items, events, evidencePlan: run?.evidencePlan });
  const modelEvents = events.filter((event) => event.phase === "model_call");
  const modelItems = items.filter((item) => item.phase === "model_call" || item.type === "model_call");
  const modelLabel = planningRunModelLabel(run);
  const latestEvent = [...events].reverse().find((event) => event.message) || null;
  const latestItem = [...items].reverse().find((item) => item.title || item.summary) || null;
  return {
    total: events.length,
    itemTotal: items.length,
    tools: toolTimeline.length || toolEvents.length + toolItems.length,
    rawTools: toolEvents.length + toolItems.length,
    evidenceReads: evidenceItems.length,
    modelCalls: modelEvents.length + modelItems.length,
    modelLabel,
    latest: latestItem ? { message: latestItem.title || latestItem.summary, createdAt: latestItem.createdAt } : latestEvent,
    toolEvents
  };
}

function planningRunModelLabel(run) {
  const model = run?.plannerModel || {};
  const provider = model.providerName || model.providerId || "";
  return [provider, model.model].filter(Boolean).join(" / ");
}

function planningToolKindLabel(type) {
  return {
    search: "查找资料",
    searchContextAssets: "定位文件",
    readContextAsset: "读取文件内容",
    readMessageAttachment: "读取拖入文件",
    searchLocalFiles: "查找文件",
    readLocalFile: "读取文件内容",
    listFiles: "读取资料目录",
    globFiles: "匹配文件",
    grepFiles: "搜索文件内容",
    indexLocalFiles: "整理资料目录",
    readFile: "读取文件",
    writeFile: "写入文件",
    previewPatchFile: "预览补丁",
    applyPatch: "应用补丁",
    patchFile: "补丁编辑文件",
    revertPatch: "回滚补丁",
    revertFilePatch: "回滚补丁",
    previewPatchSet: "预览补丁集",
    applyPatchSet: "应用补丁集",
    revertPatchSet: "回滚补丁集",
    runShell: "运行命令",
    startShellSession: "启动持续命令",
    writeShellSession: "写入持续命令",
    readShellSession: "读取命令输出",
    stopShellSession: "停止持续命令",
    startShellJob: "启动后台命令",
    listShellJobs: "查看后台命令",
    readShellJob: "读取后台命令",
    stopShellJob: "停止后台命令",
    webFetch: "读取网页",
    webSearch: "联网搜索",
    spawnSubAgent: "子 Agent",
    inspectNovelDiagnostics: "小说资料诊断器",
    customTool: "自定义工具",
    mcpTool: "MCP 工具",
    upsertMemory: "写入记忆",
    patchMemory: "编辑记忆",
    retireMemory: "退役记忆",
    upsertLorebook: "写入世界书",
    patchLorebook: "编辑世界书",
    deleteLorebook: "删除世界书",
    updateCharacterCard: "更新角色卡",
    markArchiveRecord: "标记档案",
    patchArchiveRecord: "编辑档案",
    deleteArchiveRecord: "删除档案",
    upsertProseDraft: "新建正文草稿",
    patchProseDraft: "编辑正文草稿",
    annotateTurn: "审查扮演",
    updateAiSlot: "切换模型槽位",
    addProviderModel: "添加模型",
    applyArchivePatch: "写入项目档案",
    generateRoleplayConfigDraft: "生成扮演配置",
    generatePrewritePlan: "生成写前定位",
    runRoleplayTurn: "运行扮演轮次",
    reviewLatestTurn: "审查最近扮演",
    adaptRoleplayToProse: "扮演改写正文",
    postwriteProse: "正文写后回写",
    runNormalWritingWorkflow: "正常行文",
    runChapterWorkflow: "扮演行文"
  }[String(type || "")] || String(type || "工具");
}

function planningReferenceKindLabel(ref) {
  const source = ref && typeof ref === "object" ? ref : {};
  const kind = String(source.kind || source.source?.type || "").toLowerCase();
  const title = String(source.title || source.relativePath || source.path || source.id || "").toLowerCase();
  const looksLikeFile = planningLooksLikeFileReference(source);
  if (kind.includes("compaction")) return "压缩历史";
  if (kind.includes("prose")) return "正文原文";
  if (kind.includes("turn") || kind.includes("transcript") || title.includes("transcript")) return "扮演记录";
  if (kind.includes("file") || looksLikeFile) return "文件内容";
  if (kind.includes("tool_report") || kind.includes("tool_result") || kind.includes("tool")) return "资料结果";
  return "资料";
}

function planningReferenceTitle(ref) {
  const source = ref && typeof ref === "object" ? ref : {};
  return source.title || source.relativePath || source.path || source.id || "未命名引用";
}

// 将后端的长内容引用还原成用户能理解的文件对象，避免主界面暴露 asset、run、context 等内部调度概念。
function planningLooksLikeFileReference(value) {
  const source = value && typeof value === "object" ? value : {};
  const kind = String(source.kind || source.source?.type || "").toLowerCase();
  const raw = String(source.title || source.relativePath || source.path || source.source?.id || source.id || value || "");
  if (kind === "local_file" || kind.includes("file")) return true;
  return /\.(md|markdown|txt|json|jsonl|ya?ml|csv|docx?|rtf|html?|xml)$/i.test(raw.trim());
}

function planningFileNameFromReference(value) {
  const source = value && typeof value === "object" ? value : {};
  const raw = String(source.title || source.relativePath || source.path || source.source?.id || source.id || value || "").trim();
  if (!raw || (!planningLooksLikeFileReference(source) && !planningLooksLikeFileReference(raw))) return "";
  return raw.replace(/\\/g, "/").split("/").filter(Boolean).pop() || raw;
}

function planningToolEntryFileNames(entry) {
  const names = [];
  const add = (value) => {
    const name = planningFileNameFromReference(value);
    if (name) names.push(name);
  };
  safeArray(entry?.assetRefs).forEach(add);
  safeArray(entry?.topResults).forEach((result) => {
    if (planningLooksLikeFileReference(result)) add(result);
  });
  safeArray(entry?.results).forEach((result) => {
    collectPlanningToolTopResults(result).forEach((item) => {
      if (planningLooksLikeFileReference(item)) add(item);
    });
  });
  safeArray(entry?.queries).forEach(add);
  safeArray(entry?.groupedTargets).forEach(add);
  return uniqueStrings(names).slice(0, 12);
}

function planningToolEntryObjectKind(entry) {
  if (planningToolEntryFileNames(entry).length > 0) return "file";
  const ref = safeArray(entry?.assetRefs)[0] || safeArray(entry?.topResults)[0] || null;
  return planningReferenceKindLabel(ref);
}

function planningToolIsContextFileFlow(entry) {
  const toolType = String(entry?.toolType || "");
  return ["searchContextAssets", "readContextAsset", "readLocalFile", "readFile", "readMessageAttachment"].includes(toolType) && planningToolEntryFileNames(entry).length > 0;
}

function planningToolFileTarget(entry) {
  const names = planningToolEntryFileNames(entry);
  if (!names.length) return "";
  const visible = names.slice(0, 3).join("；");
  return `${names.length} 个文件：${visible}${names.length > 3 ? " 等" : ""}`;
}

function planningToolResultKindLabel(result) {
  const kind = String(result?.kind || result?.source?.type || "").toLowerCase();
  if (kind === "local_file") return "文件";
  return planningReferenceKindLabel(result?.assetRef || result);
}

function planningToolResultDisplaySnippet(result) {
  const raw = String(result?.snippet || "").trim();
  if (!raw) return "";
  const looksInternalJson = /"toolType"\s*:|"result"\s*:|"source"\s*:|tool_asset_|context_asset|run_[a-z0-9_]+/i.test(raw);
  if (looksInternalJson) {
    return "";
  }
  return raw;
}

function planningReadableEvidenceLayerLabel(layer) {
  return {
    message_attachments: "拖入文件",
    context_assets: "历史资料索引",
    context_asset_reads: "读取历史资料",
    project_rag: "项目资料",
    workspace_files: "工作区文件",
    external_local_files: "本轮文件",
    recent_external_files: "最近文件夹",
    agent_runtime: "运行资料"
  }[String(layer || "")] || "证据";
}

function planningToolActionLabel(entry) {
  const toolType = String(entry?.toolType || entry || "");
  if (toolType === "readMessageAttachment") return "读取拖入文件";
  if (["readLocalFile", "readFile"].includes(toolType) && planningToolEntryFileNames(entry).length > 0) {
    return "读取文件内容";
  }
  if (toolType === "readContextAsset") {
    const kind = planningToolEntryObjectKind(entry);
    return {
      file: "读取文件内容",
      文件内容: "读取文件内容",
      压缩历史: "读取压缩摘要",
      正文原文: "读取正文原文",
      扮演记录: "读取扮演记录",
      资料结果: "读取资料结果",
      工具结果: "读取资料结果",
      历史证据: "读取历史资料"
    }[kind] || "读取历史资料";
  }
  if (toolType === "searchContextAssets") return planningToolEntryFileNames(entry).length ? "定位文件" : "查找资料";
  return planningToolKindLabel(toolType);
}

function planningToolActionStatusLabel(status) {
  return {
    completed: "完成",
    running: "运行中",
    failed: "失败",
    skipped: "跳过",
    blocked: "阻断",
    paused: "暂停",
    cancelled: "取消",
    awaiting_approval: "待确认",
    read: "已读取",
    applied: "已写入"
  }[String(status || "")] || "未知";
}

function planningToolActionStatusColor(status) {
  if (["completed", "read", "applied"].includes(String(status || ""))) return "green";
  if (["failed", "blocked", "cancelled"].includes(String(status || ""))) return "red";
  if (["running", "awaiting_approval", "paused"].includes(String(status || ""))) return "orange";
  return "gray";
}

function planningToolActionStatusTone(status) {
  if (["completed", "read", "applied"].includes(String(status || ""))) return "done";
  if (["failed", "blocked", "cancelled"].includes(String(status || ""))) return "danger";
  if (["running", "awaiting_approval", "paused"].includes(String(status || ""))) return "warning";
  return "muted";
}

function planningToolActionKind(toolType) {
  if (["upsertMemory", "patchMemory", "retireMemory", "upsertLorebook", "patchLorebook", "deleteLorebook", "updateCharacterCard", "markArchiveRecord", "patchArchiveRecord", "deleteArchiveRecord", "upsertProseDraft", "patchProseDraft", "applyArchivePatch", "writeFile", "applyPatch", "patchFile", "applyPatchSet", "revertPatch", "revertFilePatch", "revertPatchSet"].includes(String(toolType || ""))) {
    return "write";
  }
  if (["runShell", "startShellSession", "writeShellSession", "readShellSession", "stopShellSession", "startShellJob", "readShellJob", "stopShellJob"].includes(String(toolType || ""))) {
    return "shell";
  }
  return "read";
}

function planningToolActionColor(entry) {
  const statusColor = planningToolActionStatusColor(entry?.status);
  if (statusColor === "red" || statusColor === "orange") return statusColor;
  if (planningToolActionKind(entry?.toolType) === "write") return "green";
  if (planningToolActionKind(entry?.toolType) === "shell") return "orange";
  if (["webSearch", "webFetch"].includes(String(entry?.toolType || ""))) return "purple";
  return "arcoblue";
}

function collectPlanningAssetRefs(...values) {
  const refs = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      if (value.assetRef) visit(value.assetRef);
      if (Array.isArray(value.assetRefs)) visit(value.assetRefs);
      if (Array.isArray(value.results)) value.results.forEach(visit);
      if (value.id && (value.kind || value.relativePath || value.hash || value.tokens || value.chars)) {
        refs.push(value);
      }
    }
  };
  values.forEach(visit);
  const map = new Map();
  for (const ref of refs) {
    const key = String(ref.id || ref.relativePath || ref.path || ref.title || "");
    if (!key || map.has(key)) continue;
    map.set(key, ref);
  }
  return Array.from(map.values());
}

function planningToolTopResultKey(result) {
  return String(result?.id || result?.path || result?.relativePath || result?.title || result?.assetRef?.id || "");
}

function normalizePlanningToolTopResultClient(result) {
  if (!result || typeof result !== "object") return null;
  const asset = collectPlanningAssetRefs(result.assetRef || result.assetRefs || [])[0] || null;
  return {
    id: String(result.id || result.source?.id || result.assetId || asset?.id || ""),
    title: String(result.title || result.name || result.relativePath || result.path || asset?.title || asset?.id || ""),
    kind: String(result.kind || result.source?.type || asset?.kind || ""),
    source: result.source && typeof result.source === "object" ? result.source : null,
    path: String(result.path || result.source?.id || ""),
    relativePath: String(result.relativePath || asset?.relativePath || ""),
    snippet: String(result.snippet || result.text || result.preview || result.summary || ""),
    score: Number(result.score || result.semanticScore || 0),
    size: Number(result.size || 0),
    updatedAt: String(result.updatedAt || ""),
    assetRef: asset
  };
}

function collectPlanningToolTopResults(...values) {
  const results = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      if (Array.isArray(value.topResults)) value.topResults.forEach(visit);
      if (Array.isArray(value.results)) value.results.forEach(visit);
      if (value.result && typeof value.result === "object") visit(value.result);
      const isContainer = ["tool_call", "tool_result", "evidence_read"].includes(String(value.type || ""))
        || Boolean(value.phase)
        || Array.isArray(value.topResults)
        || Array.isArray(value.results);
      if (!isContainer) {
        const normalized = normalizePlanningToolTopResultClient(value);
        if (normalized && (normalized.title || normalized.snippet || normalized.path || normalized.relativePath || normalized.assetRef)) {
          results.push(normalized);
        }
      }
    }
  };
  values.forEach(visit);
  const map = new Map();
  for (const result of results) {
    const key = planningToolTopResultKey(result);
    if (!key || map.has(key)) continue;
    map.set(key, result);
  }
  return Array.from(map.values()).slice(0, 12);
}

function planningToolActionTargetSeed(value) {
  const source = value && typeof value === "object" ? value : {};
  return [
    source.query,
    source.assetId,
    safeArray(source.assetIds)[0],
    source.relativePath,
    source.path,
    source.details?.path,
    source.errorDetails?.path,
    source.title,
    source.url,
    source.file,
    source.name,
    source.subject,
    source.command,
    source.cwd,
    source.id
  ].find((item) => String(item || "").trim());
}

function planningToolEvidenceKey(read) {
  const source = read && typeof read === "object" ? read : {};
  return String(source.id || `${source.layer || ""}:${source.toolType || ""}:${source.assetId || ""}:${source.query || ""}:${source.createdAt || ""}`);
}

function planningToolEntryKeyFromItem(item) {
  const toolType = String(item?.toolType || item?.data?.toolType || item?.evidenceRead?.toolType || "");
  const protocol = String(item?.protocol || item?.data?.protocol || "");
  const toolCallId = String(item?.toolCallId || item?.data?.toolCallId || "");
  if (toolCallId) return `call:${toolCallId}`;
  if (protocol === "evidence_scheduler" && toolType) return `evidence_scheduler:${toolType}`;
  const evidenceRead = item?.evidenceRead || item?.data?.evidenceRead || null;
  if (evidenceRead?.assetId) return `evidence:${toolType}:${evidenceRead.assetId}`;
  if (toolType) {
    const target = planningToolActionTargetSeed(item?.data || item)
      || String(item?.title || "").replace(/^调用工具：|^工具完成：|^读取证据：/, "").trim();
    return `item:${toolType}:${target || item?.id || item?.createdAt || ""}`;
  }
  return "";
}

function planningToolEntryKeyFromReportItem(item, bucket) {
  const toolType = String(item?.type || item?.toolType || item?.name || "");
  const toolCallId = String(item?.toolCallId || item?.callId || item?.id || "");
  if (toolCallId && (String(item?.protocol || "") === "native_tool_call" || /^tool_call|call_|stream_tool_call|fc_/.test(toolCallId))) {
    return `call:${toolCallId}`;
  }
  const asset = collectPlanningAssetRefs(item)[0];
  const target = planningToolActionTargetSeed(item);
  return `report:${bucket || "tool"}:${toolType}:${asset?.id || target || item?.id || ""}`;
}

function planningToolEntryKeyFromEvidenceRead(read) {
  const toolType = String(read?.toolType || read?.type || "");
  if (String(read?.layer || "").startsWith("context_asset") && toolType) return `evidence_scheduler:${toolType}`;
  if (toolType === "searchLocalFiles" || toolType === "searchContextAssets" || toolType === "search") return `evidence_scheduler:${toolType}`;
  return `evidence:${toolType}:${read?.assetId || read?.query || planningToolEvidenceKey(read)}`;
}

function mergePlanningToolStatus(entry, item, bucket = "") {
  const type = String(item?.type || "");
  const status = String(item?.status || "");
  entry.statuses.add(status || "completed");
  if (type === "tool_result" || bucket === "search" || bucket === "write" || bucket === "native") {
    if (status === "failed") entry.hasFailedResult = true;
    if (!status || ["completed", "read", "applied"].includes(status)) entry.hasCompletedResult = true;
  }
  if (type === "evidence_read" || bucket === "evidence") entry.hasCompletedEvidence = true;
  if (bucket === "skip") entry.hasFailedResult = true;
}

function finalizePlanningToolStatus(entry) {
  if (entry.hasFailedResult) return "failed";
  if (entry.hasCompletedResult || entry.hasCompletedEvidence || entry.evidenceReads.length > 0) return planningToolActionKind(entry.toolType) === "write" ? "applied" : "completed";
  if (entry.statuses.has("running")) return "running";
  if (entry.statuses.has("awaiting_approval")) return "awaiting_approval";
  if (entry.statuses.has("failed")) return "failed";
  if (entry.statuses.has("skipped")) return "skipped";
  return entry.statuses.values().next().value || "completed";
}

function createPlanningToolTimelineEntry(key, toolType, protocol = "") {
  return {
    key,
    toolType: toolType || "tool",
    protocol,
    status: "completed",
    statuses: new Set(),
    hasCompletedResult: false,
    hasCompletedEvidence: false,
    hasFailedResult: false,
    calls: [],
    results: [],
    evidenceReads: [],
    rawItems: [],
    rawEvents: [],
    assetRefs: [],
    assetIds: new Set(),
    resultIds: new Set(),
    queries: new Set(),
    reasons: new Set(),
    usedFor: new Set(),
    targets: new Set(),
    topResults: [],
    writePreviews: [],
    archiveDiffs: [],
    rollbackPlans: [],
    counts: [],
    sourceKinds: new Set(),
    firstAt: "",
    lastAt: ""
  };
}

function updatePlanningToolEntryTime(entry, value) {
  const createdAt = String(value?.createdAt || value?.startedAt || "");
  const completedAt = String(value?.completedAt || value?.finishedAt || createdAt || "");
  if (createdAt && (!entry.firstAt || createdAt < entry.firstAt)) entry.firstAt = createdAt;
  if (completedAt && (!entry.lastAt || completedAt > entry.lastAt)) entry.lastAt = completedAt;
}

function addPlanningToolEvidenceRead(entry, read) {
  if (!read) return;
  const key = planningToolEvidenceKey(read);
  if (!entry.evidenceReads.some((item) => planningToolEvidenceKey(item) === key)) {
    entry.evidenceReads.push(read);
  }
  if (read.query) entry.queries.add(String(read.query));
  if (read.whyRead) entry.reasons.add(String(read.whyRead));
  if (read.resultUsedFor) entry.usedFor.add(String(read.resultUsedFor));
  if (read.assetId) entry.assetIds.add(String(read.assetId));
  safeArray(read.resultIds).forEach((id) => entry.resultIds.add(String(id)));
  if (Number(read.count || 0) > 0) entry.counts.push(Number(read.count || 0));
  entry.topResults = mergePlanningToolTopResults(entry.topResults, collectPlanningToolTopResults(read));
  updatePlanningToolEntryTime(entry, read);
  mergePlanningToolStatus(entry, { type: "evidence_read", status: "completed" }, "evidence");
}

function addPlanningToolAssetRefs(entry, ...values) {
  const next = collectPlanningAssetRefs(...values);
  const map = new Map(entry.assetRefs.map((asset) => [String(asset.id || asset.relativePath || asset.path || asset.title || ""), asset]));
  for (const asset of next) {
    const key = String(asset.id || asset.relativePath || asset.path || asset.title || "");
    if (!key || map.has(key)) continue;
    map.set(key, asset);
  }
  entry.assetRefs = Array.from(map.values());
  entry.assetRefs.forEach((asset) => {
    if (asset.id) entry.assetIds.add(String(asset.id));
  });
}

function addPlanningToolRunItem(entry, item) {
  entry.rawItems.push(item);
  entry.protocol = entry.protocol || item.protocol || item.data?.protocol || "";
  if (item.type === "tool_call") entry.calls.push(item);
  if (item.type === "tool_result") entry.results.push(item);
  if (item.title) entry.targets.add(String(item.title).replace(/^调用工具：|^工具完成：|^读取证据：/, ""));
  if (item.summary) entry.reasons.add(String(item.summary));
  if (item.data?.summary) entry.reasons.add(String(item.data.summary));
  const target = planningToolActionTargetSeed(item.data || item);
  if (target) entry.queries.add(String(target));
  if (Number(item.data?.count || 0) > 0) entry.counts.push(Number(item.data.count || 0));
  if (item.data?.writePreview) entry.writePreviews.push(item.data.writePreview);
  if (item.data?.archiveDiff) entry.archiveDiffs.push(item.data.archiveDiff);
  if (item.data?.rollbackPlan) entry.rollbackPlans.push(item.data.rollbackPlan);
  addPlanningToolAssetRefs(entry, item, item.data);
  addPlanningToolEvidenceRead(entry, item.evidenceRead || item.data?.evidenceRead);
  entry.topResults = mergePlanningToolTopResults(entry.topResults, collectPlanningToolTopResults(item, item.data));
  mergePlanningToolStatus(entry, item);
  updatePlanningToolEntryTime(entry, item);
}

function addPlanningToolReportItem(entry, item, bucket) {
  if (bucket === "search") entry.results.push(item);
  if (bucket === "write") entry.results.push(item);
  if (bucket === "native") entry.calls.push(item);
  if (bucket === "skip") entry.results.push(item);
  entry.sourceKinds.add(bucket || "report");
  entry.protocol = entry.protocol || item.protocol || (bucket === "native" ? "native_tool_call" : "skillOps");
  const argumentTarget = planningToolActionTargetSeed(tryParsePlanningJson(item?.argumentPreview));
  const rawTarget = planningToolActionTargetSeed(item);
  const target = argumentTarget && /^fc_|^call_|^tool_call/i.test(String(rawTarget || ""))
    ? argumentTarget
    : rawTarget || argumentTarget;
  if (target) entry.queries.add(String(target));
  if (item.reason) entry.reasons.add(String(item.reason));
  if (item.summary) entry.reasons.add(String(item.summary));
  if (item.error || item.code) entry.reasons.add(String(item.error || item.code));
  if (item.assetId) entry.assetIds.add(String(item.assetId));
  safeArray(item.assetIds).forEach((id) => entry.assetIds.add(String(id)));
  safeArray(item.results).forEach((result) => {
    if (result.id) entry.resultIds.add(String(result.id));
    if (result.assetId) entry.assetIds.add(String(result.assetId));
  });
  if (Number(item.count || safeArray(item.results).length || 0) > 0) entry.counts.push(Number(item.count || safeArray(item.results).length || 0));
  if (item.writeReport?.preview) entry.writePreviews.push(item.writeReport.preview);
  if (item.writeReport?.diff) entry.archiveDiffs.push(item.writeReport.diff);
  if (item.writeReport?.rollbackPlan) entry.rollbackPlans.push(item.writeReport.rollbackPlan);
  addPlanningToolAssetRefs(entry, item);
  entry.topResults = mergePlanningToolTopResults(entry.topResults, collectPlanningToolTopResults(item));
  mergePlanningToolStatus(entry, item, bucket);
  updatePlanningToolEntryTime(entry, item);
}

// 将后端原始 item / report 聚合成 Codex 式工具动作，避免“调用”和“完成”分裂成两条日志。
function buildPlanningToolTimeline({ items = [], evidencePlan = null, report = null, events = [] } = {}) {
  const entries = new Map();
  const ensure = (key, toolType, protocol = "") => {
    if (!key) return null;
    if (!entries.has(key)) entries.set(key, createPlanningToolTimelineEntry(key, toolType, protocol));
    const entry = entries.get(key);
    if (!entry.toolType || entry.toolType === "tool") entry.toolType = toolType || "tool";
    if (!entry.protocol && protocol) entry.protocol = protocol;
    return entry;
  };

  for (const item of safeArray(items)) {
    const toolType = String(item?.toolType || item?.data?.toolType || item?.evidenceRead?.toolType || "");
    const isToolItem = toolType && ["tool_call", "tool_result", "evidence_read"].includes(String(item?.type || ""));
    if (!isToolItem) continue;
    const entry = ensure(planningToolEntryKeyFromItem(item), toolType, item.protocol || item.data?.protocol || "");
    if (entry) addPlanningToolRunItem(entry, item);
  }

  for (const read of safeArray(evidencePlan?.reads)) {
    const entry = ensure(planningToolEntryKeyFromEvidenceRead(read), read.toolType || read.type || "tool", "evidence_scheduler");
    if (entry) addPlanningToolEvidenceRead(entry, read);
  }

  for (const item of safeArray(report?.searches)) {
    const entry = ensure(planningToolEntryKeyFromReportItem(item, "search"), item.type || "search", item.protocol || "skillOps");
    if (entry) addPlanningToolReportItem(entry, item, "search");
  }
  for (const item of safeArray(report?.applied)) {
    const entry = ensure(planningToolEntryKeyFromReportItem(item, "write"), item.type || "tool", item.protocol || "skillOps");
    if (entry) addPlanningToolReportItem(entry, item, "write");
  }
  for (const item of safeArray(report?.skipped)) {
    const entry = ensure(planningToolEntryKeyFromReportItem(item, "skip"), item.type || "tool", item.protocol || "skillOps");
    if (entry) addPlanningToolReportItem(entry, item, "skip");
  }
  for (const read of safeArray(report?.evidenceReads)) {
    const entry = ensure(planningToolEntryKeyFromEvidenceRead(read), read.toolType || read.type || "tool", "evidence_scheduler");
    if (entry) addPlanningToolEvidenceRead(entry, read);
  }
  for (const item of safeArray(report?.nativeToolCalls)) {
    const entry = ensure(planningToolEntryKeyFromReportItem(item, "native"), item.type || "tool", item.protocol || "native_tool_call");
    if (entry) addPlanningToolReportItem(entry, item, "native");
  }

  for (const event of safeArray(events)) {
    const toolType = String(event?.data?.type || event?.data?.toolType || "");
    if (!toolType || event.phase !== "tool_execution") continue;
    const sameToolEntries = Array.from(entries.values()).filter((entry) => entry.toolType === toolType);
    const key = event?.data?.toolCallId
      ? `call:${event.data.toolCallId}`
      : sameToolEntries.length === 1
        ? sameToolEntries[0].key
        : sameToolEntries.length === 0
          ? `event:${toolType}:${event.type || ""}:${event.createdAt || ""}`
          : "";
    if (!key) continue;
    const entry = ensure(key, toolType, event.data?.protocol || "");
    if (!entry) continue;
    entry.rawEvents.push(event);
    if (event.message) entry.reasons.add(String(event.message));
    entry.topResults = mergePlanningToolTopResults(entry.topResults, collectPlanningToolTopResults(event.data));
    mergePlanningToolStatus(entry, { type: event.type === "tool_failed" ? "tool_result" : "tool_call", status: event.type === "tool_failed" ? "failed" : event.type === "tool_completed" ? "completed" : "running" });
    updatePlanningToolEntryTime(entry, event);
  }

  return Array.from(entries.values()).map((entry) => {
    const count = entry.counts.length > 0 ? entry.counts.reduce((sum, value) => sum + Number(value || 0), 0) : 0;
    return {
      ...entry,
      status: finalizePlanningToolStatus(entry),
      count,
      assetRefs: entry.assetRefs,
      assetIds: Array.from(entry.assetIds),
      resultIds: Array.from(entry.resultIds),
      queries: Array.from(entry.queries).filter(Boolean),
      reasons: Array.from(entry.reasons).filter(Boolean),
      usedFor: Array.from(entry.usedFor).filter(Boolean),
      targets: Array.from(entry.targets).filter(Boolean),
      topResults: safeArray(entry.topResults),
      writePreviews: safeArray(entry.writePreviews),
      archiveDiffs: safeArray(entry.archiveDiffs),
      rollbackPlans: safeArray(entry.rollbackPlans),
      sourceKinds: Array.from(entry.sourceKinds).filter(Boolean)
    };
  }).sort((a, b) => String(a.firstAt || "").localeCompare(String(b.firstAt || "")));
}

function planningReadableEvidenceEntries(toolTimeline) {
  const entries = safeArray(toolTimeline).filter((entry) => {
    const toolType = String(entry.toolType || "");
    return safeArray(entry.topResults).length > 0
      || safeArray(entry.evidenceReads).length > 0
      || ["search", "searchLocalFiles", "listFiles", "readLocalFile", "readFile", "readMessageAttachment", "searchContextAssets", "readContextAsset"].includes(toolType);
  });
  const agentChosen = entries.filter((entry) => String(entry.protocol || "") !== "evidence_scheduler");
  return agentChosen.length ? agentChosen : entries;
}

function planningToolActionTarget(entry) {
  const fileTarget = planningToolFileTarget(entry);
  if (fileTarget && ["searchContextAssets", "readContextAsset", "readLocalFile", "readFile", "readMessageAttachment", "searchLocalFiles"].includes(String(entry?.toolType || ""))) {
    return fileTarget;
  }
  const groupedTargets = uniqueStrings(safeArray(entry?.groupedTargets).map((item) => String(item || "").trim()).filter(Boolean));
  if (groupedTargets.length > 1) {
    return `${planningToolFallbackTarget(entry?.toolType)}：${shortText(groupedTargets[0], 82)} 等 ${groupedTargets.length} 个对象`;
  }
  const assets = safeArray(entry?.assetRefs);
  if (entry?.toolType === "readContextAsset" && assets.length > 0) {
    const kind = planningReferenceKindLabel(assets[0]);
    const names = assets.slice(0, 2).map(planningReferenceTitle).filter(Boolean);
    return `${assets.length} 条${kind}${names.length ? `：${names.join("；")}${assets.length > names.length ? " 等" : ""}` : ""}`;
  }
  const assetIds = safeArray(entry?.assetIds);
  if (entry?.toolType === "readContextAsset" && assetIds.length > 0) {
    const readableIds = assetIds.filter((id) => !planningActivityTargetLooksInternal(id));
    if (readableIds.length > 0) {
      return `${assetIds.length} 条资料引用：${readableIds.slice(0, 2).map((id) => shortText(id, 38)).join("；")}${assetIds.length > 2 ? " 等" : ""}`;
    }
    if (assetIds.some((id) => /compact/i.test(String(id || "")))) return `${assetIds.length} 条压缩摘要`;
    return `${assetIds.length} 条资料引用`;
  }
  if (assets.length > 0 && !safeArray(entry?.queries).length) {
    const kind = planningReferenceKindLabel(assets[0]);
    const names = assets.slice(0, 2).map(planningReferenceTitle).filter(Boolean);
    return `${assets.length} 条${kind}${names.length ? `：${names.join("；")}${assets.length > names.length ? " 等" : ""}` : ""}`;
  }
  const query = safeArray(entry?.queries).find((item) => !/^fc_|^call_|^tool_call/i.test(String(item || "")) && !planningActivityTargetLooksInternal(item))
    || safeArray(entry?.queries)[0];
  if (query && !planningActivityTargetLooksInternal(query)) return query;
  const target = safeArray(entry?.targets).find((item) => item && item !== planningToolKindLabel(entry?.toolType));
  if (target && !planningActivityTargetLooksInternal(target)) return target;
  const resultId = safeArray(entry?.resultIds)[0];
  if (resultId && !planningActivityTargetLooksInternal(resultId)) return resultId;
  if (assetIds.length > 0) {
    const readableIds = assetIds.filter((id) => !planningActivityTargetLooksInternal(id));
    if (readableIds.length > 0) return `引用 ${readableIds.slice(0, 2).map((id) => shortText(id, 38)).join("；")}${assetIds.length > 2 ? " 等" : ""}`;
    if (assetIds.some((id) => /compact/i.test(String(id || "")))) return "压缩摘要";
    return "资料引用";
  }
  return planningToolFallbackTarget(entry?.toolType);
}

function planningToolActionMeta(entry) {
  if (planningToolIsContextFileFlow(entry) && ["completed", "read"].includes(String(entry?.status || ""))) return "";
  const parts = [];
  const occurrenceCount = Number(entry?.occurrenceCount || 1);
  if (occurrenceCount > 1) parts.push(`${occurrenceCount} 次`);
  const count = Number(entry?.count || 0);
  if (count > 0) parts.push(`${count} 条结果`);
  return parts.join(" · ");
}

function planningToolActionReason(entry) {
  const toolType = String(entry?.toolType || "");
  const label = planningToolKindLabel(toolType);
  const isContextFileFlow = planningToolIsContextFileFlow(entry);
  const reasons = safeArray(entry?.reasons)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => !/^父级 Agent run 已进入/.test(item))
    .filter((item) => item !== toolType && item !== label)
    .filter((item) => !/^调用工具[:：]/.test(item) && !/^工具完成[:：]/.test(item))
    .filter((item) => !isContextFileFlow || !/旧运行|历史证据|引用原文|上下文证据|被压缩|按引用读取|assetRef|contextAsset/i.test(item));
  const actionable = reasons.find((item) => !/^工具失败[:：]/.test(item) && item !== "failed" && item !== "completed");
  if (isContextFileFlow) return actionable || reasons[0] || "";
  return actionable || reasons[0] || safeArray(entry?.usedFor)[0] || "";
}

// 为没有明确路径或查询的工具补一个用户能理解的对象描述，避免主流程显示内部空值。
function planningToolFallbackTarget(toolType) {
  return {
    readContextAsset: "历史资料",
    readMessageAttachment: "读取拖入文件",
    searchContextAssets: "历史资料",
    searchLocalFiles: "检索工作区文件",
    readLocalFile: "读取工作区文件",
    readFile: "读取文件",
    listFiles: "列出工作区文件",
    globFiles: "匹配工作区文件",
    grepFiles: "搜索文件内容",
    indexLocalFiles: "索引工作区文件",
    writeFile: "写入文件",
    applyPatch: "应用补丁",
    patchFile: "编辑文件",
    runShell: "执行命令",
    webSearch: "联网搜索",
    webFetch: "读取网页"
  }[String(toolType || "")] || "执行工具";
}

// 工具聚合只做展示层归并；原始 run item 仍保留在本轮详情里，便于追责和审计。
function planningToolNormalizeGroupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

// 失败或待确认的同类动作按原因聚合，解决重复权限失败在主消息流刷屏的问题。
function planningToolGroupKey(entry) {
  const toolType = String(entry?.toolType || "tool");
  const status = String(entry?.status || "completed");
  const reason = planningToolNormalizeGroupText(planningToolActionReason(entry));
  const target = planningToolNormalizeGroupText(planningToolActionTarget(entry));
  if (["failed", "blocked", "skipped", "awaiting_approval"].includes(status) && reason) {
    return `${toolType}|${status}|${reason}`;
  }
  if (planningToolIsContextFileFlow(entry)) return `file-read-flow|${status}`;
  if (toolType === "readContextAsset") return `${toolType}|${status}|context-assets`;
  return `${toolType}|${status}|${target}`;
}

// 主流程展示时优先暴露阻塞状态，其次才是运行中和已完成状态。
function planningToolStatusRank(status) {
  return {
    failed: 80,
    blocked: 76,
    awaiting_approval: 72,
    running: 68,
    paused: 64,
    skipped: 48,
    applied: 32,
    completed: 28,
    read: 28,
    cancelled: 20
  }[String(status || "")] || 10;
}

function planningToolDominantStatus(current, next) {
  return planningToolStatusRank(next) > planningToolStatusRank(current) ? next : current;
}

function planningToolMergeAssetRefs(current, next) {
  const map = new Map();
  safeArray(current).forEach((asset) => {
    const key = String(asset?.id || asset?.relativePath || asset?.path || asset?.title || "");
    if (key) map.set(key, asset);
  });
  safeArray(next).forEach((asset) => {
    const key = String(asset?.id || asset?.relativePath || asset?.path || asset?.title || "");
    if (key && !map.has(key)) map.set(key, asset);
  });
  return Array.from(map.values());
}

function mergePlanningToolTopResults(current, next) {
  const map = new Map();
  safeArray(current).forEach((result) => {
    const normalized = normalizePlanningToolTopResultClient(result);
    const key = planningToolTopResultKey(normalized);
    if (key && normalized) map.set(key, normalized);
  });
  safeArray(next).forEach((result) => {
    const normalized = normalizePlanningToolTopResultClient(result);
    const key = planningToolTopResultKey(normalized);
    if (key && normalized && !map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).slice(0, 12);
}

// 将“调用、完成、失败、证据读取”等内部事件压成一条 Codex 式动作记录。
function compactPlanningToolTimeline(entries) {
  const groups = new Map();
  safeArray(entries).forEach((entry, index) => {
    const groupKey = planningToolGroupKey(entry);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        ...entry,
        key: `group:${groupKey || index}`,
        occurrenceCount: 0,
        groupedTargets: [],
        calls: [],
        results: [],
        evidenceReads: [],
        rawItems: [],
        rawEvents: [],
        assetRefs: [],
        assetIds: [],
        resultIds: [],
        queries: [],
        reasons: [],
        usedFor: [],
        targets: [],
        topResults: [],
        writePreviews: [],
        archiveDiffs: [],
        rollbackPlans: [],
        sourceKinds: [],
        count: 0
      });
    }
    const group = groups.get(groupKey);
    const target = planningToolActionTarget(entry);
    if (planningToolIsContextFileFlow(entry) && ["readLocalFile", "readFile", "readContextAsset", "readMessageAttachment"].includes(String(entry?.toolType || ""))) {
      group.toolType = "readLocalFile";
    }
    group.occurrenceCount += Number(entry?.occurrenceCount || 1);
    group.groupedTargets = uniqueStrings([...safeArray(group.groupedTargets), target].filter(Boolean));
    group.status = planningToolDominantStatus(group.status, entry.status);
    group.count += Number(entry?.count || 0);
    group.calls = [...safeArray(group.calls), ...safeArray(entry?.calls)];
    group.results = [...safeArray(group.results), ...safeArray(entry?.results)];
    group.evidenceReads = [...safeArray(group.evidenceReads), ...safeArray(entry?.evidenceReads)];
    group.rawItems = [...safeArray(group.rawItems), ...safeArray(entry?.rawItems)];
    group.rawEvents = [...safeArray(group.rawEvents), ...safeArray(entry?.rawEvents)];
    group.assetRefs = planningToolMergeAssetRefs(group.assetRefs, entry?.assetRefs);
    group.assetIds = uniqueStrings([...safeArray(group.assetIds), ...safeArray(entry?.assetIds)]);
    group.resultIds = uniqueStrings([...safeArray(group.resultIds), ...safeArray(entry?.resultIds)]);
    group.queries = uniqueStrings([...safeArray(group.queries), ...safeArray(entry?.queries)]);
    group.reasons = uniqueStrings([...safeArray(group.reasons), ...safeArray(entry?.reasons)]);
    group.usedFor = uniqueStrings([...safeArray(group.usedFor), ...safeArray(entry?.usedFor)]);
    group.targets = uniqueStrings([...safeArray(group.targets), ...safeArray(entry?.targets)]);
    group.topResults = mergePlanningToolTopResults(group.topResults, entry?.topResults);
    group.writePreviews = [...safeArray(group.writePreviews), ...safeArray(entry?.writePreviews)];
    group.archiveDiffs = [...safeArray(group.archiveDiffs), ...safeArray(entry?.archiveDiffs)];
    group.rollbackPlans = [...safeArray(group.rollbackPlans), ...safeArray(entry?.rollbackPlans)];
    group.sourceKinds = uniqueStrings([...safeArray(group.sourceKinds), ...safeArray(entry?.sourceKinds)]);
    if (entry?.firstAt && (!group.firstAt || entry.firstAt < group.firstAt)) group.firstAt = entry.firstAt;
    if (entry?.lastAt && (!group.lastAt || entry.lastAt > group.lastAt)) group.lastAt = entry.lastAt;
  });
  return Array.from(groups.values()).map((entry) => {
    if (planningToolIsContextFileFlow(entry)) {
      return {
        ...entry,
        count: 0,
        usedFor: [],
        reasons: safeArray(entry.reasons).filter((item) => !/旧运行|历史证据|引用原文|上下文证据|被压缩|按引用读取|assetRef|contextAsset/i.test(String(item || "")))
      };
    }
    return entry;
  }).sort((a, b) => String(a.firstAt || "").localeCompare(String(b.firstAt || "")));
}

// 主消息流只需要一句可扫读结论；详细工具、事件和 JSON 由详情抽屉承载。
function buildPlanningRunProcessSummary({ toolTimeline, stats, latest, live }) {
  const tools = safeArray(toolTimeline);
  const failed = tools.filter((entry) => ["failed", "blocked", "skipped"].includes(String(entry.status || "")));
  const pending = tools.filter((entry) => entry.status === "awaiting_approval");
  const running = tools.filter((entry) => entry.status === "running");
  const writes = tools.filter((entry) => planningToolActionKind(entry.toolType) === "write");
  const active = pending[0] || running[running.length - 1] || tools[tools.length - 1];
  const leading = pending.length
    ? `等待确认：${planningToolActionLabel(pending[0])}`
    : failed.length
      ? `${planningToolActionLabel(failed[0])}${Number(failed[0].occurrenceCount || 1) > 1 ? `失败 ${failed[0].occurrenceCount} 次` : "失败"}`
      : active
        ? `${live ? "正在处理" : "已处理"}：${planningToolActionLabel(active)}`
        : live ? "正在处理本轮消息" : "本轮处理完成";
  const reason = failed[0] ? planningToolActionReason(failed[0]) : pending[0] ? planningToolActionReason(pending[0]) : "";
  const detail = reason || (active ? planningToolActionTarget(active) : "");
  return {
    active,
    failedCount: failed.reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0),
    pendingCount: pending.length,
    runningCount: running.length,
    writeCount: writes.length,
    summary: [leading, detail ? shortText(detail, 140) : ""].filter(Boolean).join(" · ")
  };
}

function planningVersionKindLabel(kind) {
  return {
    branch: "会话",
    user_message: "用户消息",
    assistant_message: "Agent 回复",
    agent_run: "Agent 运行",
    checkpoint: "本轮细节",
    context_compaction: "上下文压缩",
    branch_merge: "会话合并",
    model_call: "模型调用",
    evidence_plan: "证据计划",
    evidence_read: "读取证据",
    run_item: "运行步骤",
    tool_result: "资料结果",
    sub_agent: "子 Agent",
    approval: "人工确认",
    tool_call: "工具调用",
    tool_read: "工具读取",
    tool_write: "工具写入",
    tool_error: "工具失败"
  }[String(kind || "")] || String(kind || "版本节点");
}

function planningVersionKindColor(kind) {
  return {
    branch: "purple",
    user_message: "arcoblue",
    assistant_message: "green",
    agent_run: "magenta",
    checkpoint: "orange",
    context_compaction: "purple",
    branch_merge: "purple",
    model_call: "cyan",
    evidence_plan: "arcoblue",
    evidence_read: "blue",
    run_item: "gray",
    tool_result: "green",
    sub_agent: "magenta",
    approval: "gold",
    tool_call: "gray",
    tool_read: "arcoblue",
    tool_write: "orange",
    tool_error: "red"
  }[String(kind || "")] || "gray";
}

function roleplayConfigSourceLabel(source) {
  return {
    saved_draft: "最近保存草案",
    saved_inline: "最近手动保存",
    saved_default: "最近保存默认",
    manual: "已保存配置"
  }[String(source || "")] || "默认配置";
}

function approvalOperationSummary(operation) {
  const source = operation && typeof operation === "object" ? operation : {};
  const externalAccess = source.externalAccess && typeof source.externalAccess === "object" ? source.externalAccess : null;
  const parts = [
    externalAccess?.path ? `外部路径：${externalAccess.path}` : "",
    externalAccess?.cwd ? `外部 cwd：${externalAccess.cwd}` : "",
    source.path || source.relativePath ? `路径：${source.relativePath || source.path}` : "",
    source.cwd ? `cwd：${source.cwd}` : "",
    source.command || source.cmd ? `命令：${source.command || source.cmd}` : "",
    source.name || source.characterName || source.title ? `对象：${source.name || source.characterName || source.title}` : "",
    source.subject || source.field ? `字段：${[source.subject, source.field].filter(Boolean).join(" / ")}` : ""
  ].filter(Boolean);
  if (parts.length > 0) return shortText(parts.join(" · "), 180);
  return shortText(prettyJson(source), 180);
}

function planningPermissionModeLabel(mode) {
  return {
    read_only: "只读",
    auto_edit: "自动编辑低风险",
    ask_high_risk: "高风险询问",
    full_auto: "全自动"
  }[String(mode || "")] || "高风险询问";
}

function normalizeAgentToolSettingsForClient(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    webEnabled: source.webEnabled !== false,
    shellEnabled: source.shellEnabled === true,
    customToolsEnabled: source.customToolsEnabled === true,
    mcpEnabled: source.mcpEnabled === true,
    webSearchProvider: source.webSearchProvider || "auto",
    webSearchCacheTtlMinutes: Number(source.webSearchCacheTtlMinutes || 720)
  };
}

function plannerModeConfig(mode) {
  return plannerModeOptions.find((item) => item.key === mode) || plannerModeOptions[0];
}

function plannerModeLabel(mode) {
  return plannerModeConfig(mode).label;
}

function plannerUiStorageKey(novelId) {
  return `roleplay-novel-studio-planner-ui-${novelId || "default"}`;
}

function loadPlannerUiPrefs(novelId) {
  if (typeof window === "undefined" || !novelId) return {};
  try {
    return JSON.parse(window.localStorage.getItem(plannerUiStorageKey(novelId)) || "{}");
  } catch {
    return {};
  }
}

function savePlannerUiPrefs(novelId, prefs) {
  if (typeof window === "undefined" || !novelId) return;
  try {
    window.localStorage.setItem(plannerUiStorageKey(novelId), JSON.stringify(prefs || {}));
  } catch {
    // 本地偏好只是输入区体验增强，写入失败不影响 Agent 主流程。
  }
}

// 仅当输入以 slash 命令开头时显示命令菜单，避免普通正文里的斜杠误触。
function getPlanningCommandQuery(input) {
  const text = String(input || "");
  if (!text.startsWith("/")) return null;
  const firstLine = text.split(/\r?\n/)[0];
  if (/\s/.test(firstLine.trim()) && !firstLine.trim().startsWith("/goal ")) return null;
  return firstLine.slice(1).trim().toLowerCase();
}

function parsePlanningSlashCommand(input) {
  const text = String(input || "").trim();
  if (!text.startsWith("/")) return null;
  const match = text.match(/^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return {
    name: match[1].toLowerCase(),
    argument: String(match[2] || "").trim()
  };
}

function getPlanningMentionQuery(input) {
  const text = String(input || "");
  if (!text) return null;
  const lastLine = text.split(/\r?\n/).pop() || "";
  const match = lastLine.match(/(?:^|\s)@([^\s@]{0,32})$/u);
  return match ? match[1].trim().toLowerCase() : null;
}

function replaceComposerMentionTrigger(input, mention) {
  const token = `@${mention.typeLabel || mention.type}:${mention.label}`;
  return String(input || "").replace(/(?:^|\s)@[^\s@]{0,32}$/u, (matched) => {
    const prefix = matched.startsWith(" ") ? " " : "";
    return `${prefix}${token} `;
  });
}

function filterPlannerSlashCommands(query) {
  const q = String(query || "").replace(/^\//, "").trim().toLowerCase();
  if (!q) return plannerSlashCommandTemplates.slice(0, 10);
  return plannerSlashCommandTemplates.filter((item) => {
    const text = [item.command, item.label, item.description, item.mode].filter(Boolean).join(" ").toLowerCase();
    return text.includes(q);
  }).slice(0, 10);
}

function findPlannerSlashCommandByName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return plannerSlashCommandTemplates.find((item) => item.command.slice(1).toLowerCase() === normalized) || null;
}

function buildPlanningMentionCandidates(activeNovel, query = "") {
  const q = String(query || "").trim().toLowerCase();
  const candidates = [];
  const add = (item) => {
    if (!item?.id || !item?.label) return;
    candidates.push({
      ...item,
      typeLabel: item.typeLabel || planningMentionTypeLabel(item.type),
      color: item.color || planningMentionTypeColor(item.type)
    });
  };
  const archives = activeNovel?.archives || {};
  const memoryItems = safeArray(activeNovel?.memory?.items);
  const loreEntries = safeArray(activeNovel?.lorebook?.entries);
  const proseParts = safeArray(activeNovel?.session?.proseParts);
  const turns = safeArray(activeNovel?.session?.turns);
  const compactionRefs = safeArray(activeNovel?.planning?.contextCompaction?.assetRefs);
  const workspace = activeNovel?.planning?.defaultAgentFolder || "";
  if (workspace) {
    add({ id: `workspace:${workspace}`, type: "workspace", label: "当前 Agent 工作区", detail: workspace });
  }
  for (const source of safeArray(activeNovel?.planning?.localFileSources)) {
    if (source.enabled === false) continue;
    add({ id: `source:${source.id || source.rootPath}`, type: "workspace", label: source.name || "额外资料文件夹", detail: source.rootPath || "" });
  }
  for (const character of safeArray(activeNovel?.characters)) {
    add({ id: `character:${character.id || character.name}`, type: "character", label: character.name || "未命名角色", detail: character.roleType === "major" ? "主要角色卡" : "次要角色卡" });
  }
  for (const field of ["premise", "background", "outline", "style"]) {
    if (archives[field]) add({ id: `archive:${field}`, type: "archive", label: planningArchiveFieldLabel(field), detail: shortText(archives[field], 80) });
  }
  for (const item of safeArray(archives.characters)) {
    add({ id: `archive-character:${item.id || item.name || item.title}`, type: "archive", label: item.name || item.title || "角色档案", detail: "角色档案" });
  }
  for (const item of safeArray(archives.scenes)) {
    add({ id: `archive-scene:${item.id || item.name || item.title}`, type: "archive", label: item.name || item.title || "场景档案", detail: "场景档案" });
  }
  for (const item of safeArray(archives.clues)) {
    add({ id: `archive-clue:${item.id || item.name || item.title}`, type: "archive", label: item.name || item.title || "线索档案", detail: "线索档案" });
  }
  for (const entry of loreEntries) {
    add({ id: `lorebook:${entry.id || entry.name}`, type: "lorebook", label: entry.name || "世界书条目", detail: safeArray(entry.keys).slice(0, 4).join("、") || shortText(entry.content, 80) });
  }
  for (const item of memoryItems) {
    add({ id: `memory:${item.id || item.subject}`, type: "memory", label: item.subject || item.field || "记忆条目", detail: [item.layer, item.status, item.field].filter(Boolean).join(" · ") || shortText(item.value, 80) });
  }
  for (const prose of proseParts) {
    add({ id: `prose:${prose.id}`, type: "prose", label: prose.chapterLabel || prose.title || prose.id || "正文版本", detail: [prose.status, prose.versionType].filter(Boolean).join(" · ") });
  }
  for (const turn of turns.slice(-20).reverse()) {
    add({ id: `turn:${turn.id || turn.index}`, type: "turn", label: `扮演轮次 ${turn.index ?? turn.id}`, detail: shortText(turn.sceneState?.summary || turn.guide?.text || turn.summary, 80) });
  }
  for (const ref of compactionRefs) {
    add({ id: `asset:${ref.id}`, type: "asset", label: ref.title || ref.id, detail: planningReferenceKindLabel(ref) });
  }
  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique.filter((item) => planningMentionMatches(item, q)).slice(0, 12);
}

function planningMentionMatches(item, query) {
  if (!query) return true;
  const text = [item.label, item.detail, item.typeLabel, item.id].filter(Boolean).join(" ").toLowerCase();
  return text.includes(query);
}

function planningArchiveFieldLabel(field) {
  return {
    premise: "核心命题",
    background: "世界与背景",
    outline: "大纲",
    style: "文风要求"
  }[field] || field;
}

function planningMentionTypeLabel(type) {
  return {
    workspace: "工作区",
    character: "角色卡",
    archive: "档案",
    lorebook: "世界书",
    memory: "记忆",
    prose: "正文",
    turn: "扮演",
    asset: "引用"
  }[String(type || "")] || "引用";
}

function planningMentionTypeColor(type) {
  return {
    workspace: "arcoblue",
    character: "green",
    archive: "purple",
    lorebook: "orange",
    memory: "magenta",
    prose: "cyan",
    turn: "gold",
    asset: "gray"
  }[String(type || "")] || "gray";
}

function buildPlanningComposerSubmissionMessage(message, options = {}) {
  const refs = safeArray(options.mentions);
  const files = safeArray(options.files).filter((file) => file?.text || file?.name);
  const mode = plannerModeConfig(options.mode || "auto");
  const goal = String(options.goal || "").trim();
  const fileHints = files.flatMap((file, index) => {
    const title = String(file.name || file.label || `拖入文件 ${index + 1}`).trim();
    const fileText = String(file.text || "");
    return [
      `- ${index + 1}. ${title}（${formatPlanningFileSize(file.size)}；${file.truncated ? `原文约 ${file.originalChars || fileText.length} 字，已截取前 ${fileText.length} 字` : "已读取文本"}）`,
      `[拖入文件 ${index + 1}：${title}]`,
      fileText || "（空文件或未读取到文本内容）",
      `[/拖入文件 ${index + 1}]`
    ];
  });
  const hints = [
    mode.key !== "auto" ? "执行偏好不是固定流程；Agent 必须先理解用户目标，再自主决定是否采用这个偏好、调用哪些工具、何时写入或收束。" : "",
    mode.key !== "auto" ? `用户设置的执行偏好：${mode.label}。${mode.description}` : "",
    goal ? `当前持续目标：${goal}` : "",
    refs.length ? "用户显式引用：" : "",
    ...refs.map((ref) => `- ${ref.typeLabel || planningMentionTypeLabel(ref.type)}：${ref.label}${ref.detail ? `（${shortText(ref.detail, 120)}）` : ""}；refId=${ref.id}`),
    files.length ? "用户拖入的本轮临时文件：这些内容只作为当前消息上下文；不要因为文件被拖入就自动写入档案、记忆或世界书，只有确有必要并经过工具写入边界时才沉淀。" : "",
    ...fileHints
  ].filter(Boolean);
  if (hints.length === 0) return message;
  return [
    "[Agent 前端上下文提示]",
    ...hints,
    "",
    "[用户消息]",
    message
  ].join("\n");
}

function normalizeVerifierRunnerForClient(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    enabled: source.enabled !== false,
    deterministicEnabled: source.deterministicEnabled !== false,
    modelReviewEnabled: source.modelReviewEnabled !== false,
    modelReviewers: safeArray(source.modelReviewers || source.reviewers || source.models),
    commandSteps: safeArray(source.commandSteps || source.commands || source.steps)
  };
}

function normalizeAgentPermissionPolicyForClient(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalizeRule = (rule, fallbackPrefix = "") => ({
    id: String(rule?.id || `rule_${Math.random().toString(36).slice(2, 8)}`),
    prefix: String(rule?.prefix || rule?.commandPrefix || fallbackPrefix || ""),
    tool: String(rule?.tool || rule?.type || ""),
    path: String(rule?.path || rule?.directory || ""),
    access: ["allow", "confirm", "deny", "read", "write", "shell"].includes(String(rule?.access || "")) ? String(rule.access) : "confirm",
    scope: ["once", "session", "persistent"].includes(String(rule?.scope || "")) ? String(rule.scope) : "persistent",
    branchId: String(rule?.branchId || ""),
    runId: String(rule?.runId || ""),
    sourceRunId: String(rule?.sourceRunId || ""),
    createdAt: rule?.createdAt || "",
    expiresAt: rule?.expiresAt || ""
  });
  return {
    version: 1,
    directoryRules: safeArray(source.directoryRules).map((rule) => normalizeRule(rule)).filter((rule) => rule.path),
    commandRules: safeArray(source.commandRules).map((rule) => normalizeRule(rule)).filter((rule) => rule.prefix),
    toolRules: safeArray(source.toolRules).map((rule) => normalizeRule(rule)).filter((rule) => rule.tool),
    sessionGrants: safeArray(source.sessionGrants),
    persistentGrants: safeArray(source.persistentGrants)
  };
}

function notify(type, content, options = {}) {
  const text = String(content || "").trim();
  if (!text) return null;
  if (typeof document === "undefined") return null;
  try {
    let region = document.querySelector(".studio-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "studio-toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      document.body.appendChild(region);
    }
    const toast = document.createElement("div");
    const safeType = ["success", "error", "warning", "info"].includes(String(type || "")) ? String(type) : "info";
    toast.className = `studio-toast ${safeType}`;
    toast.textContent = text;
    region.appendChild(toast);
    const duration = Number(options.duration || 2600);
    const remove = () => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 180);
    };
    window.setTimeout(remove, Math.max(900, duration));
    return { close: remove };
  } catch (error) {
    // 提示层不能影响发送、审批、轮询等主流程。
    console.warn(`[notify:${type}]`, text, error);
    return null;
  }
}

function showError(error) {
  const details = Array.isArray(error?.details) ? `：${error.details.map((item) => item.field || item.label || item.message || item).join("、")}` : "";
  notify("error", `${error?.message || "操作失败"}${details}`);
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取 PNG 失败"));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrlWithMessage(file, message = "读取文件失败") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(message));
    reader.readAsDataURL(file);
  });
}

function downloadJson(filename, value) {
  const blob = new Blob([prettyJson(value)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function providerName(providers, id) {
  return providers.find((item) => item.id === id)?.name || "未选择";
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function modelOptions(providers, providerId) {
  return providers.find((item) => item.id === providerId)?.models || [];
}

function inferModelContextWindowTokensClient(model) {
  const value = String(model || "").toLowerCase();
  if (!value) return 0;
  if (/1m|1000k|1048k|1024k/.test(value)) return 1000000;
  if (/gpt-5\.[45]/.test(value)) return 1000000;
  if (/512k|500k/.test(value)) return 512000;
  if (/256k/.test(value)) return 256000;
  if (/200k|claude|gpt-5|gpt-4\.1|o3|o4|gemini/.test(value)) return 200000;
  if (/128k|deepseek|qwen|glm|kimi|grok|doubao|ernie|hunyuan|llama/.test(value)) return 128000;
  if (/64k/.test(value)) return 64000;
  if (/32k/.test(value)) return 32000;
  if (/16k/.test(value)) return 16000;
  if (/8k/.test(value)) return 8000;
  return 0;
}

function parseTokenBudgetInputClient(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return 0;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(m|million|k|千|万)?$/i);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const unit = String(match[2] || "").toLowerCase();
  if (unit === "m" || unit === "million") return base * 1000000;
  if (unit === "k" || unit === "千") return base * 1000;
  if (unit === "万") return base * 10000;
  return base;
}

function normalizeTokenBudgetOverrideClient(value, max = 2000000) {
  const number = parseTokenBudgetInputClient(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(max, Math.max(1, Math.round(number)));
}

function deriveClientContextBudgetValues(contextWindowTokens, compactionPressureRatio = 0.72) {
  const windowTokens = normalizeTokenBudgetOverrideClient(contextWindowTokens);
  if (!windowTokens) {
    return {
      contextWindowTokens: 0,
      responseReserveTokens: 0,
      safetyTokens: 0,
      promptBudgetTokens: 0,
      compressionTriggerTokens: 0
    };
  }
  // 这里和后端同一套默认策略：先按窗口预留输出和安全余量，再给 prompt 和压缩线。
  const rawRatio = Number(compactionPressureRatio);
  const ratio = Number.isFinite(rawRatio) && rawRatio > 0
    ? clampDecimal(rawRatio, 0.1, 0.98, 0.72)
    : 0.72;
  const responseReserveTokens = Math.min(24000, Math.max(1200, Math.floor(windowTokens * 0.18)));
  const safetyTokens = Math.max(800, Math.floor(windowTokens * 0.04));
  const availablePromptTokens = Math.max(0, windowTokens - responseReserveTokens - safetyTokens);
  const promptBudgetTokens = Math.max(2000, Math.min(availablePromptTokens, Math.floor(windowTokens * 0.86)));
  const compressionTriggerTokens = Math.min(promptBudgetTokens, Math.floor(promptBudgetTokens * ratio));
  return {
    contextWindowTokens: windowTokens,
    responseReserveTokens,
    safetyTokens,
    promptBudgetTokens,
    compressionTriggerTokens
  };
}

function resolvePlannerContextProfileClient(activeNovel, providers, draft = {}) {
  const roleSetting = activeNovel?.aiRoles?.planner || {};
  const providerId = String(draft.providerId ?? roleSetting.providerId ?? "");
  const model = String(draft.model ?? roleSetting.model ?? "");
  const provider = providers.find((item) => item.id === providerId) || null;
  const providerProfile = provider?.modelProfiles?.[model] || null;
  const roleWindow = normalizeTokenBudgetOverrideClient(draft.contextWindowTokens ?? roleSetting.contextWindowTokens);
  const profileWindow = normalizeTokenBudgetOverrideClient(providerProfile?.contextWindowTokens);
  const inferredWindow = inferModelContextWindowTokensClient(model);
  const contextWindowTokens = roleWindow || profileWindow || inferredWindow || 200000;
  const defaultReserve = Math.min(24000, Math.max(1200, Math.floor(contextWindowTokens * 0.18)));
  const roleResponseReserve = normalizeTokenBudgetOverrideClient(draft.responseReserveTokens ?? roleSetting.responseReserveTokens);
  const profileResponseReserve = normalizeTokenBudgetOverrideClient(providerProfile?.responseReserveTokens || providerProfile?.outputReserveTokens);
  const responseReserveTokens = clampNumber(
    roleResponseReserve || profileResponseReserve,
    1000,
    Math.max(1000, Math.floor(contextWindowTokens * 0.4)),
    defaultReserve
  );
  const roleSafetyTokens = normalizeTokenBudgetOverrideClient(draft.safetyTokens ?? roleSetting.safetyTokens);
  const safetyTokens = roleSafetyTokens
    ? clampNumber(roleSafetyTokens, 0, Math.max(0, Math.floor(contextWindowTokens * 0.3)), roleSafetyTokens)
    : Math.max(800, Math.floor(contextWindowTokens * 0.04));
  const availablePromptTokens = Math.max(0, contextWindowTokens - responseReserveTokens - safetyTokens);
  const rolePromptBudget = normalizeTokenBudgetOverrideClient(draft.promptBudgetTokens ?? roleSetting.promptBudgetTokens);
  const profilePromptBudget = normalizeTokenBudgetOverrideClient(providerProfile?.promptBudgetTokens);
  const autoPromptBudgetTokens = Math.max(2000, Math.min(availablePromptTokens, Math.floor(contextWindowTokens * 0.86)));
  const promptBudgetTokens = rolePromptBudget || profilePromptBudget
    ? Math.max(1000, Math.min(rolePromptBudget || profilePromptBudget, availablePromptTokens || 1000))
    : autoPromptBudgetTokens;
  const roleRatio = Number(draft.compactionPressureRatio ?? roleSetting.compactionPressureRatio);
  const profileRatio = Number(providerProfile?.compactionPressureRatio);
  const compactionPressureRatio = Number.isFinite(roleRatio) && roleRatio > 0
    ? Math.min(0.98, Math.max(0.1, roleRatio))
    : Number.isFinite(profileRatio) && profileRatio > 0
      ? Math.min(0.98, Math.max(0.1, profileRatio))
      : 0.72;
  const roleCompressionTrigger = normalizeTokenBudgetOverrideClient(draft.compressionTriggerTokens ?? roleSetting.compressionTriggerTokens);
  const profileCompressionTrigger = normalizeTokenBudgetOverrideClient(providerProfile?.compressionTriggerTokens);
  const compressionTriggerTokens = roleCompressionTrigger || profileCompressionTrigger
    ? Math.min(promptBudgetTokens, roleCompressionTrigger || profileCompressionTrigger)
    : Math.floor(promptBudgetTokens * compactionPressureRatio);
  const hasRoleBudgetOverride = Boolean(roleResponseReserve || roleSafetyTokens || rolePromptBudget || roleCompressionTrigger || roleWindow);
  const hasProfileBudgetOverride = Boolean(profileResponseReserve || profilePromptBudget || profileCompressionTrigger || profileWindow);
  return {
    providerId,
    model,
    contextWindowTokens,
    responseReserveTokens,
    safetyTokens,
    promptBudgetTokens,
    compressionTriggerTokens,
    compactionPressureRatio,
    budgetSource: hasRoleBudgetOverride ? "role_model_budget" : hasProfileBudgetOverride ? `provider_profile:${providerProfile?.source || "manual"}` : "auto_budget",
    source: roleWindow ? "role_model_context" : profileWindow ? `provider_profile:${providerProfile?.source || "manual"}` : inferredWindow ? "model_name_inferred" : "fallback_default"
  };
}

function formatTokenCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "未识别";
  if (number >= 1000000) return `${Number((number / 1000000).toFixed(number % 1000000 === 0 ? 0 : 1))}m`;
  if (number >= 1000) return `${Number((number / 1000).toFixed(number % 1000 === 0 ? 0 : 1))}k`;
  return `${Math.round(number)}`;
}

function contextProfileSourceLabel(source) {
  const value = String(source || "");
  if (value === "role_model_context") return "手动覆盖";
  if (value === "role_model_budget") return "手动预算";
  if (value === "auto_budget") return "自动预算";
  if (value.includes("auto_backoff")) return "自动调小后的模型档案";
  if (value.startsWith("provider_profile")) return "提供商模型档案";
  if (value === "model_name_inferred") return "按模型名推断";
  if (value === "runtime_context_backoff") return "运行时自动调小";
  if (value === "optimistic_default" || value === "fallback_default") return "乐观默认值";
  return value || "未知来源";
}

function useHashPage() {
  const readHash = () => window.location.hash.replace(/^#\/?/, "") || "planning";
  const [page, setPage] = useState(readHash);
  useEffect(() => {
    const onHashChange = () => setPage(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (key) => {
    window.location.hash = key;
    setPage(key);
  };
  return [pageItems.some((item) => item.key === page) ? page : "planning", navigate];
}

function MetricCard({ title, value, suffix, icon, tone = "ink" }) {
  return (
    <Card className={`metric-card metric-${tone}`} bordered={false}>
      <Space align="center" size={12}>
        <div className="metric-icon">{icon}</div>
        <Statistic title={title} value={value} suffix={suffix} />
      </Space>
    </Card>
  );
}

function PanelTitle({ icon, title, extra }) {
  return (
    <div className="panel-title">
      <Space size={8}>
        {icon}
        <Text className="panel-title-text">{title}</Text>
      </Space>
      {extra}
    </div>
  );
}

function EmptyNovel() {
  return (
    <Card className="empty-work-card" bordered={false}>
      <Empty
        icon={<IconBook />}
        description="还没有选择小说。先在左侧创建或打开一本小说，再进入策划、档案和扮演流程。"
      />
    </Card>
  );
}

function WorkspaceDrawerShell({ children, footer = null, className = "", bodyClassName = "" }) {
  return (
    <div className={`workspace-drawer-shell ${className}`.trim()}>
      <div className={`workspace-drawer-body ${bodyClassName}`.trim()}>
        {children}
      </div>
      {footer && <div className="workspace-drawer-footer">{footer}</div>}
    </div>
  );
}

function BackgroundStage({ settings, slideIndex }) {
  const normalized = normalizeBackgroundSettings(settings);
  const items = activeBackgroundItems(normalized);
  const activeItem = normalized.mode === "slideshow" ? items[slideIndex % Math.max(items.length, 1)] : items[0];
  const activeUrl = activeItem?.url || "";
  const showVideo = isBackgroundVideoItem(activeItem);
  const showImage = activeUrl && !showVideo;
  const backLayer = normalized.particleLayers.back;

  return (
    <div
      className={`background-stage background-mode-${normalized.mode} background-scope-${normalized.backgroundScope} surface-${normalized.surfaceMaterial}`}
      style={{
        "--bg-overlay": normalized.overlay / 100,
        "--bg-blur": `${normalized.blur}px`,
        "--active-bg-url": showImage ? `url("${String(activeUrl).replace(/"/g, '\\"')}")` : "none"
      }}
      aria-hidden="true"
    >
      {showVideo && (
        <video
          key={activeUrl}
          className="background-media"
          src={activeUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
      {showImage && (
        <div
          className="background-media background-image"
          style={{ backgroundImage: `url("${String(activeUrl).replace(/"/g, '\\"')}")` }}
        />
      )}
      <ParticleCanvasLayer layer={backLayer} layerKey="back" />
      <div className="background-scrim" />
    </div>
  );
}

function ForegroundParticleLayer({ settings }) {
  const normalized = normalizeBackgroundSettings(settings);
  const frontLayer = normalized.particleLayers.front;
  if (!frontLayer.enabled) return null;
  const layer = (
    <div className={`foreground-particles particles-front particles-${frontLayer.preset}`} aria-hidden="true">
      <ParticleCanvasLayer layer={frontLayer} layerKey="front" />
    </div>
  );
  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}

function BackgroundPreviewCard({ title, item, indexText, actions, onOpen }) {
  if (!item?.url) return null;
  const showVideo = isBackgroundVideoItem(item);
  return (
    <div className="background-preview-box">
      <div className="folder-path-line">
        <Text className="field-label">{title}</Text>
        <Space>
          {indexText && <Tag>{indexText}</Tag>}
          <Tag>点击放大</Tag>
          {actions}
        </Space>
      </div>
      <button
        type="button"
        className="background-preview-thumb"
        onClick={() => onOpen?.(item)}
        aria-label={`放大预览 ${item.name || "背景媒体"}`}
      >
        {showVideo ? (
          <video src={item.url} muted loop autoPlay playsInline />
        ) : (
          <img src={item.url} alt={item.name || "背景预览"} />
        )}
      </button>
      <Text className="path-hint">{item.name || item.url}</Text>
    </div>
  );
}

function ParticleCanvasLayer({ layer, layerKey }) {
  const normalized = normalizeParticleLayer(layer, defaultParticleLayers[layerKey] || defaultParticleLayers.back);
  if (particleWindFlipPresets.has(normalized.preset)) {
    return <ThreeSheetParticleLayer layer={layer} layerKey={layerKey} />;
  }
  return <TsParticleCanvasLayer layer={layer} layerKey={layerKey} />;
}

function TsParticleCanvasLayer({ layer, layerKey }) {
  const particlesReady = useParticlesEngineReady();
  const normalized = normalizeParticleLayer(layer, defaultParticleLayers[layerKey] || defaultParticleLayers.back);
  const options = useMemo(() => createTsParticlesOptions(normalized, layerKey), [
    layerKey,
    normalized.enabled,
    normalized.preset,
    normalized.density,
    normalized.direction,
    normalized.spawnPosition,
    particleSpawnEdgesSignature(normalized.spawnEdges),
    normalized.movementDirection,
    normalized.windDirection,
    normalized.wind,
    normalized.windAdjustMin,
    normalized.windAdjustMax,
    normalized.flowStrength,
    normalized.flowStrengthMin,
    normalized.flowStrengthMax,
    normalized.flowFrequencyMin,
    normalized.flowFrequencyMax,
    normalized.spreadStrength,
    normalized.shearStrength,
    normalized.turbulence,
    normalized.turbulenceMin,
    normalized.turbulenceMax,
    normalized.turbulenceFrequencyMin,
    normalized.turbulenceFrequencyMax,
    normalized.turbulenceTimeMin,
    normalized.turbulenceTimeMax,
    normalized.speed,
    normalized.size,
    normalized.opacity
  ]);
  const layerRenderKey = [
    layerKey,
    normalized.preset,
    normalized.density,
    normalized.direction,
    normalized.spawnPosition,
    particleSpawnEdgesSignature(normalized.spawnEdges),
    normalized.movementDirection,
    normalized.windDirection,
    normalized.wind,
    normalized.windAdjustMin,
    normalized.windAdjustMax,
    normalized.flowStrength,
    normalized.flowStrengthMin,
    normalized.flowStrengthMax,
    normalized.flowFrequencyMin,
    normalized.flowFrequencyMax,
    normalized.shearStrength,
    normalized.turbulenceMin,
    normalized.turbulenceMax,
    normalized.turbulenceFrequencyMin,
    normalized.turbulenceFrequencyMax,
    normalized.turbulenceTimeMin,
    normalized.turbulenceTimeMax,
    normalized.speed,
    normalized.size,
    normalized.opacity
  ].join(":");

  if (!particlesReady || !normalized.enabled || normalized.density <= 0 || normalized.opacity <= 0) return null;
  return (
    <StableParticles
      key={layerRenderKey}
      id={`roleplay-particles-${layerKey}`}
      className={`particle-canvas particle-canvas-${layerKey} particles-${normalized.preset}`}
      options={options}
      aria-hidden="true"
    />
  );
}

const particleControlHelp = {
  speed: "运动方向速度。它只放大“运动方向”的本体惯性，不直接放大全局风速；标准风方向微调和意外风仍由各自参数接管。",
  mainWind: "标准风沿风向吹，强度在范围内起伏。",
  mainWindFrequency: "标准风强弱起伏周期。数值越小变化越快；0.01 秒/次等于 100Hz，会更接近快速抖动，不像自然风。",
  windAdjust: "对标准风方向做连续小角度微调，不是独立侧风。负值向逆时针偏，正值向顺时针偏。",
  shear: "不同区域的顺风速度差。",
  turbulence: "临时偏离标准风向的意外风强度。每次意外风会抽取局部位置和随机方向，不会固定围绕中心。",
  turbulenceFrequency: "意外风出现间隔。数值越小越频繁；0.01 秒/次会让意外风高频切换，位置和方向仍会重新随机。",
  turbulenceTime: "单次意外风持续时间。"
};

const particleDirectionHelp = {
  down: "出生后先向下运动。后续仍会被标准风方向微调、风切变和意外风逐步接管。",
  up: "出生后先向上运动。适合逆风扬尘、上升魔法粒子或特殊氛围。",
  right: "出生后先向右运动。适合横向飘雪、花瓣或叶片。",
  left: "出生后先向左运动。适合反向横风或画面扫过感。",
  diagonal: "出生后先向右下运动。适合斜雨、斜雪或有纵深的落花。"
};

const particleSpawnPositionHelp = {
  top: "粒子主要从画面上方进入。运动方向可以另外设置成向下、向右或其它方向。",
  bottom: "粒子主要从画面下方进入。适合上升尘埃、逆风雪或魔法粒子。",
  left: "粒子主要从画面左侧进入。适合横向风、飘带式雨雪或页面扫入效果。",
  right: "粒子主要从画面右侧进入。适合反向横风或从右向左的镜头感。",
  topLeft: "粒子主要从左上角进入。适合斜向雨雪、落花和有纵深感的粒子。"
};

const particleWindDirectionHelp = {
  down: "风主要向下吹。适合无明显横风的落雪、雨线和落花。",
  up: "风主要向上吹。适合逆风扬起、魔法粒子或特殊氛围。",
  right: "风主要向右吹。适合让从上方出现的雪、花瓣或叶片明显横向飘走。",
  left: "风主要向左吹。适合反向横风。",
  diagonal: "风主要向右下方吹。适合斜雨、斜雪或带纵深的落花。"
};

function FieldHelpLabel({ label, help }) {
  return (
    <span className="field-label-with-help">
      <Text className="field-label">{label}</Text>
      {help && (
        <Tooltip
          mini
          position="right"
          color="rgba(255, 253, 248, 0.98)"
          content={<span className="field-tooltip-content">{help}</span>}
          getPopupContainer={() => document.body}
        >
          <span className="field-help-icon" tabIndex={0} aria-label={`${label}说明`}>
            <IconQuestionCircle />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

function ParticleSliderControl({ label, value, min, max, onChange, tag, help }) {
  return (
    <div className="surface-control">
      <div className="surface-control-head">
        <FieldHelpLabel label={label} help={help} />
        <Space size={6}>
          {tag && <Tag>{tag}</Tag>}
          <InputNumber min={min} max={max} value={value} onChange={onChange} />
        </Space>
      </div>
      <Slider min={min} max={max} value={value} onChange={onChange} />
    </div>
  );
}

function normalizeControlRange(value, min, max) {
  const source = Array.isArray(value) ? value : [min, max];
  const start = clampDecimal(source[0], min, max, min);
  const end = clampDecimal(source[1], min, max, max);
  return [Math.min(start, end), Math.max(start, end)];
}

function ParticleRangeSliderControl({ label, value, min, max, step = 1, precision, onChange, tag, help }) {
  const range = normalizeControlRange(value, min, max);
  const patchStart = (nextStart) => {
    const next = normalizeControlRange([nextStart, range[1]], min, max);
    onChange?.(next);
  };
  const patchEnd = (nextEnd) => {
    const next = normalizeControlRange([range[0], nextEnd], min, max);
    onChange?.(next);
  };
  return (
    <div className="surface-control">
      <div className="surface-control-head">
        <FieldHelpLabel label={label} help={help} />
        <Space size={6}>
          {tag && <Tag>{tag}</Tag>}
          <InputNumber min={min} max={max} step={step} precision={precision} value={range[0]} onChange={patchStart} />
          <Text type="secondary">-</Text>
          <InputNumber min={min} max={max} step={step} precision={precision} value={range[1]} onChange={patchEnd} />
        </Space>
      </div>
      <Slider range min={min} max={max} step={step} value={range} onChange={(nextRange) => onChange?.(normalizeControlRange(nextRange, min, max))} />
    </div>
  );
}

function particleFrequencyToPeriod(frequency) {
  const normalized = clampDecimal(frequency, particleFrequencyControlMin, particleFrequencyControlMax, 0.1);
  const period = 1 / normalized;
  return Number(period.toFixed(period < 1 ? 2 : 1));
}

function particleFrequencyRangeToPeriodRange(minFrequency, maxFrequency) {
  const shortPeriod = particleFrequencyToPeriod(maxFrequency);
  const longPeriod = particleFrequencyToPeriod(minFrequency);
  return normalizeControlRange([shortPeriod, longPeriod], particlePeriodControlMin, particlePeriodControlMax);
}

function particlePeriodRangeToFrequencyRange(periodRange) {
  const [shortPeriod, longPeriod] = normalizeControlRange(periodRange, particlePeriodControlMin, particlePeriodControlMax);
  const minFrequency = Number((1 / longPeriod).toFixed(5));
  const maxFrequency = Number((1 / shortPeriod).toFixed(5));
  return [
    clampDecimal(minFrequency, particleFrequencyControlMin, particleFrequencyControlMax, 0.08),
    clampDecimal(maxFrequency, particleFrequencyControlMin, particleFrequencyControlMax, 0.28)
  ];
}

function particlePeriodToSliderValue(period) {
  const normalized = clampDecimal(period, particlePeriodControlMin, particlePeriodControlMax, 1);
  const minLog = Math.log10(particlePeriodControlMin);
  const maxLog = Math.log10(particlePeriodControlMax);
  return Math.round(((Math.log10(normalized) - minLog) / (maxLog - minLog)) * particleLogSliderMax);
}

function particleSliderValueToPeriod(value) {
  const sliderValue = clampNumber(value, 0, particleLogSliderMax, 0);
  const minLog = Math.log10(particlePeriodControlMin);
  const maxLog = Math.log10(particlePeriodControlMax);
  const raw = 10 ** (minLog + (sliderValue / particleLogSliderMax) * (maxLog - minLog));
  return Number(raw.toFixed(raw < 1 ? 2 : 1));
}

function ParticlePeriodRangeSliderControl({ label, value, onChange, help }) {
  const range = normalizeControlRange(value, particlePeriodControlMin, particlePeriodControlMax);
  const sliderRange = range.map(particlePeriodToSliderValue);
  const patchStart = (nextStart) => {
    onChange?.(normalizeControlRange([nextStart, range[1]], particlePeriodControlMin, particlePeriodControlMax));
  };
  const patchEnd = (nextEnd) => {
    onChange?.(normalizeControlRange([range[0], nextEnd], particlePeriodControlMin, particlePeriodControlMax));
  };
  const patchSlider = (nextRange) => {
    const source = Array.isArray(nextRange) ? nextRange : sliderRange;
    onChange?.(normalizeControlRange(source.map(particleSliderValueToPeriod), particlePeriodControlMin, particlePeriodControlMax));
  };
  return (
    <div className="surface-control">
      <div className="surface-control-head">
        <FieldHelpLabel label={label} help={help} />
        <Space size={6}>
          <Tag>秒/次</Tag>
          <InputNumber min={particlePeriodControlMin} max={particlePeriodControlMax} step={0.01} precision={2} value={range[0]} onChange={patchStart} />
          <Text type="secondary">-</Text>
          <InputNumber min={particlePeriodControlMin} max={particlePeriodControlMax} step={0.01} precision={2} value={range[1]} onChange={patchEnd} />
        </Space>
      </div>
      <Slider range min={0} max={particleLogSliderMax} step={1} value={sliderRange} onChange={patchSlider} />
    </div>
  );
}

function ParticleSpawnEdgeEditor({ value, onChange }) {
  const spawnEdges = normalizeParticleSpawnEdges(value, defaultParticleSpawnEdges, "top");
  const patchEdge = (edgeKey, patch) => {
    const next = normalizeParticleSpawnEdges(spawnEdges, defaultParticleSpawnEdges, "top");
    next[edgeKey] = {
      ...next[edgeKey],
      ...patch,
      range: patch.range ? normalizeControlRange(patch.range, 0, 100) : next[edgeKey].range
    };
    if (!particleSpawnEdgeOptions.some((edge) => next[edge.key]?.enabled)) {
      next[edgeKey].enabled = true;
    }
    onChange?.(next);
  };
  return (
    <div className="particle-spawn-edge-grid">
      {particleSpawnEdgeOptions.map((edge) => {
        const config = spawnEdges[edge.key] || defaultParticleSpawnEdges[edge.key];
        const range = normalizeControlRange(config.range, 0, 100);
        return (
          <div key={edge.key} className={`particle-spawn-edge ${config.enabled ? "active" : ""}`}>
            <div className="particle-spawn-edge-head">
              <Checkbox checked={config.enabled} onChange={(enabled) => patchEdge(edge.key, { enabled })}>
                <Space size={6}>
                  {edge.icon}
                  <span>{edge.label}</span>
                </Space>
              </Checkbox>
              <Tag>{range[0]}%-{range[1]}%</Tag>
            </div>
            <ParticleRangeSliderControl
              label={edge.axisLabel}
              min={0}
              max={100}
              value={range}
              onChange={(nextRange) => patchEdge(edge.key, { range: nextRange })}
              help="控制这条边允许生成粒子的区段。上边和下边是横向百分比，左边和右边是纵向百分比。"
            />
          </div>
        );
      })}
    </div>
  );
}

function ParticleLayerEditor({ layerKey, layer, count, onPatch }) {
  const movementDirection = layer.movementDirection || layer.direction || "down";
  const spawnEdges = normalizeParticleSpawnEdges(layer.spawnEdges, particleSpawnEdgesFromPosition(layer.spawnPosition || "top"), layer.spawnPosition || "top");
  const spawnPositionLabel = particleSpawnEdgesLabel(spawnEdges);
  const movementDirectionLabel = particleDirectionOptions.find((item) => item.key === movementDirection)?.label || "向下";
  const windDirectionLabel = particleWindDirectionOptions.find((item) => item.key === layer.windDirection)?.label || "向右吹";
  const shearStrength = layer.shearStrength ?? 0;
  const windAdjustMin = layer.windAdjustMin ?? Math.max(-45, (layer.wind ?? 0) - 8);
  const windAdjustMax = layer.windAdjustMax ?? Math.min(45, (layer.wind ?? 0) + 8);
  const flowStrengthMin = layer.flowStrengthMin ?? Math.max(0, (layer.flowStrength ?? 0) - 14);
  const flowStrengthMax = layer.flowStrengthMax ?? Math.min(100, (layer.flowStrength ?? 0) + 14);
  const flowFrequencyMin = layer.flowFrequencyMin ?? 0.08;
  const flowFrequencyMax = layer.flowFrequencyMax ?? 0.28;
  const flowPeriodRange = particleFrequencyRangeToPeriodRange(flowFrequencyMin, flowFrequencyMax);
  const turbulenceMin = layer.turbulenceMin ?? Math.max(0, (layer.turbulence ?? 0) * 0.45);
  const turbulenceMax = layer.turbulenceMax ?? layer.turbulence ?? 0;
  const turbulenceFrequencyMin = layer.turbulenceFrequencyMin ?? 0.08;
  const turbulenceFrequencyMax = layer.turbulenceFrequencyMax ?? 0.32;
  const turbulencePeriodRange = particleFrequencyRangeToPeriodRange(turbulenceFrequencyMin, turbulenceFrequencyMax);
  const turbulenceTimeMin = layer.turbulenceTimeMin ?? 1.2;
  const turbulenceTimeMax = layer.turbulenceTimeMax ?? 4.8;
  const flowStrengthAverage = Math.round((flowStrengthMin + flowStrengthMax) / 2);
  const flowFrequencyAverage = (flowFrequencyMin + flowFrequencyMax) / 2;
  const turbulenceFrequencyAverage = (turbulenceFrequencyMin + turbulenceFrequencyMax) / 2;
  const windSummary = `${windDirectionLabel} / 微调 ${Math.round(windAdjustMin)}°-${Math.round(windAdjustMax)}°`;
  const flowAngle = particleDirectionAngle(layer.windDirection);
  const previewFlowAngle = flowAngle + ((windAdjustMin + windAdjustMax) / 2) + shearStrength * 0.07;
  const patchSpawnEdges = (nextSpawnEdges) => {
    onPatch(layerKey, {
      spawnEdges: nextSpawnEdges,
      spawnPosition: particleSpawnEdgesPrimaryPosition(nextSpawnEdges, layer.spawnPosition || "top")
    });
  };
  return (
    <div className={`particle-layer-editor particle-layer-${layerKey}`}>
      <div className="folder-path-line">
        <Space size={8}>
          <Text className="field-label">{particleLayerLabels[layerKey]}</Text>
          <Tag>{count} 个</Tag>
        </Space>
        <Switch size="small" checked={layer.enabled} onChange={(enabled) => onPatch(layerKey, { enabled })} />
      </div>
      <div className="particle-preset-grid">
        {particlePresetOptions.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`particle-preset ${layer.preset === item.key ? "active" : ""}`}
            onClick={() => onPatch(layerKey, { preset: item.key, enabled: true })}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="particle-preview-strip">
        <div className={`particle-preview-scene preview-${layer.preset}`}>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <Collapse className="particle-option-collapse" bordered={false} defaultActiveKey={["basic", "motion", "field"]} expandIconPosition="right">
        <Collapse.Item
          name="basic"
          header={(
            <div className="particle-collapse-header">
              <Text className="field-label">基础效果</Text>
              <Tag>{layer.opacity}% 透明</Tag>
            </div>
          )}
        >
          <div className="surface-control-grid particle-control-grid">
            <ParticleSliderControl label="粒子密度" min={0} max={100} value={layer.density} onChange={(density) => onPatch(layerKey, { density })} />
            <ParticleSliderControl label="运动方向速度" min={10} max={180} value={layer.speed} onChange={(speed) => onPatch(layerKey, { speed })} help={particleControlHelp.speed} />
            <ParticleSliderControl
              label="物体重量"
              min={25}
              max={260}
              value={layer.weightScale ?? 100}
              tag="%"
              onChange={(weightScale) => onPatch(layerKey, { weightScale })}
              help="只影响片状粒子。它会放大真实质量和重量，同等风强下更重的花瓣、叶片或蒲公英会更难被风推动和翻起。"
            />
            <ParticleSliderControl
              label="粒子最大尺寸"
              min={particleSizeControlMin}
              max={particleSizeControlMax}
              value={layer.size}
              tag="px"
              onChange={(size) => onPatch(layerKey, { size, sizeUnit: "px" })}
              help="这是粒子在屏幕上的最终外接尺寸上限。片状粒子旋转、倾斜后也不会超过这个像素值。"
            />
            <ParticleSliderControl label="粒子透明" min={0} max={100} value={layer.opacity} onChange={(opacity) => onPatch(layerKey, { opacity })} />
          </div>
        </Collapse.Item>
        <Collapse.Item
          name="motion"
          header={(
            <div className="particle-collapse-header">
              <Text className="field-label">出现边缘 / 运动方向</Text>
              <Tag>{spawnPositionLabel} / {movementDirectionLabel}</Tag>
            </div>
          )}
        >
          <div className="particle-field-section">
            <div className="particle-collapse-header inline">
              <FieldHelpLabel
                label="出现边缘"
                help="可以同时启用多条边。每条边的范围决定粒子从该边哪一段连续进入画面。"
              />
              <Tag>{spawnPositionLabel}</Tag>
            </div>
            <ParticleSpawnEdgeEditor value={spawnEdges} onChange={patchSpawnEdges} />
          </div>
          <div className="particle-field-section">
            <div className="particle-collapse-header inline">
              <Text className="field-label">运动方向</Text>
              <Tag>{movementDirectionLabel}</Tag>
            </div>
            <div className="background-source-grid particle-direction-grid">
              {particleDirectionOptions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={`${item.label}：${particleDirectionHelp[item.key]}`}
                    className={`background-source ${movementDirection === item.key ? "active" : ""}`}
                    onClick={() => onPatch(layerKey, { movementDirection: item.key, direction: item.key })}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
              ))}
            </div>
          </div>
        </Collapse.Item>
        <Collapse.Item
          name="field"
          header={(
            <div className="particle-collapse-header">
              <Text className="field-label">气流与意外风</Text>
              <Tag>{windSummary}</Tag>
            </div>
          )}
          >
          <div className="particle-field-section">
            <div className="particle-collapse-header inline">
              <Text className="field-label">标准风向</Text>
              <Tag>{windDirectionLabel}</Tag>
            </div>
            <div className="background-source-grid particle-direction-grid">
              {particleWindDirectionOptions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={`${item.label}：${particleWindDirectionHelp[item.key]}`}
                    className={`background-source ${layer.windDirection === item.key ? "active" : ""}`}
                    onClick={() => onPatch(layerKey, { windDirection: item.key })}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
              ))}
            </div>
          </div>
          <div
            className="particle-wind-preview"
            style={{
              "--particle-flow-angle": `${previewFlowAngle}deg`,
              "--particle-flow-strength": `${Math.max(0.14, flowStrengthAverage / 100)}`,
              "--particle-flow-variation": `${Math.max(0, (flowStrengthMax - flowStrengthMin) / 100)}`,
              "--particle-flow-duration": `${Math.max(1.2, 4.3 - flowFrequencyAverage * 1.85)}s`,
              "--particle-shear-strength": `${Math.max(-1, Math.min(1, shearStrength / 100))}`,
              "--particle-accidental-strength": `${Math.max(0, turbulenceMax / 100)}`,
              "--particle-accidental-duration": `${Math.max(0.8, 4.6 - turbulenceFrequencyAverage * 2.2)}s`
            }}
          >
            <div className="particle-wind-line-field" aria-hidden="true">
              {particleFlowPreviewVectors.map((item, index) => (
                <span
                  key={`${item.x}-${item.y}-${index}`}
                  className="particle-wind-stream"
                  style={{
                    "--vector-x": `${item.x}%`,
                    "--vector-y": `${item.y}%`,
                    "--vector-scale": item.scale,
                    "--vector-bend": `${item.bend}deg`,
                    "--vector-opacity": item.opacity,
                    "--vector-delay": `${item.delay}s`
                  }}
                />
              ))}
              {particleFlowPreviewBands.map((item, index) => (
                <span
                  key={`flow-band-${index}`}
                  className="particle-wind-band"
                  style={{
                    "--wind-band-top": `${item.top}%`,
                    "--wind-band-opacity": item.opacity,
                    "--wind-band-delay": `${item.delay}s`
                  }}
                />
              ))}
            </div>
          </div>
          <div className="surface-control-grid particle-control-grid">
            <ParticleRangeSliderControl
              label="标准风力范围"
              min={0}
              max={100}
              value={[flowStrengthMin, flowStrengthMax]}
              onChange={([nextMin, nextMax]) => onPatch(layerKey, {
                flowStrengthMin: nextMin,
                flowStrengthMax: nextMax,
                flowStrength: Math.round((nextMin + nextMax) / 2)
              })}
              help={particleControlHelp.mainWind}
            />
            <ParticlePeriodRangeSliderControl
              label="标准风起伏周期范围"
              value={flowPeriodRange}
              onChange={(nextRange) => {
                const [nextMin, nextMax] = particlePeriodRangeToFrequencyRange(nextRange);
                onPatch(layerKey, {
                  flowFrequencyMin: nextMin,
                  flowFrequencyMax: nextMax
                });
              }}
              help={particleControlHelp.mainWindFrequency}
            />
            <ParticleRangeSliderControl
              label="标准风方向微调范围"
              min={-45}
              max={45}
              value={[windAdjustMin, windAdjustMax]}
              tag="度"
              onChange={([nextMin, nextMax]) => onPatch(layerKey, {
                windAdjustMin: nextMin,
                windAdjustMax: nextMax,
                wind: Math.round((nextMin + nextMax) / 2)
              })}
              help={particleControlHelp.windAdjust}
            />
            <ParticleSliderControl label="风切变" min={-100} max={100} value={shearStrength} onChange={(nextShearStrength) => onPatch(layerKey, { shearStrength: nextShearStrength })} help={particleControlHelp.shear} />
            <ParticleRangeSliderControl
              label="意外风强度范围"
              min={0}
              max={100}
              value={[turbulenceMin, turbulenceMax]}
              onChange={([nextMin, nextMax]) => onPatch(layerKey, {
                turbulenceMin: nextMin,
                turbulenceMax: nextMax,
                turbulence: Math.round((nextMin + nextMax) / 2)
              })}
              help={particleControlHelp.turbulence}
            />
            <ParticlePeriodRangeSliderControl
              label="意外风出现间隔范围"
              value={turbulencePeriodRange}
              onChange={(nextRange) => {
                const [nextMin, nextMax] = particlePeriodRangeToFrequencyRange(nextRange);
                onPatch(layerKey, {
                  turbulenceFrequencyMin: nextMin,
                  turbulenceFrequencyMax: nextMax
                });
              }}
              help={particleControlHelp.turbulenceFrequency}
            />
            <ParticleRangeSliderControl
              label="意外风时间范围"
              min={0.2}
              max={12}
              step={0.2}
              precision={1}
              value={[turbulenceTimeMin, turbulenceTimeMax]}
              tag="秒"
              onChange={([nextMin, nextMax]) => onPatch(layerKey, {
                turbulenceTimeMin: nextMin,
                turbulenceTimeMax: nextMax
              })}
              help={particleControlHelp.turbulenceTime}
            />
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
}

function BackgroundSettingsDrawer({ visible, value, onPreview, onApply, onClose }) {
  const [draft, setDraft] = useState(() => normalizeBackgroundSettings(value));
  const [pendingAsset, setPendingAsset] = useState(null);
  const [projectAssets, setProjectAssets] = useState([]);
  const [assetDirectory, setAssetDirectory] = useState("");
  const [folderPathDraft, setFolderPathDraft] = useState("");
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [pickingBackgroundFolder, setPickingBackgroundFolder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewingBackground, setPreviewingBackground] = useState(null);
  const objectUrlRef = useRef("");
  const folderInputRef = useRef(null);
  const backgroundFolderPickerAbortRef = useRef(null);
  const openingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    openingRef.current = true;
    const next = normalizeBackgroundSettings(value);
    setDraft(next);
    setFolderPathDraft(next.boundFolderPath);
    setCurrentPreviewIndex(0);
    setPendingAsset(null);
    setPreviewingBackground(null);
    onPreview?.(next);
  }, [visible, value, onPreview]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingAssets(true);
    api.listBackgroundAssets()
      .then((result) => {
        if (cancelled) return;
        setProjectAssets(Array.isArray(result.assets) ? result.assets : []);
        setAssetDirectory(result.directory || "");
      })
      .catch(showError)
      .finally(() => {
        if (!cancelled) setLoadingAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (openingRef.current) {
      openingRef.current = false;
      return;
    }
    if (visible) onPreview?.(normalizeBackgroundSettings(draft));
  }, [visible, draft, onPreview]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    backgroundFolderPickerAbortRef.current?.abort();
  }, []);

  const patchDraft = (patch) => setDraft((current) => {
    const next = normalizeBackgroundSettings({ ...current, ...patch });
    const committedUrls = collectBackgroundObjectUrls(value);
    const nextUrls = collectBackgroundObjectUrls(next);
    for (const url of collectBackgroundObjectUrls(current)) {
      if (!nextUrls.has(url) && !committedUrls.has(url)) {
        URL.revokeObjectURL(url);
        if (objectUrlRef.current === url) objectUrlRef.current = "";
      }
    }
    return next;
  });

  const patchActiveSurfaceProfile = (patch) => {
    setDraft((current) => {
      const normalized = normalizeBackgroundSettings(current);
      const material = normalized.surfaceMaterial;
      const surfaceProfiles = {
        ...normalized.surfaceProfiles,
        [material]: {
          ...normalized.surfaceProfiles[material],
          ...patch
        }
      };
      return normalizeBackgroundSettings({
        ...normalized,
        surfaceProfiles
      });
    });
  };

  const activeSurfaceProfile = normalizeBackgroundSettings(draft).surfaceProfiles[normalizeBackgroundSettings(draft).surfaceMaterial];
  const previewItems = activeBackgroundItems(draft);
  const currentPreview = previewItems[currentPreviewIndex % Math.max(previewItems.length, 1)];
  const singlePreview = draft.mode === "media" ? previewItems[0] : null;
  const normalizedDraft = normalizeBackgroundSettings(draft);
  const particleCountPreview = {
    back: particleCountForLayer(normalizedDraft.particleLayers.back, "back"),
    front: particleCountForLayer(normalizedDraft.particleLayers.front, "front")
  };

  const patchParticleLayer = (layerKey, patch) => {
    setDraft((current) => {
      const normalized = normalizeBackgroundSettings(current);
      return normalizeBackgroundSettings({
        ...normalized,
        particleLayers: {
          ...normalized.particleLayers,
          [layerKey]: {
            ...normalized.particleLayers[layerKey],
            ...patch
          }
        }
      });
    });
  };

  const changeIncludeSubfolders = (includeSubfolders) => {
    if (!includeSubfolders && draft.localPlaylist.length > 0) {
      const filtered = draft.localPlaylist.filter((item) => String(item.name || "").split("/").length <= 2);
      const removedCount = draft.localPlaylist.length - filtered.length;
      patchDraft({ includeSubfolders, localPlaylist: filtered });
      if (removedCount > 0) notify("info", `已排除 ${removedCount} 个子文件夹媒体；重新导入文件夹可恢复`);
      return;
    }
    patchDraft({ includeSubfolders });
    if (includeSubfolders && draft.localPlaylist.length > 0) {
      notify("info", "已开启子文件夹选项；如需补入子文件夹媒体，请重新导入文件夹");
    }
  };

  const previewLocalFile = (file) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      notify("warning", "请选择图片、GIF 或视频文件");
      return false;
    }
    if (file.size > 80 * 1024 * 1024) {
      notify("warning", "单个背景媒体不能超过 80MB");
      return false;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPendingAsset(file);
    patchDraft({
      mode: "media",
      localUrl: url,
      localType: file.type,
      assetUrl: "",
      assetType: "",
      assetName: file.name,
      playlist: [],
      localPlaylist: [],
      slideshowSource: "project"
    });
    notify("success", "已加载本地预览，点击“应用背景”后会保存到本项目");
    return false;
  };

  const pickFolder = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const includeSubfolders = draft.includeSubfolders !== false;
    const formats = draft.slideshowFormats;
    const mediaFiles = files
      .filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
      .filter((file) => backgroundFileAllowed(file, formats))
      .filter((file) => {
        if (includeSubfolders) return true;
        const relativePath = file.webkitRelativePath || file.name;
        return relativePath.split("/").length <= 2;
      })
      .filter((file) => file.size <= 18 * 1024 * 1024)
      .slice(0, 120)
      .map((file) => ({
        url: URL.createObjectURL(file),
        type: file.type,
        name: file.webkitRelativePath || file.name,
        size: file.size,
        file
      }));
    if (mediaFiles.length === 0) {
      notify("warning", "文件夹里没有符合条件的图片、GIF 或视频，或文件超过 18MB");
      return;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }
    setFolderPathDraft("");
    patchDraft({
      mode: "slideshow",
      slideshowSource: "project",
      localUrl: "",
      localType: "",
      assetUrl: "",
      assetType: "",
      assetName: "",
      playlist: [],
      localPlaylist: mediaFiles,
      boundFolderPath: "",
      folderPreviewToken: ""
    });
    setPendingAsset(null);
    notify("success", `已导入 ${mediaFiles.length} 个本地媒体文件，应用后会写入项目背景库`);
  };

  const loadProjectAssetsAsSlideshow = async () => {
    setLoadingAssets(true);
    try {
      const result = await api.listBackgroundAssets();
      const formats = new Set(draft.slideshowFormats);
      const assets = (Array.isArray(result.assets) ? result.assets : [])
        .filter((item) => formats.has(String(item.name || item.url || "").split(".").pop()?.toLowerCase() || ""))
        .slice(0, 160);
      setProjectAssets(Array.isArray(result.assets) ? result.assets : []);
      setAssetDirectory(result.directory || "");
      if (assets.length === 0) {
        notify("warning", "项目背景库里还没有符合当前格式的媒体");
        return;
      }
      patchDraft({
        mode: "slideshow",
        slideshowSource: "project",
        playlist: assets,
        localPlaylist: [],
        boundFolderPath: "",
        folderPreviewToken: "",
        assetUrl: "",
        assetType: "",
        assetName: ""
      });
      notify("success", `已从项目背景库载入 ${assets.length} 个媒体`);
    } catch (error) {
      showError(error);
    } finally {
      setLoadingAssets(false);
    }
  };

  const scanBoundFolder = async () => {
    await scanFolderPaths([folderPathDraft.trim(), ...draft.boundFolders.map((item) => item.path)]);
  };

  const scanFolderPaths = async (folderPaths) => {
    const paths = uniqueStrings(folderPaths.map((item) => String(item || "").trim()).filter(Boolean));
    if (paths.length === 0) {
      notify("warning", "请先添加本地文件夹路径");
      return;
    }
    setScanningFolder(true);
    try {
      const result = await api.scanBackgroundFolders({
        folderPaths: paths,
        formats: draft.slideshowFormats,
        includeSubfolders: draft.includeSubfolders
      });
      const items = Array.isArray(result.items) ? result.items : [];
      if (items.length === 0) {
        notify("warning", "这些文件夹里没有符合当前格式的背景媒体");
      }
      const folders = normalizeBackgroundFolders(result.folders, result.folderPath);
      patchDraft({
        mode: "slideshow",
        slideshowSource: "folder",
        boundFolderPath: result.folderPath || paths[0],
        boundFolders: folders,
        folderPreviewToken: result.previewToken || "",
        playlist: items,
        localPlaylist: [],
        assetUrl: "",
        assetType: "",
        assetName: ""
      });
      setCurrentPreviewIndex(0);
      notify("success", `已绑定 ${folders.length} 个文件夹，扫描到 ${items.length} 个媒体`);
    } catch (error) {
      showError(error);
    } finally {
      setScanningFolder(false);
    }
  };

  const addFolderPathDraft = async () => {
    const pathText = folderPathDraft.trim();
    if (!pathText) {
      notify("warning", "请先填写本地文件夹路径");
      return;
    }
    await scanFolderPaths([...draft.boundFolders.map((item) => item.path), pathText]);
  };

  const removeBoundFolder = async (folderPath) => {
    const nextFolders = draft.boundFolders.filter((item) => item.path !== folderPath);
    if (nextFolders.length === 0) {
      patchDraft({
        boundFolders: [],
        boundFolderPath: "",
        playlist: [],
        folderPreviewToken: ""
      });
      return;
    }
    await scanFolderPaths(nextFolders.map((item) => item.path));
  };

  const pickAndBindFolder = async () => {
    if (backgroundFolderPickerAbortRef.current) {
      backgroundFolderPickerAbortRef.current.abort();
      return;
    }
    const controller = new AbortController();
    backgroundFolderPickerAbortRef.current = controller;
    setPickingBackgroundFolder(true);
    setScanningFolder(true);
    notify("info", "已打开系统文件夹选择器；如果窗口没有出现在前台，可以直接粘贴路径，或点击停止等待。");
    try {
      const result = await api.pickBackgroundFolder(folderPathDraft.trim() || draft.boundFolderPath || assetDirectory, { signal: controller.signal });
      if (!result.folderPath) {
        notify("info", "没有选择文件夹");
        return;
      }
      setFolderPathDraft(result.folderPath);
      await scanFolderPaths([...draft.boundFolders.map((item) => item.path), result.folderPath]);
    } catch (error) {
      if (error?.name === "AbortError") {
        notify("info", "已停止等待文件夹选择");
        return;
      }
      showError(error);
    } finally {
      if (backgroundFolderPickerAbortRef.current === controller) backgroundFolderPickerAbortRef.current = null;
      setPickingBackgroundFolder(false);
      setScanningFolder(false);
    }
  };

  const stopPickBackgroundFolder = () => {
    backgroundFolderPickerAbortRef.current?.abort();
  };

  const openProjectAssetFolder = async () => {
    try {
      const result = await api.openBackgroundAssetFolder();
      if (result.directory) setAssetDirectory(result.directory);
    } catch (error) {
      showError(error);
    }
  };

  const openBoundFolder = async () => {
    const targetPath = folderPathDraft.trim() || draft.boundFolderPath || assetDirectory;
    try {
      await api.openBackgroundFolder(targetPath);
    } catch (error) {
      showError(error);
    }
  };

  const openBackgroundPreview = (item) => {
    if (!item?.url) return;
    setPreviewingBackground(item);
  };

  const apply = async () => {
    setSaving(true);
    try {
      let next = normalizeBackgroundSettings(draft);
      if (pendingAsset && next.localUrl) {
        const dataUrl = await fileToDataUrlWithMessage(pendingAsset, "读取背景文件失败");
        const result = await api.uploadBackgroundAsset({ name: pendingAsset.name, type: pendingAsset.type, dataUrl });
        next = normalizeBackgroundSettings({
          ...next,
          localUrl: "",
          localType: "",
          localPlaylist: [],
          playlist: [],
          slideshowSource: "project",
          assetUrl: result.asset.url,
          assetType: result.asset.type,
          assetName: result.asset.name,
          boundFolders: [],
          boundFolderPath: ""
        });
        objectUrlRef.current = "";
        setPendingAsset(null);
      }
      if (next.mode === "slideshow" && next.localPlaylist.length > 0) {
        const uploaded = [];
        for (const item of next.localPlaylist) {
          if (!item.file) continue;
          const dataUrl = await fileToDataUrlWithMessage(item.file, "读取幻灯片文件失败");
          const result = await api.uploadBackgroundAsset({ name: item.name || item.file.name, type: item.type || item.file.type, dataUrl });
          uploaded.push({
            url: result.asset.url,
            type: result.asset.type,
            name: result.asset.name,
            size: result.asset.size
          });
        }
        if (uploaded.length > 0) {
          next = normalizeBackgroundSettings({
            ...next,
            localUrl: "",
            localType: "",
            localPlaylist: [],
            assetUrl: "",
            assetType: "",
            assetName: "",
            slideshowSource: "project",
            playlist: uploaded,
            boundFolders: [],
            boundFolderPath: ""
          });
        }
      }
      if (next.mode === "slideshow" && next.slideshowSource === "folder" && next.boundFolders.length > 0) {
        const result = await api.scanBackgroundFolders({
          folderPaths: next.boundFolders.map((item) => item.path),
          formats: next.slideshowFormats,
          includeSubfolders: next.includeSubfolders
        });
        next = normalizeBackgroundSettings({
          ...next,
          boundFolderPath: result.folderPath || next.boundFolderPath,
          boundFolders: normalizeBackgroundFolders(result.folders, result.folderPath),
          playlist: Array.isArray(result.items) ? result.items.map((item) => ({
            ...item,
            url: stripBackgroundPreviewToken(item.url)
          })) : next.playlist,
          folderPreviewToken: ""
        });
      }
      await onApply(next);
      onClose();
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    revokeDraftOnlyBackgroundObjectUrls(draft, value);
    objectUrlRef.current = "";
    setPendingAsset(null);
    setPreviewingBackground(null);
    onPreview?.(null);
    onClose();
  };

  const previewingIsVideo = isBackgroundVideoItem(previewingBackground);

  return (
    <>
      <Drawer width={520} title="工作区背景" visible={visible} footer={null} onCancel={cancel}>
        <WorkspaceDrawerShell
          footer={(
            <>
              <Button onClick={() => {
                revokeDraftOnlyBackgroundObjectUrls(draft, value);
                objectUrlRef.current = "";
                setPendingAsset(null);
                setCurrentPreviewIndex(0);
                setDraft(defaultBackgroundSettings);
              }}>恢复默认</Button>
              <Button type="primary" icon={<IconSave />} loading={saving} onClick={apply}>应用背景</Button>
            </>
          )}
        >
        <Tabs className="background-settings-tabs" defaultActiveTab="source">
          <TabPane key="source" title="背景源">
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Alert type="info" content="这里设置默认底色、媒体、幻灯片和背景作用范围。" />
          <div className="background-mode-grid">
            {[
              { key: "base", label: "默认底色", icon: <IconBgColors /> },
              { key: "media", label: "媒体", icon: <IconFileImage /> },
              { key: "slideshow", label: "幻灯片", icon: <IconHistory /> }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`background-mode ${draft.mode === item.key ? "active" : ""}`}
                onClick={() => patchDraft({ mode: item.key })}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        <div>
          <Text className="field-label">背景作用范围</Text>
          <div className="background-source-grid">
            {[
              { key: "viewport", label: "仅视窗", icon: <IconDashboard /> },
              { key: "page", label: "全网页", icon: <IconFile /> }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`background-source ${draft.backgroundScope === item.key ? "active" : ""}`}
                onClick={() => patchDraft({ backgroundScope: item.key })}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <Upload showUploadList={false} accept="image/*,video/*,.gif" beforeUpload={previewLocalFile}>
          <Button icon={<IconUpload />}>选择图片 / GIF / 视频</Button>
        </Upload>
        {draft.mode === "media" && (
          singlePreview?.url ? (
            <BackgroundPreviewCard title="媒体预览" item={singlePreview} onOpen={openBackgroundPreview} />
          ) : (
            <div className="background-preview-empty">
              <IconFileImage />
              <Text>还没有选择媒体；选择图片、GIF、视频或填写背景 URL 后会在这里预览。</Text>
            </div>
          )
        )}
        {draft.mode === "slideshow" && (
          <>
            <div>
              <Text className="field-label">幻灯片包含格式</Text>
              <Checkbox.Group
                className="format-check-grid"
                options={backgroundFormatOptions}
                value={draft.slideshowFormats}
                onChange={(slideshowFormats) => patchDraft({ slideshowFormats })}
              />
            </div>
            <div>
              <Text className="field-label">播放顺序</Text>
              <div className="background-source-grid">
                {[
                  { key: "sequence", label: "顺序播放", icon: <IconList /> },
                  { key: "random", label: "随机播放", icon: <IconBranch /> }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`background-source ${draft.slideshowOrder === item.key ? "active" : ""}`}
                    onClick={() => {
                      setCurrentPreviewIndex(0);
                      patchDraft({ slideshowOrder: item.key });
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Text className="field-label">幻灯片来源</Text>
              <div className="background-source-grid">
                {[
                  { key: "project", label: "项目背景库", icon: <IconStorage /> },
                  { key: "folder", label: "本地文件夹", icon: <IconFolder /> }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`background-source ${draft.slideshowSource === item.key ? "active" : ""}`}
                    onClick={() => patchDraft({ slideshowSource: item.key })}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {draft.slideshowSource === "project" && (
              <div className="background-source-panel">
                <div className="folder-path-line">
                  <Text className="field-label">默认项目背景文件夹</Text>
                  <Button size="small" icon={<IconFolder />} onClick={openProjectAssetFolder}>打开</Button>
                </div>
                <Text className="path-hint">{assetDirectory || "data/background-assets"}</Text>
                <Space wrap>
                  <Button icon={<IconRefresh />} loading={loadingAssets} onClick={loadProjectAssetsAsSlideshow}>从项目背景库载入</Button>
                  <Button icon={<IconFolder />} onClick={openProjectAssetFolder}>打开默认文件夹</Button>
                </Space>
                <Tag>{loadingAssets ? "正在读取项目背景库" : `项目背景库：${projectAssets.length} 个媒体`}</Tag>
              </div>
            )}
            {draft.slideshowSource === "folder" && (
              <div className="background-source-panel">
                <div className="folder-path-line">
                  <Text className="field-label">绑定本地文件夹路径</Text>
                  <Button size="small" icon={<IconFolder />} onClick={openBoundFolder}>打开</Button>
                </div>
                <Input
                  value={folderPathDraft}
                  onChange={setFolderPathDraft}
                  placeholder="例如 E:\\素材\\小说背景，填好后添加到绑定列表"
                />
                <div className="folder-picker-row">
                  <Checkbox checked={draft.includeSubfolders} onChange={changeIncludeSubfolders}>
                    包含子文件夹
                  </Checkbox>
                  <Space wrap>
                    <Button icon={<IconPlus />} loading={scanningFolder} onClick={addFolderPathDraft}>添加地址</Button>
                    <Button icon={<IconSearch />} loading={scanningFolder} onClick={scanBoundFolder}>扫描全部</Button>
                    <Button
                      icon={pickingBackgroundFolder ? <IconRecordStop /> : <IconFolder />}
                      status={pickingBackgroundFolder ? "warning" : undefined}
                      loading={scanningFolder && !pickingBackgroundFolder}
                      onClick={pickingBackgroundFolder ? stopPickBackgroundFolder : pickAndBindFolder}
                    >
                      {pickingBackgroundFolder ? "停止等待" : "选择文件夹"}
                    </Button>
                    <Tooltip content="浏览器不能长期保存真实文件夹路径；这里用于临时选择并复制到项目背景库。">
                      <Button icon={<IconUpload />} onClick={() => folderInputRef.current?.click()}>导入到项目库</Button>
                    </Tooltip>
                  </Space>
                  <input
                    ref={folderInputRef}
                    className="hidden-file-input"
                    type="file"
                    multiple
                    webkitdirectory="true"
                    directory="true"
                    onChange={pickFolder}
                  />
                </div>
                <div className="bound-folder-list">
                  {draft.boundFolders.length === 0 && <Tag>尚未绑定本地文件夹</Tag>}
                  {draft.boundFolders.map((folder) => (
                    <div className="bound-folder-row" key={folder.path}>
                      <div>
                        <Text className="bound-folder-name">{folder.name}</Text>
                        <Text className="path-hint">{folder.path}</Text>
                      </div>
                      <Space>
                        <Tag>{folder.count || 0} 个</Tag>
                        <Button size="mini" icon={<IconFolder />} onClick={() => api.openBackgroundFolder(folder.path).catch(showError)} />
                        <Button size="mini" status="danger" icon={<IconDelete />} onClick={() => removeBoundFolder(folder.path)} />
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {draft.mode === "slideshow" && (
          currentPreview?.url ? (
            <BackgroundPreviewCard
              title="当前预览"
              item={currentPreview}
              indexText={`${currentPreviewIndex + 1} / ${previewItems.length}`}
              onOpen={openBackgroundPreview}
              actions={(
                <>
                  <Button size="mini" icon={<IconUndo />} onClick={() => setCurrentPreviewIndex((index) => Math.max(0, index - 1))} />
                  <Button size="mini" icon={<IconPlayArrow />} onClick={() => setCurrentPreviewIndex((index) => (index + 1) % previewItems.length)} />
                </>
              )}
            />
          ) : (
            <div className="background-preview-empty">
              <IconHistory />
              <Text>还没有可轮播的媒体；载入项目背景库、绑定本地文件夹或填写多行 URL 后会显示当前预览。</Text>
            </div>
          )
        )}
        <div>
          <Text className="field-label">背景 URL</Text>
          <TextArea
            value={draft.urlsText}
            onChange={(urlsText) => {
              const patch = { urlsText, localUrl: "", localType: "", localPlaylist: [] };
              if (urlsText.trim()) {
                patch.assetUrl = "";
                patch.assetType = "";
                patch.assetName = "";
                patch.playlist = [];
                setPendingAsset(null);
              }
              patchDraft(patch);
            }}
            autoSize={{ minRows: 5, maxRows: 10 }}
            placeholder="媒体模式用第一行；幻灯片模式会按行轮播。支持图片、GIF、视频 URL。"
          />
        </div>
        <div className="form-grid two">
          <label className="compact-field">
            <Text className="field-label">遮罩强度</Text>
            <InputNumber min={18} max={92} value={draft.overlay} onChange={(overlay) => patchDraft({ overlay })} />
          </label>
          <label className="compact-field">
            <Text className="field-label">背景模糊</Text>
            <InputNumber min={0} max={12} value={draft.blur} onChange={(blur) => patchDraft({ blur })} />
          </label>
          <label className="compact-field">
            <Text className="field-label">轮播秒数</Text>
            <InputNumber min={4} max={60} value={draft.interval} onChange={(interval) => patchDraft({ interval })} />
          </label>
        </div>
            </Space>
          </TabPane>
          <TabPane key="particles" title="粒子效果">
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <Tabs className="particle-layer-tabs" size="small" defaultActiveTab="back">
                <TabPane key="back" title="后景粒子">
                  <ParticleLayerEditor
                    layerKey="back"
                    layer={normalizedDraft.particleLayers.back}
                    count={particleCountPreview.back}
                    onPatch={patchParticleLayer}
                  />
                </TabPane>
                <TabPane key="front" title="前景粒子">
                  <ParticleLayerEditor
                    layerKey="front"
                    layer={normalizedDraft.particleLayers.front}
                    count={particleCountPreview.front}
                    onPatch={patchParticleLayer}
                  />
                </TabPane>
              </Tabs>
            </Space>
          </TabPane>
          <TabPane key="surface" title="前景材质">
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <div>
          <Text className="field-label">前景模块材质</Text>
          <div className="surface-mode-grid">
            {[
              { key: "solid", label: "实体" },
              { key: "mica", label: "云母片" },
              { key: "frosted", label: "磨砂" },
              { key: "acrylic", label: "亚克力" }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`surface-mode ${draft.surfaceMaterial === item.key ? "active" : ""}`}
                onClick={() => patchDraft({ surfaceMaterial: item.key })}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="surface-control-grid">
          <div className="surface-control">
            <div className="surface-control-head">
              <Text className="field-label">前景透明度</Text>
              <InputNumber min={0} max={100} value={activeSurfaceProfile.opacity} onChange={(opacity) => patchActiveSurfaceProfile({ opacity })} />
            </div>
            <Slider min={0} max={100} value={activeSurfaceProfile.opacity} onChange={(opacity) => patchActiveSurfaceProfile({ opacity })} />
          </div>
          <div className="surface-control">
            <div className="surface-control-head">
              <Text className="field-label">前景磨砂</Text>
              <InputNumber min={0} max={48} value={activeSurfaceProfile.blur} onChange={(blur) => patchActiveSurfaceProfile({ blur })} />
            </div>
            <Slider min={0} max={48} value={activeSurfaceProfile.blur} onChange={(blur) => patchActiveSurfaceProfile({ blur })} />
          </div>
          <div className="surface-control">
            <div className="surface-control-head">
              <Text className="field-label">材质染色</Text>
              <InputNumber min={0} max={48} value={activeSurfaceProfile.tint} onChange={(tint) => patchActiveSurfaceProfile({ tint })} />
            </div>
            <Slider min={0} max={48} value={activeSurfaceProfile.tint} onChange={(tint) => patchActiveSurfaceProfile({ tint })} />
          </div>
          <div className="surface-control">
            <div className="surface-control-head">
              <Text className="field-label">材质饱和</Text>
              <InputNumber min={80} max={220} value={activeSurfaceProfile.saturation} onChange={(saturation) => patchActiveSurfaceProfile({ saturation })} />
            </div>
            <Slider min={80} max={220} value={activeSurfaceProfile.saturation} onChange={(saturation) => patchActiveSurfaceProfile({ saturation })} />
          </div>
        </div>
            </Space>
          </TabPane>
        </Tabs>
        </WorkspaceDrawerShell>
      </Drawer>
      <Modal
        title={previewingBackground?.name || "背景预览"}
        visible={Boolean(previewingBackground?.url)}
        className="background-preview-modal"
        footer={null}
        onCancel={() => setPreviewingBackground(null)}
        unmountOnExit
      >
        <div className="background-preview-full">
          {previewingIsVideo ? (
            <video src={previewingBackground?.url} controls autoPlay muted loop playsInline />
          ) : (
            <img src={previewingBackground?.url} alt={previewingBackground?.name || "背景预览"} />
          )}
        </div>
      </Modal>
    </>
  );
}

function AiSettingFields({ providers, prefix }) {
  return (
    <div className="ai-setting-grid">
      {Object.entries(roleLabels).map(([key, label]) => (
        <Card key={key} className="slot-card" bordered={false}>
          <PanelTitle
            icon={<IconRobot />}
            title={label}
            extra={<Tag color={roleColors[key]}>{key}</Tag>}
          />
          <FormItem field={`${prefix}.${key}.providerId`} label="提供商">
            <Select allowClear placeholder="选择提供商">
              {providers.map((provider) => (
                <Option key={provider.id} value={provider.id}>{provider.name}</Option>
              ))}
            </Select>
          </FormItem>
          <FormItem shouldUpdate noStyle>
            {(values) => {
              const providerId = values?.[prefix]?.[key]?.providerId;
              return (
                <FormItem field={`${prefix}.${key}.model`} label="模型">
                  <Select allowCreate allowClear showSearch placeholder="选择或输入模型">
                    {modelOptions(providers, providerId).map((model) => (
                      <Option key={model} value={model}>{model}</Option>
                    ))}
                  </Select>
                </FormItem>
              );
            }}
          </FormItem>
          <FormItem field={`${prefix}.${key}.temperature`} label="温度">
            <InputNumber min={0} max={2} step={0.05} />
          </FormItem>
        </Card>
      ))}
    </div>
  );
}

function App() {
  const [page, navigate] = useHashPage();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [createVisible, setCreateVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => readLocalStorage(SIDEBAR_STORAGE_KEY, "1") !== "0");
  const [backgroundVisible, setBackgroundVisible] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState(defaultBackgroundSettings);
  const [backgroundPreviewSettings, setBackgroundPreviewSettings] = useState(null);
  const [slideIndex, setSlideIndex] = useState(0);

  const activeNovel = useMemo(() => {
    const novels = safeArray(state?.novels);
    return novels.find((item) => item.id === state?.activeNovelId) || novels[0] || null;
  }, [state]);

  const currentPage = pageItems.find((item) => item.key === page) || pageItems[1];
  const effectiveBackgroundSettings = backgroundPreviewSettings || backgroundSettings;
  const effectiveBackground = useMemo(() => normalizeBackgroundSettings(effectiveBackgroundSettings), [effectiveBackgroundSettings]);
  const surfaceOpacityRatio = Math.min(1, Math.max(0, (effectiveBackground.surfaceOpacity ?? 86) / 100));
  const surfaceAlpha = Math.pow(surfaceOpacityRatio, 1.35);
  const surfaceTintRatio = Math.min(0.54, Math.max(0, (effectiveBackground.surfaceTint || 0) / 92)) * surfaceOpacityRatio;
  const surfaceSheen = Math.min(0.46, Math.max(0, (effectiveBackground.surfaceTint || 0) / 84)) * surfaceOpacityRatio;
  const surfaceLineAlpha = Math.min(0.52, surfaceOpacityRatio * (0.06 + (effectiveBackground.surfaceTint || 0) / 128));
  const surfaceShadowAlpha = Math.min(0.32, surfaceOpacityRatio * (0.04 + (effectiveBackground.surfaceBlur || 0) / 210));
  const surfaceMaterial = effectiveBackground.surfaceMaterial;
  const surfaceBoost = {
    "--surface-mica-tint-boost": surfaceMaterial === "mica" ? surfaceOpacityRatio * 0.10 : 0,
    "--surface-frost-sheen-boost": surfaceMaterial === "frosted" ? surfaceOpacityRatio * 0.16 : 0,
    "--surface-frost-tint-boost": surfaceMaterial === "frosted" ? surfaceOpacityRatio * 0.06 : 0,
    "--surface-frost-line-boost": surfaceMaterial === "frosted" ? surfaceOpacityRatio * 0.22 : 0,
    "--surface-frost-shadow-boost": surfaceMaterial === "frosted" ? surfaceOpacityRatio * 0.06 : 0,
    "--surface-frost-inner-boost": surfaceMaterial === "frosted" ? surfaceOpacityRatio * 0.34 : 0,
    "--surface-acrylic-sheen-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.12 : 0,
    "--surface-acrylic-tint-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.22 : 0,
    "--surface-acrylic-warm-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.16 : 0,
    "--surface-acrylic-line-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.28 : 0,
    "--surface-acrylic-shadow-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.10 : 0,
    "--surface-acrylic-inner-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.42 : 0,
    "--surface-acrylic-inset-tint-boost": surfaceMaterial === "acrylic" ? surfaceOpacityRatio * 0.08 : 0
  };
  const surfaceVars = {
    "--surface-alpha": surfaceAlpha,
    "--surface-blur": `${effectiveBackground.surfaceBlur}px`,
    "--surface-tint": surfaceTintRatio,
    "--surface-saturation": `${effectiveBackground.surfaceProfiles?.[effectiveBackground.surfaceMaterial]?.saturation || 118}%`,
    "--surface-sheen": surfaceSheen,
    "--surface-line-alpha": surfaceLineAlpha,
    "--surface-shadow-alpha": surfaceShadowAlpha,
    "--surface-contrast": `${Math.min(1.34, Math.max(1, 1 + (effectiveBackground.surfaceTint || 0) / 150))}`,
    ...surfaceBoost
  };

  const loadState = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api.getState();
      setState(result.state);
      setBackgroundSettings(normalizeBackgroundSettings(result.state?.backgroundSettings));
    } catch (error) {
      showError(error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadInitialState = async () => {
    setLoading(true);
    try {
      const shell = await api.getStateShell();
      setState(shell.state);
      setBackgroundSettings(normalizeBackgroundSettings(shell.state?.backgroundSettings));
      setLoading(false);
      window.setTimeout(() => {
        api.getState()
          .then((result) => {
            setState(result.state);
            setBackgroundSettings(normalizeBackgroundSettings(result.state?.backgroundSettings));
          })
          .catch(() => {
            // 首屏壳已经可用，完整状态补齐失败时不打断用户当前阅读和输入。
          });
      }, 900);
    } catch (error) {
      await loadState(false);
    }
  };

  useEffect(() => {
    loadInitialState();
    const heartbeat = window.setInterval(() => {
      api.heartbeat().catch(() => {});
    }, 8000);
    return () => window.clearInterval(heartbeat);
  }, []);

  useEffect(() => {
    // 小窗口先把主会话区交给用户，侧栏仍可用顶部按钮临时打开，避免打开页面时首屏被导航挤走。
    const collapseWhenNarrow = () => {
      if (typeof window !== "undefined" && window.innerWidth <= 900) {
        setSidebarOpen(false);
      }
    };
    collapseWhenNarrow();
    window.addEventListener("resize", collapseWhenNarrow);
    return () => window.removeEventListener("resize", collapseWhenNarrow);
  }, []);

  useEffect(() => {
    writeLocalStorage(SIDEBAR_STORAGE_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    const normalized = normalizeBackgroundSettings(effectiveBackgroundSettings);
    const items = activeBackgroundItems(normalized);
    if (normalized.mode !== "slideshow" || items.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setSlideIndex((index) => index + 1);
    }, normalized.interval * 1000);
    return () => window.clearInterval(timer);
  }, [effectiveBackgroundSettings]);

  const applyBackground = async (settings, successText = "背景配置已保存") => {
    const next = normalizeBackgroundSettings(settings);
    setBackgroundPreviewSettings(null);
    setBackgroundSettings((previous) => {
      revokeStaleBackgroundObjectUrls(previous, next);
      return next;
    });
    const result = await api.saveBackgroundSettings(persistBackgroundSettings(next));
    if (result?.state) setState(result.state);
    if (result?.backgroundSettings) setBackgroundSettings(normalizeBackgroundSettings(result.backgroundSettings));
    setSlideIndex(0);
    notify("success", successText);
  };

  const closeBackgroundDrawer = () => {
    setBackgroundPreviewSettings(null);
    setBackgroundVisible(false);
  };

  const commit = async (key, task, successText) => {
    setBusy(key);
    try {
      const result = await task();
      if (result?.state) {
        setState(result.state);
      } else if (Array.isArray(result?.providers)) {
        setState((previous) => previous ? { ...previous, providers: result.providers } : previous);
      } else if (result?.provider) {
        setState((previous) => {
          if (!previous) return previous;
          const providers = safeArray(previous.providers);
          const exists = providers.some((provider) => provider.id === result.provider.id);
          return {
            ...previous,
            providers: exists
              ? providers.map((provider) => provider.id === result.provider.id ? result.provider : provider)
              : [...providers, result.provider]
          };
        });
      }
      if (successText) notify("success", successText);
      return result;
    } catch (error) {
      showError(error);
      return null;
    } finally {
      setBusy("");
    }
  };

  const selectNovel = (id) => commit("select-novel", () => api.selectNovel(id), "已打开小说");
  const createNovel = (values) => commit("create-novel", () => api.createNovel(values.title), "已创建小说").then((result) => {
    if (result) {
      setCreateVisible(false);
      navigate("planning");
    }
  });

  const deleteNovel = (id) => commit(`delete-${id}`, () => api.deleteNovel(id), "已删除小说");

  const pageProps = {
    state,
    setState,
    activeNovel,
    providers: safeArray(state?.providers),
    busy,
    commit,
    refresh: () => loadState(true),
    navigate,
    currentPageLabel: currentPage.label,
    sidebarOpen,
    setSidebarOpen,
    openBackground: () => setBackgroundVisible(true),
    appLoading: loading,
    surfaceVars
  };

  return (
    <ConfigProvider getPopupContainer={popupToBody}>
    <Layout
      className={`studio-root surface-${effectiveBackground.surfaceMaterial} background-scope-${effectiveBackground.backgroundScope} ${sidebarOpen ? "" : "sidebar-closed"}`}
      style={surfaceVars}
    >
      <BackgroundStage settings={effectiveBackground} slideIndex={slideIndex} />
      <ForegroundParticleLayer settings={effectiveBackground} />
      {sidebarOpen && (
      <Sider className="studio-sider" width={286}>
        <div className="brand-panel">
          <div className="brand-mark"><IconMindMapping /></div>
          <div>
            <div className="brand-title">Roleplay Novel Studio</div>
            <div className="brand-subtitle">Agent 编剧控制台</div>
          </div>
        </div>
        <Button className="create-button" type="primary" icon={<IconPlus />} long onClick={() => setCreateVisible(true)}>
          新建小说
        </Button>
        <div className="studio-nav-scroll">
          <div className="rail-section rail-section-global">
            <div className="rail-caption">全局</div>
            <Menu className="studio-menu studio-menu-global" selectedKeys={[page]} onClickMenuItem={navigate}>
              {globalPageItems.map((item) => (
                <Menu.Item key={item.key}>{item.icon}{item.label}</Menu.Item>
              ))}
            </Menu>
          </div>

          <div className="book-workspace-nav">
            <div className="book-workspace-head">
              <div>
                <div className="rail-caption">当前小说工作区</div>
                <div className="book-workspace-hint">以下资料只属于当前这本书</div>
              </div>
              <IconFolder />
            </div>
            <div className="novel-switcher">
              {safeArray(state?.novels).length === 0 ? (
                <Empty description="暂无小说" />
              ) : (
                safeArray(state?.novels).map((novel) => (
                  <button
                    key={novel.id}
                    className={`novel-chip ${activeNovel?.id === novel.id ? "active" : ""}`}
                    onClick={() => selectNovel(novel.id)}
                  >
                    <span className="novel-chip-title">{novel.title}</span>
                    <span className="novel-chip-meta">
                      {safeArray(novel.archives?.characters).length || safeArray(novel.characters).length} 档案角色 · {safeArray(novel.lorebook?.entries).length} 世界书 · {safeArray(novel.memory?.items).length} 记忆
                    </span>
                  </button>
                ))
              )}
            </div>
            <Menu className="studio-menu studio-menu-workspace" selectedKeys={[page]} onClickMenuItem={navigate}>
              {bookWorkspaceItems.map((item) => (
                <Menu.Item key={item.key}>{item.icon}{item.label}</Menu.Item>
              ))}
            </Menu>
          </div>

          <div className="rail-section rail-section-system">
            <div className="rail-caption">系统与外观</div>
            <Menu className="studio-menu studio-menu-system" selectedKeys={[page]} onClickMenuItem={navigate}>
              {systemPageItems.map((item) => (
                <Menu.Item key={item.key}>{item.icon}{item.label}</Menu.Item>
              ))}
            </Menu>
            <Button className="studio-nav-action" icon={<IconBgColors />} onClick={() => setBackgroundVisible(true)} long>背景</Button>
          </div>
        </div>
      </Sider>
      )}
      <button
        type="button"
        className={`sidebar-edge-toggle ${sidebarOpen ? "is-open" : "is-closed"}`}
        aria-label={sidebarOpen ? "收起侧栏" : "打开侧栏"}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? "收起侧栏" : "打开侧栏"}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        {sidebarOpen ? <IconMenuFold /> : <IconMenuUnfold />}
      </button>

      <Layout className={`studio-main ${page === "planning" ? "studio-main-planning" : ""}`}>
        <Header className="studio-header">
          <PageHeader
            title={currentPage.label}
            subTitle={activeNovel ? activeNovel.title : loading ? "正在载入当前小说" : "未选择小说"}
            extra={(
              <Space>
                <Button icon={<IconBgColors />} onClick={() => setBackgroundVisible(true)}>背景</Button>
                <Button icon={<IconRefresh />} onClick={() => loadState(true)} loading={loading}>刷新</Button>
                {activeNovel && <Tag color="green">更新 {formatDate(activeNovel.updatedAt)}</Tag>}
              </Space>
            )}
          />
        </Header>
        <Content className={`studio-content ${page === "planning" ? "studio-content-planning" : ""}`}>
          {loading ? (
            <div className="loading-stage"><Spin dot tip="正在载入工作台状态" /></div>
          ) : (
            <>
              {page === "library" && <LibraryPage {...pageProps} onCreate={() => setCreateVisible(true)} onSelect={selectNovel} onDelete={deleteNovel} />}
              {page === "planning" && <PlanningPage {...pageProps} />}
              {page === "archives" && <ArchivesPage {...pageProps} />}
              {page === "lorebook" && <LorebookPage {...pageProps} />}
              {page === "memory" && <MemoryPage {...pageProps} />}
              {page === "roleplay" && <RoleplayPage {...pageProps} />}
              {page === "writing" && <WritingPage {...pageProps} />}
              {page === "agentSettings" && <AgentSettingsPage {...pageProps} />}
              {page === "providers" && <ProvidersPage {...pageProps} />}
            </>
          )}
        </Content>
      </Layout>

      <Modal
        title="新建小说"
        visible={createVisible}
        footer={null}
        onCancel={() => setCreateVisible(false)}
      >
        <Form layout="vertical" onSubmit={createNovel}>
          <FormItem field="title" label="小说名称" rules={[{ required: true, message: "请输入小说名称" }]}>
            <Input placeholder="例如：微不足道的妄想" />
          </FormItem>
          <Button type="primary" htmlType="submit" icon={<IconPlus />} loading={busy === "create-novel"} long>
            创建并打开
          </Button>
        </Form>
      </Modal>

      <BackgroundSettingsDrawer
        visible={backgroundVisible}
        value={backgroundSettings}
        onPreview={setBackgroundPreviewSettings}
        onApply={applyBackground}
        onClose={closeBackgroundDrawer}
      />
    </Layout>
    </ConfigProvider>
  );
}

function LibraryPage({ state, activeNovel, onCreate, onSelect, onDelete, busy }) {
  const novels = safeArray(state?.novels);
  return (
    <div className="page-grid library-layout">
      <section className="page-primary">
        <div className="page-kicker">Novel Workspace</div>
        <Title heading={3}>小说项目库</Title>
        <Paragraph type="secondary">这里是项目入口，只承载创建、打开和删除。具体策划、档案、RAG、扮演与行文进入对应页面处理。</Paragraph>
        <div className="novel-card-grid">
          {novels.map((novel) => (
            <Card key={novel.id} className={`novel-card ${novel.id === activeNovel?.id ? "active" : ""}`} bordered={false}>
              <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Space align="center" className="between">
                  <Title heading={5}>{novel.title}</Title>
                  <Badge status={novel.id === activeNovel?.id ? "processing" : "default"} text={novel.id === activeNovel?.id ? "当前" : "可打开"} />
                </Space>
                <div className="mini-metrics">
                  <MetricCard title="角色" value={safeArray(novel.characters).length} icon={<IconUser />} />
                  <MetricCard title="世界书" value={safeArray(novel.lorebook?.entries).length} icon={<IconBook />} />
                  <MetricCard title="扮演轮次" value={safeArray(novel.session?.turns).length} icon={<IconThunderbolt />} />
                </div>
                <Text type="secondary">更新于 {formatDate(novel.updatedAt)}</Text>
                <Space>
                  <Button type="primary" icon={<IconDashboard />} onClick={() => onSelect(novel.id)} loading={busy === "select-novel"}>打开</Button>
                  <Popconfirm title="删除后不可恢复，确认删除这本小说？" onOk={() => onDelete(novel.id)}>
                    <Button status="danger" icon={<IconDelete />} loading={busy === `delete-${novel.id}`}>删除</Button>
                  </Popconfirm>
                </Space>
              </Space>
            </Card>
          ))}
          {novels.length === 0 && (
            <Card className="novel-card empty-card" bordered={false}>
              <Empty description="还没有小说项目" />
            </Card>
          )}
        </div>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconPlus />} title="创建入口" />
          <Paragraph>新小说创建后会直接进入策划 Agent 会话，由 Agent 在对话流里提取角色卡、背景、大纲、世界书和记忆线索。</Paragraph>
          <Button type="primary" icon={<IconPlus />} onClick={onCreate} long>新建小说</Button>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSafe />} title="设计边界" />
          <ul className="plain-list">
            <li>项目库不承载复杂配置。</li>
            <li>打开小说后默认进入策划 Agent。</li>
            <li>删除是危险操作，必须二次确认。</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function buildPlanningRunTranscriptSkeleton(run, runId) {
  const source = run && typeof run === "object" ? run : {};
  const id = String(source.id || runId || "");
  const counts = source.counts && typeof source.counts === "object" ? source.counts : {};
  return {
    id: `transcript_${id}_summary`,
    runId: id,
    status: source.status || "running",
    phase: source.phase || source.status || "running",
    branchId: source.branchId || "main",
    userMessagePreview: source.userMessagePreview || "",
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || "",
    finishedAt: source.finishedAt || "",
    counts: {
      events: Number(counts.events || safeArray(source.events).length || 0),
      items: Number(counts.items || safeArray(source.items).length || 0),
      diagnostics: Number(counts.diagnostics || safeArray(source.diagnostics).length || 0),
      checkpoints: Number(counts.checkpoints || safeArray(source.checkpoints).length || 0),
      approvals: Number(counts.approvals || safeArray(source.approvals).length || 0)
    },
    events: safeArray(source.events),
    items: safeArray(source.items),
    diagnostics: safeArray(source.diagnostics),
    checkpoints: safeArray(source.checkpoints),
    approvals: safeArray(source.approvals),
    evidencePlan: source.evidencePlan || null,
    budget: source.budget || null,
    markdown: "",
    loadingSummary: true
  };
}

function PlanningPage({ activeNovel, providers, busy, commit, setState, refresh, currentPageLabel, sidebarOpen, setSidebarOpen, openBackground, appLoading, surfaceVars }) {
  const [input, setInput] = useState("");
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const [originalMessage, setOriginalMessage] = useState("");
  const [forkDraft, setForkDraft] = useState(null);
  const [messageEditDraft, setMessageEditDraft] = useState(null);
  const [queuedDraft, setQueuedDraft] = useState("");
  const [queuedCommand, setQueuedCommand] = useState(null);
  const [approvalScope, setApprovalScope] = useState("session");
  const [agentMode, setAgentMode] = useState("auto");
  const [permissionModeDraft, setPermissionModeDraft] = useState("");
  const [agentGoal, setAgentGoal] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [goalEditing, setGoalEditing] = useState(false);
  const [mentionRefs, setMentionRefs] = useState([]);
  const [droppedFiles, setDroppedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [contextDrawerVisible, setContextDrawerVisible] = useState(false);
  const [versionDrawerVisible, setVersionDrawerVisible] = useState(false);
  const [threadDrawerVisible, setThreadDrawerVisible] = useState(false);
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(false);
  const [modelDrawerVisible, setModelDrawerVisible] = useState(false);
  const [fileDrawerVisible, setFileDrawerVisible] = useState(false);
  const [doctorDrawerVisible, setDoctorDrawerVisible] = useState(false);
  const [doctorReport, setDoctorReport] = useState(null);
  const [transcriptDrawerVisible, setTranscriptDrawerVisible] = useState(false);
  const [runTranscript, setRunTranscript] = useState(null);
  const [runTranscriptLoadingId, setRunTranscriptLoadingId] = useState("");
  const [runTranscriptError, setRunTranscriptError] = useState("");
  const [runTranscriptSlow, setRunTranscriptSlow] = useState(false);
  const [drawerCollapseResetKey, setDrawerCollapseResetKey] = useState(0);
  const [sessionModal, setSessionModal] = useState({ type: "", branch: null, label: "" });
  const [sessionBusy, setSessionBusy] = useState({});
  const [revertModal, setRevertModal] = useState({ type: "", runId: "", checkpointId: "" });
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadMessagePage, setThreadMessagePage] = useState({ total: 0, hasMore: false, beforeId: "" });
  const [branchMessageCache, setBranchMessageCache] = useState({});
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [liveRunStreams, setLiveRunStreams] = useState({});
  const threadBodyRef = useRef(null);
  const agentShellRef = useRef(null);
  const agentThreadRef = useRef(null);
  const messageEndRef = useRef(null);
  const composerInputRef = useRef(null);
  const messageScrollRestoreRef = useRef(null);
  const messageNovelRef = useRef("");
  const pollTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const inputDraftRef = useRef("");
  const queuedDraftRef = useRef("");
  const queuedDraftPayloadRef = useRef(null);
  const queuedCommandRef = useRef(null);
  const dragDepthRef = useRef(0);
  const rehydratedRunRef = useRef("");

  const serverMessages = safeArray(activeNovel?.planning?.messages);
  const messages = threadMessages.length || serverMessages.length ? threadMessages : serverMessages;
  const totalMessageCount = Number(threadMessagePage.total || messages.length || 0);
  const hiddenMessageCount = Math.max(0, totalMessageCount - messages.length);
  const hasOlderMessages = Boolean(threadMessagePage.hasMore && hiddenMessageCount > 0 && messages.length > 0);
  const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
  const runHistory = safeArray(activeNovel?.planning?.runs).slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const branchState = activeNovel?.planning?.branchState || { activeBranchId: activeNovel?.planning?.activeBranchId, branches: activeNovel?.planning?.branches };
  const planningBranches = safeArray(branchState.branches?.length ? branchState.branches : activeNovel?.planning?.branches);
  const activeBranchId = normalizeClientPlanningBranchId(activeNovel?.planning?.activeBranchId || "main");
  const activeBranchIdRef = useRef(activeBranchId);
  const activeBranchSummary = planningBranches.find((branch) => branch.id === activeBranchId) || null;
  const branchScopedRuns = useMemo(
    () => runHistory.filter((run) => normalizeClientPlanningBranchId(run.branchId || "main") === activeBranchId),
    [runHistory, activeBranchId]
  );
  const currentRunServerSnapshot = useMemo(
    () => currentRun?.id ? runHistory.find((run) => run.id === currentRun.id) || null : null,
    [runHistory, currentRun?.id]
  );
  const effectiveCurrentRun = useMemo(
    () => currentRunServerSnapshot ? mergePlanningRunSnapshots(currentRun, currentRunServerSnapshot) : currentRun,
    [currentRun, currentRunServerSnapshot]
  );
  const runById = useMemo(() => {
    const map = new Map(runHistory.map((run) => [run.id, run]));
    if (effectiveCurrentRun?.id) map.set(effectiveCurrentRun.id, effectiveCurrentRun);
    return map;
  }, [runHistory, effectiveCurrentRun]);
  const currentRunBranchId = normalizeClientPlanningBranchId(effectiveCurrentRun?.branchId || "main");
  const currentRunNovelMatches = Boolean(effectiveCurrentRun?.id && (!effectiveCurrentRun.novelId || effectiveCurrentRun.novelId === activeNovel?.id));
  const currentRunIsFreshLocal = Boolean(effectiveCurrentRun?.clientOptimistic && !isPlanningRunDisplayTerminal(effectiveCurrentRun));
  const currentRunBelongsToActiveBranch = Boolean(effectiveCurrentRun?.id && currentRunNovelMatches && (currentRunBranchId === activeBranchId || currentRunIsFreshLocal));
  const visibleCurrentRun = currentRunBelongsToActiveBranch ? effectiveCurrentRun : null;
  const hasAssistantMessageForRun = (runId) => Boolean(runId && messages.some((message) => message.role === "assistant" && message.runId === runId));
  const currentRunHasAssistantMessage = hasAssistantMessageForRun(visibleCurrentRun?.id);
  const activeHistoryRun = branchScopedRuns.find((run) => !isPlanningRunDisplayTerminal(run) && run.id !== visibleCurrentRun?.id && !hasAssistantMessageForRun(run.id)) || null;
  const currentRunIsTerminal = visibleCurrentRun ? isPlanningRunDisplayTerminal(visibleCurrentRun) : false;
  const liveRun = visibleCurrentRun && !currentRunIsTerminal && !currentRunHasAssistantMessage ? visibleCurrentRun : currentRunIsTerminal ? null : activeHistoryRun;
  // Codex 类会话里，assistant 消息是主结果；run 只在“还没有结果消息”时作为占位。
  // 如果回复已经落进消息流，过程应挂在该消息下方，不能再额外渲染一个独立运行块，
  // 否则 completed + awaiting_user 会看起来像还在“已处理 / 正在思考”。
  const displayRun = liveRun || (visibleCurrentRun && !currentRunHasAssistantMessage && isPlanningRunDisplayTerminal(visibleCurrentRun) ? visibleCurrentRun : null);
  const pendingApprovalEntry = (() => {
    const seen = new Set();
    const candidates = [liveRun, visibleCurrentRun, ...branchScopedRuns].filter(Boolean).filter((run) => {
      if (!run?.id || seen.has(run.id)) return false;
      seen.add(run.id);
      return true;
    });
    for (const candidate of candidates) {
      const approval = safeArray(candidate.approvals).find((item) => item.status === "pending");
      if (approval) return { run: candidate, approval };
    }
    return null;
  })();
  const latestTaskMessage = [...messages].reverse().find((message) => message.role === "assistant" || message.role === "user") || null;
  const canRestoreCurrentTask = !liveRun && Boolean(latestTaskMessage || Number(activeBranchSummary?.messageCount || 0) > 0 || branchScopedRuns.some((run) => run.messageId || run.userMessagePreview));
  const latestAuditableRun = branchScopedRuns.find((run) => planningRunCount(run, "items") > 0 || planningRunCount(run, "events") > 0) || null;
  const commandQuery = getPlanningCommandQuery(input);
  const mentionQuery = commandQuery === null ? getPlanningMentionQuery(input) : null;
  const commandItems = filterPlannerSlashCommands(commandQuery || "");
  const mentionCandidates = useMemo(() => buildPlanningMentionCandidates(activeNovel, mentionQuery || ""), [activeNovel, mentionQuery]);
  const toolSettings = normalizeAgentToolSettingsForClient(activeNovel?.planning?.agentToolSettings);
  const runningSubAgents = safeArray(activeNovel?.planning?.subAgentSessions).filter((session) => session.status === "running").length;
  const statusLineItems = [
    `上下文 ${messages.length}/${totalMessageCount || messages.length} 条`,
    runningSubAgents ? `后台 ${runningSubAgents}` : ""
  ].filter(Boolean);
  const visiblePermissionMode = permissionModeDraft || activeNovel?.planning?.agentPermissionMode || "ask_high_risk";
  const composerHasContent = Boolean(input.trim() || droppedFiles.length > 0);
  const queuedDraftPayload = queuedDraft ? queuedDraftPayloadRef.current : null;

  useEffect(() => {
    activeBranchIdRef.current = activeBranchId;
  }, [activeBranchId]);

  useEffect(() => {
    inputDraftRef.current = input;
  }, [input]);

  useEffect(() => {
    if (!activeNovel?.id) return;
    const page = activeNovel.planning?.messagePage || {};
    const messageScopeKey = `${activeNovel.id}:${activeBranchId}`;
    if (messageNovelRef.current !== messageScopeKey) {
      messageNovelRef.current = messageScopeKey;
      setThreadMessages(serverMessages);
    } else {
      const serverTotal = Number(page.total || serverMessages.length || 0);
      setThreadMessages((previous) => {
        const hasOptimisticMessage = previous.some((message) => message.clientOptimistic);
        if (serverTotal < previous.length && !hasOptimisticMessage) return serverMessages;
        return mergePlanningMessagesWithPendingEdit(previous, serverMessages, { branchId: activeBranchId });
      });
    }
    setThreadMessagePage({
      total: Number(page.total || serverMessages.length || 0),
      hasMore: Boolean(page.hasMore),
      beforeId: String(page.beforeId || page.nextBeforeId || serverMessages[0]?.id || "")
    });
  }, [activeNovel?.id, activeBranchId, activeNovel?.planning?.messagePage, activeNovel?.planning?.messages]);

  const latestMessageId = messages[messages.length - 1]?.id || "";

  useEffect(() => {
    if (!activeNovel?.id || !activeBranchId || messages.length === 0) return;
    const cacheKey = `${activeNovel.id}:${activeBranchId}`;
    setBranchMessageCache((previous) => {
      const current = previous[cacheKey];
      if (
        current?.latestMessageId === latestMessageId &&
        current?.messages?.length === messages.length &&
        current?.page?.total === threadMessagePage.total &&
        current?.page?.hasMore === threadMessagePage.hasMore
      ) {
        return previous;
      }
      return {
        ...previous,
        [cacheKey]: {
          messages,
          page: threadMessagePage,
          latestMessageId
        }
      };
    });
  }, [activeNovel?.id, activeBranchId, latestMessageId, messages.length, threadMessagePage.total, threadMessagePage.hasMore, threadMessagePage.beforeId]);

  useLayoutEffect(() => {
    const restore = messageScrollRestoreRef.current;
    const node = threadBodyRef.current;
    if (!restore || !node) return;
    node.scrollTop = Math.max(0, node.scrollHeight - restore.scrollHeight + restore.scrollTop);
    messageScrollRestoreRef.current = null;
  }, [messages.length]);

  useEffect(() => {
    queuedDraftRef.current = queuedDraft;
  }, [queuedDraft]);

  useEffect(() => {
    queuedCommandRef.current = queuedCommand;
  }, [queuedCommand]);

  useEffect(() => {
    if (messageScrollRestoreRef.current) return;
    messageEndRef.current?.scrollIntoView({ behavior: liveRun ? "auto" : "smooth", block: "end" });
  }, [latestMessageId, busy, displayRun?.id, displayRun?.status, displayRun?.phase, liveRun?.id]);

  useEffect(() => () => {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    eventSourceRef.current?.close();
  }, []);

  useEffect(() => {
    setCurrentRun(null);
    setOriginalMessage("");
    setForkDraft(null);
    setMessageEditDraft(null);
    const prefs = loadPlannerUiPrefs(activeNovel?.id);
    const migratedMode = prefs.modeSchemaVersion >= 2 && plannerModeOptions.some((item) => item.key === prefs.agentMode)
      ? prefs.agentMode
      : "auto";
    setAgentMode(migratedMode);
    setPermissionModeDraft("");
    setAgentGoal(String(prefs.agentGoal || ""));
    setGoalDraft(String(prefs.agentGoal || ""));
    setGoalEditing(false);
    const compactViewport = typeof window !== "undefined" && window.matchMedia?.("(max-width: 1100px)")?.matches;
    setWorkspaceRailCollapsed(compactViewport ? true : prefs.workspaceRailCollapsed === true);
    setMentionRefs([]);
    setDroppedFiles([]);
    setDragActive(false);
    setSessionBusy({});
    dragDepthRef.current = 0;
    rehydratedRunRef.current = "";
    queuedDraftRef.current = "";
    queuedDraftPayloadRef.current = null;
    queuedCommandRef.current = null;
    setQueuedDraft("");
    setQueuedCommand(null);
    setLoadingOlderMessages(false);
    setLiveRunStreams({});
    setComposerSubmitting(false);
    setDoctorReport(null);
    setRunTranscript(null);
    setRunTranscriptLoadingId("");
    setRunTranscriptError("");
    setRunTranscriptSlow(false);
    setThreadDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    messageScrollRestoreRef.current = null;
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [activeNovel?.id]);

  useEffect(() => {
    if (!activeNovel?.id) return;
    const previous = loadPlannerUiPrefs(activeNovel.id);
    savePlannerUiPrefs(activeNovel.id, { ...previous, modeSchemaVersion: 2, agentMode, agentGoal, workspaceRailCollapsed });
  }, [activeNovel?.id, agentMode, agentGoal, workspaceRailCollapsed]);

  useEffect(() => {
    if (pendingApprovalEntry?.approval?.id) setApprovalScope("session");
  }, [pendingApprovalEntry?.approval?.id]);

  useEffect(() => {
    if (!activeNovel?.id || !activeHistoryRun?.id || currentRun?.id === activeHistoryRun.id) return;
    const runKey = `${activeNovel.id}:${activeHistoryRun.id}`;
    setCurrentRun(activeHistoryRun);
    if (rehydratedRunRef.current === runKey) return;
    rehydratedRunRef.current = runKey;
    window.setTimeout(() => {
      startPolling(activeNovel.id, activeHistoryRun.id, activeHistoryRun.userMessagePreview || "刷新后继续运行中的会话");
    }, 0);
    notify("info", "已恢复刷新前正在运行的策划 Agent 会话");
  }, [activeNovel?.id, activeHistoryRun?.id, currentRun?.id]);

  useEffect(() => {
    if (!activeNovel?.id || !liveRun?.id || isPlanningRunDisplayTerminal(liveRun)) return undefined;
    eventSourceRef.current?.close();
    const source = new EventSource(api.planningRunEventsUrl(activeNovel.id, liveRun.id));
    eventSourceRef.current = source;
    const handleRunEvent = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload?.kind === "model_stream" && payload.event?.type === "started") {
          setLiveRunStreams((current) => {
            const previous = current[liveRun.id] || {};
            const previousSegments = safeArray(previous.modelSegments);
            const currentText = String(previous.currentModelText || "").trim();
            const nextSegments = currentText ? [...previousSegments, currentText].slice(-8) : previousSegments;
            return {
              ...current,
              [liveRun.id]: {
                ...previous,
                modelSegments: nextSegments,
                currentModelText: "",
                modelText: nextSegments.join("\n\n"),
                modelChars: 0,
                modelStep: payload.step || 0
              }
            };
          });
        }
        if (payload?.kind === "model_stream" && /completed|done/i.test(String(payload.event?.type || ""))) {
          // 有些提供商或浏览器会先收到完整模型流，稍后才拿到终态 run；这里主动补拉，避免界面卡在运行中。
          [500, 1500, 3500, 7000].forEach((delay) => {
            window.setTimeout(() => {
              pollRun(activeNovel.id, liveRun.id, originalMessage).catch(() => {});
            }, delay);
          });
        }
        if (payload?.kind === "model_token") {
          setLiveRunStreams((current) => {
            const previous = current[liveRun.id] || {};
            const currentModelText = payload.text || `${previous.currentModelText || ""}${payload.token || ""}`;
            const segments = safeArray(previous.modelSegments);
            return {
              ...current,
              [liveRun.id]: {
                ...previous,
                currentModelText,
                modelText: [...segments, currentModelText].filter((item) => String(item || "").trim()).join("\n\n"),
                modelChars: Number(payload.chars || currentModelText.length || 0),
                modelStep: payload.step || previous.modelStep || 0
              }
            };
          });
        }
        if (payload?.kind === "tool_output") {
          setLiveRunStreams((current) => {
            const previous = current[liveRun.id] || {};
            const outputs = [
              ...(previous.outputs || []),
              {
                type: payload.type || "tool",
                stream: payload.stream || "stdout",
                text: payload.text || "",
                sessionId: payload.sessionId || "",
                cwd: payload.cwd || "",
                createdAt: payload.createdAt || new Date().toISOString()
              }
            ].slice(-80);
            return {
              ...current,
              [liveRun.id]: {
                ...previous,
                outputs
              }
            };
          });
        }
        if (payload?.kind === "item" && payload.item) {
          setCurrentRun((previous) => {
            if (!previous || previous.id !== liveRun.id) return previous;
            const items = safeArray(previous.items);
            const exists = items.some((item) => item.id === payload.item.id);
            return {
              ...previous,
              phase: payload.item.phase || previous.phase,
              items: exists ? items.map((item) => item.id === payload.item.id ? payload.item : item) : [...items, payload.item].slice(-160)
            };
          });
        }
        if (payload?.kind === "part" && payload.part) {
          setCurrentRun((previous) => {
            if (!previous || previous.id !== liveRun.id) return previous;
            const parts = safeArray(previous.parts);
            const exists = parts.some((part) => part.id === payload.part.id);
            return {
              ...previous,
              phase: payload.part.phase || previous.phase,
              parts: exists
                ? parts.map((part) => part.id === payload.part.id ? { ...part, ...payload.part } : part)
                : [...parts, payload.part].slice(-120)
            };
          });
        }
        if (payload?.kind === "public_part" && payload.publicPart) {
          setCurrentRun((previous) => {
            if (!previous || previous.id !== liveRun.id) return previous;
            const publicParts = safeArray(previous.publicParts);
            const exists = publicParts.some((part) => part.id === payload.publicPart.id);
            const nextPublicParts = exists
              ? publicParts.map((part) => part.id === payload.publicPart.id ? { ...part, ...payload.publicPart } : part)
              : [...publicParts, payload.publicPart].slice(-80);
            const nextDisplaySteps = nextPublicParts
              .map(normalizePlanningPublicPartForDisplay)
              .filter((step) => shouldShowPlanningCodexServerStep(step, true));
            return {
              ...previous,
              publicParts: nextPublicParts,
              displaySteps: nextDisplaySteps
            };
          });
        }
        if (payload?.kind === "turn_item" && payload.turnItem) {
          setCurrentRun((previous) => {
            if (!previous || previous.id !== liveRun.id) return previous;
            const turnItems = safeArray(previous.turnItems);
            const exists = turnItems.some((item) => item.id === payload.turnItem.id);
            const nextTurnItems = exists
              ? turnItems.map((item) => item.id === payload.turnItem.id ? { ...item, ...payload.turnItem } : item)
              : [...turnItems, payload.turnItem].slice(-120);
            const nextDisplaySteps = nextTurnItems
              .map(normalizePlanningTurnItemForDisplay)
              .filter((step) => shouldShowPlanningCodexServerStep(step, true));
            return {
              ...previous,
              turnItems: nextTurnItems,
              displaySteps: nextDisplaySteps.length ? nextDisplaySteps : previous.displaySteps
            };
          });
        }
        if (payload?.kind === "verifier_output") {
          setLiveRunStreams((current) => {
            const previous = current[liveRun.id] || {};
            const outputs = [
              ...(previous.outputs || []),
              {
                type: "verifier",
                stream: payload.stream || "stdout",
                text: payload.text || "",
                sessionId: payload.label || "verifier",
                cwd: payload.cwd || "",
                createdAt: payload.createdAt || new Date().toISOString()
              }
            ].slice(-80);
            return {
              ...current,
              [liveRun.id]: {
                ...previous,
                outputs
              }
            };
          });
        }
        const payloadBranchId = normalizeClientPlanningBranchId(payload?.run?.branchId || liveRun.branchId || "main");
        const visibleBranchId = normalizeClientPlanningBranchId(activeBranchId || "main");
        const liveBranchId = normalizeClientPlanningBranchId(liveRun.branchId || visibleBranchId);
        if ((payload?.messages || payload?.messagePage) && (payloadBranchId === visibleBranchId || payloadBranchId === liveBranchId)) {
          const pushedMessages = safeArray(payload.messages);
          const pushedPage = payload.messagePage || {};
          setThreadMessages((previous) => payloadBranchId !== visibleBranchId
            ? pushedMessages
            : mergePlanningMessagesWithPendingEdit(previous, pushedMessages, { branchId: visibleBranchId }));
          setThreadMessagePage({
            total: Number(pushedPage.total || pushedMessages.length || 0),
            hasMore: Boolean(pushedPage.hasMore),
            beforeId: String(pushedPage.beforeId || pushedPage.nextBeforeId || pushedMessages[0]?.id || "")
          });
          messageScrollRestoreRef.current = null;
        }
        if (payload?.run) {
          setCurrentRun((previous) => mergePlanningRunSnapshots(previous, payload.run));
          // SSE 的最终 run 快照必须立即写回全局 state。
          // 右侧会话栏和历史列表读取的是 activeNovel.planning.runs；
          // 如果只更新 currentRun，再等 getState 兜底，会出现“回复已显示但会话仍运行中”的短暂错位。
          applyPlanningResultToState(payload, {
            branchId: payloadBranchId,
            forceMessages: payloadBranchId === visibleBranchId
          });
          if (isPlanningRunDisplayTerminal(payload.run)) {
            const finishedRunId = payload.run?.id;
            setLiveRunStreams((current) => {
              if (!finishedRunId || !current[finishedRunId]) return current;
              const next = { ...current };
              delete next[finishedRunId];
              return next;
            });
          }
          if (isPlanningRunDisplayTerminal(payload.run)) {
            stopPolling();
            source.close();
            eventSourceRef.current = null;
            api.getState().then((result) => setState(result.state)).catch(() => {});
          }
        }
      } catch {
        // SSE 是实时显示通道，解析失败时保留轮询兜底，避免运行状态卡住。
      }
    };
    source.addEventListener("planning-run", handleRunEvent);
    source.onerror = () => {
      // 浏览器会自动重连；这里不弹错误，避免网络短抖动打断写作。
    };
    return () => {
      source.removeEventListener("planning-run", handleRunEvent);
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
  }, [activeNovel?.id, activeBranchId, liveRun?.id]);

  if (!activeNovel) return <EmptyNovel />;

  const stopPolling = () => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const resetVisiblePlanningRunState = (options = {}) => {
    stopPolling();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setCurrentRun(null);
    setOriginalMessage("");
    setLiveRunStreams({});
    if (options.clearQueued) {
      queuedDraftRef.current = "";
      queuedDraftPayloadRef.current = null;
      queuedCommandRef.current = null;
      setQueuedDraft("");
      setQueuedCommand(null);
    }
  };

  const clearComposerDraft = (options = {}) => {
    const { clearFork = true } = options;
    inputDraftRef.current = "";
    setInput("");
    setMentionRefs([]);
    setDroppedFiles([]);
    if (clearFork) setForkDraft(null);
  };

  const clearComposerIfStillSubmittedDraft = (submittedText = "", options = {}) => {
    const expected = String(submittedText || "").trim();
    const currentDraft = String(inputDraftRef.current || "").trim();
    // 运行完成的轮询回包可能晚于用户下一次输入或就地编辑。
    // 这里只清“仍然等于本次已提交内容”的草稿，避免把用户正在写的新消息抹掉。
    if (!expected || currentDraft !== expected) return;
    inputDraftRef.current = "";
    setInput("");
    setMentionRefs([]);
    setDroppedFiles([]);
    if (options.clearFork !== false) setForkDraft(null);
  };

  const restoreComposerDraft = (snapshot = {}) => {
    inputDraftRef.current = snapshot.input || "";
    setInput(snapshot.input || "");
    setMentionRefs(safeArray(snapshot.mentions));
    setDroppedFiles(safeArray(snapshot.files));
    setForkDraft(snapshot.forkDraft || null);
  };

  const clearQueuedDraft = () => {
    queuedDraftRef.current = "";
    queuedDraftPayloadRef.current = null;
    setQueuedDraft("");
  };

  const clearQueuedCommand = () => {
    queuedCommandRef.current = null;
    setQueuedCommand(null);
  };

  const loadOlderThreadMessages = async () => {
    if (!activeNovel?.id || loadingOlderMessages || !hasOlderMessages) return;
    const beforeId = messages[0]?.id || threadMessagePage.beforeId;
    if (!beforeId) return;
    const node = threadBodyRef.current;
    if (node) {
      messageScrollRestoreRef.current = {
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop
      };
    }
    setLoadingOlderMessages(true);
    try {
      const result = await api.planningMessages(activeNovel.id, {
        branchId: activeBranchId,
        beforeId,
        limit: PLANNING_THREAD_PAGE_SIZE
      });
      const olderMessages = safeArray(result.messages);
      setThreadMessages((previous) => mergePlanningMessages(olderMessages, previous));
      setThreadMessagePage({
        total: Number(result.page?.total || threadMessagePage.total || 0),
        hasMore: Boolean(result.page?.hasMore),
        beforeId: String(result.page?.beforeId || result.page?.nextBeforeId || olderMessages[0]?.id || "")
      });
    } catch (error) {
      messageScrollRestoreRef.current = null;
      showError(error);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleThreadScroll = () => {
    const node = threadBodyRef.current;
    if (!node || loadingOlderMessages || !hasOlderMessages) return;
    if (node.scrollTop <= PLANNING_THREAD_PRELOAD_TOP) {
      loadOlderThreadMessages();
    }
  };

  const pollRun = async (novelId, nextRunId, sourceMessage) => {
    const result = await api.planningRun(novelId, nextRunId);
    setCurrentRun((previous) => mergePlanningRunSnapshots(previous, result.run));
    applyPlanningResultToState(result, { branchId: result?.run?.branchId || activeBranchId });
    syncThreadMessagesFromResult(result);
    if (!isPlanningRunDisplayTerminal(result.run)) return result;
    stopPolling();
    setLiveRunStreams((current) => {
      if (!current[nextRunId]) return current;
      const next = { ...current };
      delete next[nextRunId];
      return next;
    });
    const stateResult = await api.getState();
    setState(stateResult.state);
    if (result.run.status === "completed") {
      const pendingDraft = queuedDraftRef.current || "";
      const pendingDraftPayload = queuedDraftPayloadRef.current;
      const pendingCommand = queuedCommandRef.current;
      clearQueuedDraft();
      clearQueuedCommand();
      setOriginalMessage("");
      if (pendingCommand?.command) {
        clearComposerDraft();
        window.setTimeout(() => executePlannerCommand(pendingCommand.command, {
          argument: pendingCommand.argument,
          submitPrompt: true,
          queueIfRunning: false
        }), 0);
        notify("success", "策划 Agent 已完成，正在执行排队命令");
      } else if (pendingDraft) {
        clearComposerDraft();
        window.setTimeout(() => startAgent(pendingDraft, pendingDraftPayload?.submitted || "", {
          mentions: pendingDraftPayload?.mentions || [],
          files: pendingDraftPayload?.files || [],
          forkDraftOverride: pendingDraftPayload?.forkDraft || null
        }), 0);
        notify("success", "策划 Agent 已完成，正在发送排队消息");
      } else {
        clearComposerIfStillSubmittedDraft(sourceMessage, { clearFork: false });
        notify("success", result.run.phase === "awaiting_user" ? "策划 Agent 已回复，等待你继续" : "策划 Agent 已完成，运行记录已同步");
      }
    } else if (result.run.status === "paused") {
      clearComposerIfStillSubmittedDraft(sourceMessage, { clearFork: false });
      notify("warning", "策划 Agent 已暂停；可直接在当前会话发“继续”，或先处理暂停原因后再发下一句。");
    } else {
      clearComposerIfStillSubmittedDraft(sourceMessage, { clearFork: false });
      notify("error", planningRunProblemMessage(result.run) || "策划 Agent 未完成，原因已写入本轮消息和过程详情");
    }
    return result;
  };

  const startPolling = (novelId, nextRunId, sourceMessage) => {
    stopPolling();
    pollRun(novelId, nextRunId, sourceMessage).catch(showError);
    pollTimerRef.current = window.setInterval(() => {
      pollRun(novelId, nextRunId, sourceMessage).catch((error) => {
        stopPolling();
        showError(error);
      });
    }, 1200);
  };

  const startAgent = async (overrideMessage = "", preparedMessage = "", options = {}) => {
    const fileSnapshot = options.files ? safeArray(options.files).map(normalizePlanningComposerAttachmentFile).filter(Boolean) : droppedFiles;
    const mentionSnapshot = options.mentions ? safeArray(options.mentions) : mentionRefs;
    const activeForkDraft = options.forkDraftOverride !== undefined ? options.forkDraftOverride : forkDraft;
    const preserveComposerDraft = Boolean(options.preserveComposerDraft);
    const rawMessage = (typeof overrideMessage === "string" && overrideMessage.trim() ? overrideMessage : input).trim();
    const message = rawMessage || (fileSnapshot.length ? `请阅读我拖入的 ${fileSnapshot.length} 个文件。` : "");
    if (!message) {
      notify("warning", "请输入消息，或拖入可读取的文本文件");
      return;
    }
    const composerSnapshot = {
      input: rawMessage,
      mentions: mentionSnapshot,
      files: fileSnapshot,
      forkDraft: activeForkDraft || null
    };
    const parsedCommand = !overrideMessage && fileSnapshot.length === 0 ? parsePlanningSlashCommand(message) : null;
    const slashCommand = parsedCommand ? findPlannerSlashCommandByName(parsedCommand.name) : null;
    if (!overrideMessage && slashCommand && executePlannerCommand(slashCommand, {
      argument: parsedCommand.argument,
      submitPrompt: true,
      queueIfRunning: false
    })) return;
    const submittedMessage = String(preparedMessage || "").trim() || buildPlanningComposerSubmissionMessage(message, {
      mode: agentMode,
      goal: agentGoal,
      mentions: mentionSnapshot,
      files: fileSnapshot
    });
    const attachments = buildPlanningMessageAttachments({
      mentions: mentionSnapshot,
      files: fileSnapshot
    });
    const editDraft = activeForkDraft?.mode === "edit_from_message" ? activeForkDraft : null;
    if (liveRun && !isPlanningRunDisplayTerminal(liveRun)) {
      if (editDraft || options.queueIfRunning === false) {
        notify("warning", editDraft
          ? "这条消息正在生成或当前会话仍在运行。编辑重发不会排到下一条；请先停止当前运行，或等它完成后再发送。"
          : "当前会话仍在运行，不能直接覆盖已有对话。");
        return false;
      }
      if (!options.steerLive) {
        return queueNextAgentMessage({
          message,
          submittedMessage,
          mentions: mentionSnapshot,
          files: fileSnapshot,
          forkDraft: activeForkDraft,
          preserveComposerDraft
        });
      }
      clearComposerDraft();
      const result = await commit("planning-steer", () => api.steerPlanningRun(activeNovel.id, liveRun.id, {
        message: submittedMessage,
        displayMessage: message,
        attachments
      }), "已追加到当前运行");
      if (result?.run) {
        setCurrentRun((previous) => mergePlanningRunSnapshots(previous, result.run));
      } else {
        restoreComposerDraft(composerSnapshot);
      }
      return;
    }
    const nextRunId = makeRunId();
    const nextBranchId = editDraft ? normalizeClientPlanningBranchId(editDraft.branchId || activeBranchId) : activeForkDraft?.newBranchId || activeBranchId;
    const previousThreadMessages = messages;
    const previousThreadPage = threadMessagePage;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticPreparingStep = {
      id: `public:${nextRunId}:preparing`,
      type: "status",
      status: "running",
      kind: "status",
      tone: "active",
      text: "正在准备本轮处理",
      source: "client_optimistic",
      sourceId: nextRunId,
      createdAt: optimisticCreatedAt,
      updatedAt: optimisticCreatedAt
    };
    setOriginalMessage(message);
    if (!preserveComposerDraft) clearComposerDraft();
    setCurrentRun({
      id: nextRunId,
      status: "running",
      phase: "preparing",
      novelId: activeNovel.id,
      branchId: nextBranchId,
      createdAt: optimisticCreatedAt,
      updatedAt: optimisticCreatedAt,
      parentBranchId: activeForkDraft?.branchId || "",
      forkFromMessageId: activeForkDraft?.messageId || "",
      replaceFromMessageId: editDraft?.messageId || "",
      userMessagePreview: shortText(message, 180),
      clientOptimistic: true,
      publicParts: [optimisticPreparingStep],
      displaySteps: [optimisticPreparingStep],
      events: [
        { id: `${nextRunId}_queued`, type: "queue", phase: "queued", message: "用户消息已进入策划 Agent 队列", createdAt: optimisticCreatedAt },
        { id: `${nextRunId}_preparing`, type: "progress_note", phase: "preparing", message: "正在准备本轮处理", createdAt: optimisticCreatedAt, data: { status: "running" } }
      ]
    });
    const optimisticUserMessage = {
      id: `optimistic_${nextRunId}`,
      role: "user",
      content: message,
      submittedContent: submittedMessage,
      attachments,
      runId: nextRunId,
      branchId: nextBranchId,
      createdAt: optimisticCreatedAt,
      updatedAt: optimisticCreatedAt,
      parentBranchId: activeForkDraft?.branchId || "",
      forkFromMessageId: activeForkDraft?.messageId || "",
      replaceFromMessageId: editDraft?.messageId || "",
      replaceFromRunId: editDraft?.runId || "",
      forkMode: editDraft ? "edit_from_message" : activeForkDraft?.mode || "",
      clientOptimistic: true
    };
    const optimisticMessages = editDraft ? buildPlanningEditOptimisticMessages(previousThreadMessages, editDraft, optimisticUserMessage) : null;
    setThreadMessages((previous) => editDraft
      ? buildPlanningEditOptimisticMessages(previous.length ? previous : previousThreadMessages, editDraft, optimisticUserMessage)
      : mergePlanningMessages(previous, [optimisticUserMessage]));
    if (editDraft) {
      setThreadMessagePage({
        total: optimisticMessages.length,
        hasMore: false,
        beforeId: optimisticMessages[0]?.id || optimisticUserMessage.id
      });
    }
    const payload = {
      message: submittedMessage,
      displayMessage: message,
      runId: nextRunId,
      attachments,
      ...(editDraft?.messageId ? { replaceFromMessageId: editDraft.messageId, branchId: nextBranchId } : activeForkDraft?.messageId ? { forkFromMessageId: activeForkDraft.messageId } : {}),
      ...(activeForkDraft?.newBranchId ? { branchId: activeForkDraft.newBranchId } : {})
    };
    setComposerSubmitting(true);
    try {
      const result = await api.startPlanningChat(activeNovel.id, payload);
      if (result?.state) setState(result.state);
      applyPlanningResultToState(result, { branchId: nextBranchId });
      syncThreadMessagesFromResult(result, { replace: Boolean(!editDraft && activeForkDraft?.newBranchId), branchId: nextBranchId, force: true });
      setCurrentRun((previous) => mergePlanningRunSnapshots(previous, result.run));
      startPolling(activeNovel.id, nextRunId, message);
      if (!activeForkDraft || activeForkDraft === forkDraft || activeForkDraft.messageId === forkDraft?.messageId) {
        setForkDraft(null);
      }
      return result;
    } catch (error) {
      showError(error);
      restoreComposerDraft(composerSnapshot);
      setCurrentRun(null);
      setThreadMessages((previous) => editDraft ? previousThreadMessages : previous.filter((item) => item.id !== `optimistic_${nextRunId}`));
      if (editDraft) setThreadMessagePage(previousThreadPage);
      return null;
    } finally {
      setComposerSubmitting(false);
    }
  };

  const steerCurrentRun = () => startAgent("", "", { steerLive: true });

  const handleComposerKeyDown = (event) => {
    const isComposing = event?.isComposing || event?.nativeEvent?.isComposing;
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || isComposing) return;
    event.preventDefault();
    if (!composerHasContent || composerSubmitting || busy === "planning-steer") return;
    if (liveRun && !isPlanningRunDisplayTerminal(liveRun)) {
      queueComposerSnapshotAsNextMessage();
      return;
    }
    startAgent();
  };

  const continueRun = async (run) => {
    if (!run?.id || !activeNovel?.id) return;
    const nextRunId = makeRunId();
    const fallbackMessage = buildPlanningContinuationPrompt(run, originalMessage || input);
    const displayMessage = "继续当前会话未完成的对话";
    setOriginalMessage(displayMessage);
    setCurrentRun({
      id: nextRunId,
      status: "queued",
      phase: "queued",
      novelId: activeNovel.id,
      branchId: normalizeClientPlanningBranchId(run.branchId || activeBranchId),
      resumeOf: run.id,
      userMessagePreview: displayMessage,
      events: [{ id: `${nextRunId}_queued`, type: "queue", phase: "queued", message: "续跑消息已进入策划 Agent 队列", createdAt: new Date().toISOString() }]
    });
    const result = await commit("planning-chat-start", () => api.resumePlanningRun(activeNovel.id, run.id, {
      runId: nextRunId,
      message: fallbackMessage,
      displayMessage
    }), "已继续当前会话");
    if (result) {
      applyPlanningResultToState(result, { branchId: run.branchId || activeBranchId });
      syncThreadMessagesFromResult(result);
      setCurrentRun((previous) => result.run ? mergePlanningRunSnapshots(previous, result.run) : null);
      startPolling(activeNovel.id, nextRunId, displayMessage);
    } else {
      setCurrentRun(null);
    }
  };

  const cancelRun = async () => {
    const activeRunId = liveRun?.id || currentRun?.id;
    if (!activeRunId) return;
    const cancelledAt = new Date().toISOString();
    const optimisticRun = {
      ...(liveRun || currentRun || {}),
      id: activeRunId,
      status: "cancelled",
      phase: "cancelled",
      finishedAt: cancelledAt,
      error: {
        code: "agent.cancelled",
        message: "你已终止本轮 Agent。"
      },
      events: [
        ...safeArray((liveRun || currentRun)?.events),
        {
          id: `${activeRunId}_cancel_requested_${Date.now()}`,
          type: "cancelled",
          phase: "cancelled",
          message: "已发送中断信号",
          createdAt: cancelledAt
        }
      ]
    };
    setCurrentRun(optimisticRun);
    stopPolling();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    notify("warning", "已中断本轮 Agent");
    try {
      const result = await api.cancelPlanning(activeNovel.id, activeRunId);
      if (result?.run) setCurrentRun((previous) => mergePlanningRunSnapshots(previous, result.run));
      if (result?.messages) syncThreadMessagesFromResult(result);
      if (result?.state) setState(result.state);
      if (result?.run && !isPlanningRunDisplayTerminal(result.run)) {
        startPolling(activeNovel.id, activeRunId, originalMessage);
      }
    } catch (error) {
      showError(error);
      startPolling(activeNovel.id, activeRunId, originalMessage);
    }
  };

  const revertLast = () => {
    setRevertModal({ type: "last", runId: "", checkpointId: "" });
  };

  const revertCheckpoint = async (targetRunId, checkpointId) => {
    setRevertModal({ type: "checkpoint", runId: targetRunId || "", checkpointId: checkpointId || "" });
  };

  const decideApproval = async (targetRunId, approvalId, decision, scope = approvalScope) => {
    const decidedAt = new Date().toISOString();
    if (targetRunId && approvalId) {
      setCurrentRun((previous) => {
        if (!previous || previous.id !== targetRunId) return previous;
        const nextStatus = decision === "approved" ? "running" : "blocked";
        const nextPhase = decision === "approved" ? "approval_approved" : "approval_rejected";
        return {
          ...previous,
          status: nextStatus,
          phase: nextPhase,
          updatedAt: decidedAt,
          approvals: safeArray(previous.approvals).map((approval) => approval.id === approvalId
            ? { ...approval, status: decision === "approved" ? "approved" : "rejected", decidedAt }
            : approval),
          displaySteps: [
            ...safeArray(previous.displaySteps).filter((step) => !(String(step?.kind || "") === "approval" && String(step?.sourceId || "") === approvalId)),
            {
              id: `approval-local-${approvalId}`,
              type: "action",
              tone: decision === "approved" ? "active" : "warning",
              status: nextStatus,
              kind: "approval",
              sourceId: approvalId,
              text: decision === "approved" ? "已确认权限，正在继续" : "已拒绝权限，本轮将收束",
              createdAt: decidedAt,
              updatedAt: decidedAt
            }
          ]
        };
      });
    }
    const result = await commit(`planning-approval-${decision}`, () => api.decidePlanningApproval(activeNovel.id, targetRunId, approvalId, decision, { scope }), decision === "approved" ? "已批准高风险操作" : "已拒绝高风险操作");
    if (!targetRunId || !result) return;
    if (result?.state) {
      setState(result.state);
    } else {
      applyPlanningResultToState(result);
    }
    syncThreadMessagesFromResult(result);
    const runResult = result.run ? { run: result.run } : await api.planningRun(activeNovel.id, targetRunId).catch(() => null);
    if (runResult?.run) {
      setCurrentRun((previous) => mergePlanningRunSnapshots(previous, runResult.run));
      if (decision === "approved" && ["paused", "blocked"].includes(String(runResult.run.status || "")) && runResult.run.resumeState?.status === "available") {
        const nextRunId = makeRunId();
        const fallbackMessage = buildPlanningContinuationPrompt(runResult.run, originalMessage || input);
        const displayMessage = "批准权限后继续当前会话";
        setOriginalMessage(displayMessage);
        const resumeResult = await commit("planning-chat-start", () => api.resumePlanningRun(activeNovel.id, targetRunId, {
          runId: nextRunId,
          message: fallbackMessage,
          displayMessage
        }), "已批准并自动继续当前会话");
        if (resumeResult?.run) {
          applyPlanningResultToState(resumeResult, { branchId: runResult.run.branchId || activeBranchId });
          syncThreadMessagesFromResult(resumeResult);
          setCurrentRun((previous) => mergePlanningRunSnapshots(previous, resumeResult.run));
          startPolling(activeNovel.id, nextRunId, displayMessage);
          return;
        }
      }
      if (!isPlanningRunDisplayTerminal(runResult.run)) {
        startPolling(activeNovel.id, targetRunId, originalMessage);
      } else {
        stopPolling();
        setLiveRunStreams((current) => {
          if (!current[targetRunId]) return current;
          const next = { ...current };
          delete next[targetRunId];
          return next;
        });
      }
    } else if (decision === "approved") {
      startPolling(activeNovel.id, targetRunId, originalMessage);
    }
  };

  const openContextDrawer = () => {
    setThreadDrawerVisible(false);
    setVersionDrawerVisible(false);
    setModelDrawerVisible(false);
    setFileDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setContextDrawerVisible(true);
  };

  const openVersionDrawer = () => {
    setContextDrawerVisible(false);
    setThreadDrawerVisible(false);
    setModelDrawerVisible(false);
    setFileDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setVersionDrawerVisible(true);
  };

  const openThreadDrawer = () => {
    setContextDrawerVisible(false);
    setVersionDrawerVisible(false);
    setModelDrawerVisible(false);
    setFileDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setThreadDrawerVisible(false);
    setWorkspaceRailCollapsed(false);
  };

  const openModelDrawer = () => {
    setContextDrawerVisible(false);
    setVersionDrawerVisible(false);
    setThreadDrawerVisible(false);
    setFileDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setModelDrawerVisible(true);
  };

  const openFileDrawer = () => {
    setContextDrawerVisible(false);
    setVersionDrawerVisible(false);
    setThreadDrawerVisible(false);
    setModelDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setFileDrawerVisible(true);
  };

  const switchPlannerModel = async (payload = {}) => {
    const currentPlanner = activeNovel.aiRoles?.planner || {};
    const resetBudget = Boolean(payload.resetBudget);
    const nextPlanner = {
      providerId: String(payload.providerId ?? currentPlanner.providerId ?? ""),
      model: String(payload.model ?? currentPlanner.model ?? "")
    };
    const budgetFields = ["contextWindowTokens", "responseReserveTokens", "promptBudgetTokens", "compressionTriggerTokens", "safetyTokens"];
    const manualBudgetPatch = {};
    for (const field of budgetFields) {
      if (resetBudget || Object.hasOwn(payload, field)) {
        const normalized = resetBudget ? 0 : normalizeTokenBudgetOverrideClient(payload[field]);
        nextPlanner[field] = normalized;
        if (!resetBudget && normalized) manualBudgetPatch[field] = normalized;
      }
    }
    if (resetBudget || Object.hasOwn(payload, "compactionPressureRatio")) {
      nextPlanner.compactionPressureRatio = resetBudget ? 0 : clampDecimal(payload.compactionPressureRatio, 0, 0.98, 0);
      if (!resetBudget && nextPlanner.compactionPressureRatio) manualBudgetPatch.compactionPressureRatio = nextPlanner.compactionPressureRatio;
    }
    await commit("planner-model-switch", async () => {
      const shouldPersistModelProfile = nextPlanner.providerId && nextPlanner.model && Object.keys(manualBudgetPatch).length > 0;
      const provider = shouldPersistModelProfile ? providers.find((item) => item.id === nextPlanner.providerId) : null;
      if (provider) {
        await api.upsertProvider({
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          adapterId: provider.adapterId,
          capabilities: provider.capabilities,
          endpointKind: provider.endpointKind,
          modelQueryPath: provider.modelQueryPath,
          models: uniqueStrings([...(provider.models || []), nextPlanner.model]),
          modelProfiles: {
            ...(provider.modelProfiles || {}),
            [nextPlanner.model]: {
              ...(provider.modelProfiles?.[nextPlanner.model] || {}),
              ...manualBudgetPatch,
              source: "manual",
              updatedAt: new Date().toISOString()
            }
          }
        });
      }
      return api.patchNovel(activeNovel.id, { aiRoles: { planner: nextPlanner } });
    }, resetBudget ? "策划模型已切换，预算改为自动匹配" : "策划模型和上下文预算已保存");
    setModelDrawerVisible(false);
  };

  const switchPlannerPermissionMode = async (mode) => {
    const nextMode = String(mode || "ask_high_risk");
    setPermissionModeDraft(nextMode);
    const result = await commit("planner-permission-switch", () => api.patchNovel(activeNovel.id, {
      planning: {
        agentPermissionMode: nextMode
      }
    }), `权限已切换为${planningPermissionModeLabel(nextMode)}`);
    setPermissionModeDraft("");
    return result;
  };

  const returnToMessage = (message) => {
    const restoredFiles = planningMessageAttachmentFiles(message);
    const restoredMentions = planningMessageAttachmentMentions(message);
    setForkDraft(null);
    setMessageEditDraft({
      mode: "edit_from_message",
      messageId: message?.id || "",
      branchId: message?.branchId || activeBranchId || "main",
      runId: message?.runId || "",
      content: message?.content || "",
      files: restoredFiles,
      mentions: restoredMentions,
      preview: shortText(message?.content || "", 90)
    });
    notify("success", restoredFiles.length > 0 ? `正在就地编辑这条消息，已保留 ${restoredFiles.length} 个随消息发送的文件` : "正在就地编辑这条消息");
  };

  const changeMessageEditDraft = (patch = {}) => {
    setMessageEditDraft((current) => current ? { ...current, ...patch } : current);
  };

  const cancelMessageEditDraft = () => {
    setMessageEditDraft(null);
  };

  const submitMessageEditDraft = async (draft) => {
    if (composerSubmitting) return false;
    const source = draft || messageEditDraft;
    const message = String(source?.content || "").trim();
    if (!message) {
      notify("warning", "编辑后的消息不能为空");
      return false;
    }
    const fork = {
      mode: "edit_from_message",
      messageId: source?.messageId || "",
      branchId: source?.branchId || activeBranchId || "main",
      runId: source?.runId || "",
      preview: shortText(message, 90)
    };
    const result = await startAgent(message, "", {
      mentions: safeArray(source?.mentions),
      files: safeArray(source?.files).map(normalizePlanningComposerAttachmentFile).filter(Boolean),
      forkDraftOverride: fork,
      preserveComposerDraft: false,
      queueIfRunning: false
    });
    if (result) setMessageEditDraft(null);
    else setMessageEditDraft(source);
    return result;
  };

  const draftStarterPrompt = (prompt) => {
    setInput(prompt || "");
    window.requestAnimationFrame(() => composerInputRef.current?.focus?.());
  };

  const switchBranch = async (branchId) => {
    if (!branchId || branchId === activeBranchId || !activeNovel?.id) return;
    const previousBranchId = activeBranchId;
    const previousMessages = messages;
    const previousPage = threadMessagePage;
    const targetBranch = planningBranches.find((branch) => branch.id === branchId) || null;
    const currentCacheKey = `${activeNovel.id}:${activeBranchId}`;
    const targetCacheKey = `${activeNovel.id}:${branchId}`;
    const targetCache = branchMessageCache[targetCacheKey] || null;
    const optimisticTargetPage = targetCache?.page || {
      total: Number(targetBranch?.messageCount || 0),
      hasMore: false,
      beforeId: ""
    };
    const optimisticTargetMessages = targetCache?.messages || [];
    setBranchMessageCache((previous) => ({
      ...previous,
      [currentCacheKey]: {
        messages,
        page: threadMessagePage,
        latestMessageId: messages[messages.length - 1]?.id || ""
      }
    }));
    resetVisiblePlanningRunState({ clearQueued: true });
    setForkDraft(null);
    setMessageEditDraft(null);
    setThreadMessages(optimisticTargetMessages);
    setThreadMessagePage(optimisticTargetPage);
    setState((previous) => ({
      ...previous,
      novels: safeArray(previous?.novels).map((novel) => {
        if (novel.id !== activeNovel.id) return novel;
        const planning = {
          ...(novel.planning || {}),
          activeBranchId: branchId,
          messages: optimisticTargetMessages,
          messagePage: optimisticTargetPage,
          branchState: {
            ...(novel.planning?.branchState || {}),
            activeBranchId: branchId,
            branches: safeArray(novel.planning?.branchState?.branches || novel.planning?.branches).map((branch) => ({
              ...branch,
              active: branch.id === branchId
            }))
          },
          branches: safeArray(novel.planning?.branches).map((branch) => ({
            ...branch,
            active: branch.id === branchId
          }))
        };
        return { ...novel, planning };
      })
    }));
    setSessionBusy((current) => ({ ...current, [`switch:${branchId}`]: true }));
    try {
      const result = await api.switchPlanningBranch(activeNovel.id, branchId);
      if (result?.state) setState(result.state);
      syncSessionState(result, { openThreadDrawer: false });
    } catch (error) {
      setThreadMessages(previousMessages);
      setThreadMessagePage(previousPage);
      setState((previous) => ({
        ...previous,
        novels: safeArray(previous?.novels).map((novel) => {
          if (novel.id !== activeNovel.id) return novel;
          const planning = {
            ...(novel.planning || {}),
            activeBranchId: previousBranchId,
            messages: previousMessages,
            messagePage: previousPage,
            branchState: {
              ...(novel.planning?.branchState || {}),
              activeBranchId: previousBranchId,
              branches: safeArray(novel.planning?.branchState?.branches || novel.planning?.branches).map((branch) => ({
                ...branch,
                active: branch.id === previousBranchId
              }))
            },
            branches: safeArray(novel.planning?.branches).map((branch) => ({
              ...branch,
              active: branch.id === previousBranchId
            }))
          };
          return { ...novel, planning };
        })
      }));
      showError(error);
    } finally {
      setSessionBusy((current) => {
        const next = { ...current };
        delete next[`switch:${branchId}`];
        return next;
      });
    }
  };

  const syncThreadMessagesFromResult = (result, options = {}) => {
    const nextNovel = result?.state?.novels?.find((item) => item.id === activeNovel?.id);
    const resultMessages = safeArray(result?.messages?.length ? result.messages : result?.messagePage?.messages);
    const resultPage = result?.messagePage?.page || result?.messagePage || result?.page || null;
    if (!nextNovel && resultMessages.length === 0) return false;
    const resultBranchId = normalizeClientPlanningBranchId(
      options.branchId
      || result?.run?.branchId
      || result?.branchState?.activeBranchId
      || result?.branchId
      || nextNovel?.planning?.activeBranchId
      || activeBranchIdRef.current
    );
    const visibleBranchId = normalizeClientPlanningBranchId(activeBranchIdRef.current || "main");
    const page = resultPage || nextNovel?.planning?.messagePage || {};
    const nextMessages = resultMessages.length ? resultMessages : safeArray(nextNovel?.planning?.messages);
    if (!options.force && resultBranchId !== visibleBranchId) {
      if (activeNovel?.id && nextMessages.length > 0) {
        const cacheKey = `${activeNovel.id}:${resultBranchId}`;
        setBranchMessageCache((previous) => ({
          ...previous,
          [cacheKey]: {
            messages: nextMessages,
            page: {
              total: Number(page.total || nextMessages.length || 0),
              hasMore: Boolean(page.hasMore),
              beforeId: String(page.beforeId || page.nextBeforeId || nextMessages[0]?.id || "")
            },
            latestMessageId: nextMessages[nextMessages.length - 1]?.id || ""
          }
        }));
      }
      return false;
    }
    setThreadMessages((previous) => options.replace ? nextMessages : mergePlanningMessagesWithPendingEdit(previous, nextMessages, { branchId: resultBranchId }));
    setThreadMessagePage({
      total: Number(page.total || nextMessages.length || 0),
      hasMore: Boolean(page.hasMore),
      beforeId: String(page.beforeId || page.nextBeforeId || nextMessages[0]?.id || "")
    });
    messageScrollRestoreRef.current = null;
    return true;
  };

  const applyPlanningResultToState = (result, options = {}) => {
    if (!result || result.state || !activeNovel?.id) return;
    const resultMessages = safeArray(result?.messages?.length ? result.messages : result?.messagePage?.messages);
    const resultPage = result?.messagePage?.page || result?.messagePage || result?.page || null;
    const branchState = result.branchState || null;
    const resultRun = result.run || null;
    const branchId = normalizeClientPlanningBranchId(
      options.branchId
      || resultRun?.branchId
      || branchState?.activeBranchId
      || result?.branchId
      || activeBranchId
    );
    setState((previous) => {
      if (!previous?.novels) return previous;
      return {
        ...previous,
        novels: safeArray(previous.novels).map((novel) => {
          if (novel.id !== activeNovel.id) return novel;
          const planning = { ...(novel.planning || {}) };
          if (branchState) {
            planning.activeBranchId = normalizeClientPlanningBranchId(branchState.activeBranchId || branchId);
            planning.branchState = branchState;
            planning.branches = safeArray(branchState.branches);
          }
          const visibleBranchId = normalizeClientPlanningBranchId(planning.activeBranchId || activeBranchIdRef.current || "main");
          const shouldPatchVisibleMessages = options.forceMessages === true || branchId === visibleBranchId;
          if (resultMessages.length > 0 && shouldPatchVisibleMessages) {
            const resultTotal = Number(resultPage?.total || resultMessages.length || 0);
            const resultLoaded = Number(resultPage?.loaded || resultMessages.length || 0);
            const isPartialRunEcho = Boolean(resultRun?.id && resultTotal > resultMessages.length && resultLoaded <= resultMessages.length);
            planning.messages = isPartialRunEcho
              ? mergePlanningMessagesWithPendingEdit(planning.messages, resultMessages, { branchId })
              : resultMessages;
          }
          if (resultPage && shouldPatchVisibleMessages) planning.messagePage = resultPage;
          if (resultRun?.id) {
            const runs = safeArray(planning.runs);
            const exists = runs.some((run) => run.id === resultRun.id);
            planning.runs = exists
              ? runs.map((run) => run.id === resultRun.id ? mergePlanningRunSnapshots(run, resultRun) : run)
              : [resultRun, ...runs].slice(0, 80);
          }
          return { ...novel, planning };
        })
      };
    });
  };

  const syncSessionState = (result, options = {}) => {
    applyPlanningResultToState(result, { branchId: result?.branchState?.activeBranchId || activeBranchId });
    const synced = syncThreadMessagesFromResult(result, { replace: true, force: true });
    if (!synced) return;
    resetVisiblePlanningRunState();
    setForkDraft(null);
    if (options.openThreadDrawer !== false) setWorkspaceRailCollapsed(false);
  };

  const runSessionMutation = async (action, branchId, task, successText) => {
    const key = `${action}:${branchId || "global"}`;
    setSessionBusy((current) => ({ ...current, [key]: true }));
    try {
      const result = await task();
      if (result?.state) setState(result.state);
      if (successText) notify("success", successText);
      return result;
    } catch (error) {
      showError(error);
      return null;
    } finally {
      setSessionBusy((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const closeSessionModal = () => {
    if (String(busy || "").startsWith("planning-session-")) return;
    setSessionModal({ type: "", branch: null, label: "" });
  };

  const closeRevertModal = () => {
    if (busy === "planning-revert" || busy === "planning-checkpoint-revert") return;
    setRevertModal({ type: "", runId: "", checkpointId: "" });
  };

  // 这些是会修改会话或资料快照的核心操作，必须走受控弹窗，避免静态 Modal 在真实页面里失效。
  const submitSessionModal = async () => {
    if (!activeNovel?.id || !sessionModal.type) return false;
    const label = String(sessionModal.label || "").trim();
    let result = null;
    if (sessionModal.type === "create") {
      result = await commit("planning-session-create", () => api.createPlanningBranch(activeNovel.id, {
        label: label || "新会话"
      }), "已新建 Agent 会话");
    } else if (sessionModal.type === "fork") {
      if (!sessionModal.branch?.id) return false;
      result = await commit("planning-session-fork", () => api.forkPlanningBranch(activeNovel.id, sessionModal.branch.id, {
        label: label || `派生：${sessionModal.branch.label || (sessionModal.branch.id === "main" ? "主会话" : sessionModal.branch.id.slice(-6))}`
      }), "已派生 Agent 会话");
    } else if (sessionModal.type === "rename") {
      if (!sessionModal.branch?.id) return false;
      if (!label) {
        notify("warning", "会话名称不能为空");
        return false;
      }
      result = await commit("planning-session-rename", () => api.updatePlanningBranch(activeNovel.id, sessionModal.branch.id, {
        label
      }), "会话名称已更新");
    } else if (sessionModal.type === "delete") {
      if (!sessionModal.branch?.id || sessionModal.branch.id === "main") return false;
      const branchId = sessionModal.branch.id;
      const branchLabel = sessionModal.branch.label || sessionModal.branch.id;
      setSessionModal({ type: "", branch: null, label: "" });
      notify("info", `正在删除会话：${branchLabel}`);
      result = await commit("planning-session-delete", () => api.deletePlanningBranch(activeNovel.id, branchId), "Agent 会话已删除");
    } else if (sessionModal.type === "clear") {
      if (!sessionModal.branch?.id) return false;
      result = await commit("planning-session-clear", () => api.clearPlanningBranch(activeNovel.id, sessionModal.branch.id, {}), "会话已清空");
    } else if (sessionModal.type === "cleanup") {
      result = await commit("planning-session-cleanup", () => api.cleanupPlanningBranches(activeNovel.id, { mode: "safe" }), "已清理空会话和已删除会话");
    }
    if (result) {
      syncSessionState(result);
      if (sessionModal.type) setSessionModal({ type: "", branch: null, label: "" });
      return true;
    }
    return false;
  };

  const submitRevertModal = async () => {
    if (!activeNovel?.id || !revertModal.type) return false;
    let result = null;
    if (revertModal.type === "last") {
      result = await commit("planning-revert", () => api.revertPlanning(activeNovel.id, {
        branchId: activeBranchId
      }), "");
      if (result?.userMessage) setInput(result.userMessage);
      if (result) {
        syncThreadMessagesFromResult(result);
        setCurrentRun(null);
        setLiveRunStreams({});
        setVersionDrawerVisible(false);
        notify("success", result.snapshotRestored ? "已回退当前会话上一轮的资料快照和消息" : "已撤回当前会话上一轮消息，原文已放回输入框");
      }
    } else if (revertModal.type === "checkpoint") {
      if (!revertModal.runId || !revertModal.checkpointId) return false;
      result = await commit("planning-checkpoint-revert", () => api.revertPlanningCheckpoint(activeNovel.id, revertModal.runId, revertModal.checkpointId), "已回退到本轮细节");
    }
    if (result) {
      setRevertModal({ type: "", runId: "", checkpointId: "" });
      return true;
    }
    return false;
  };

  const createSession = () => {
    setSessionModal({ type: "create", branch: null, label: "" });
  };

  const renameSession = (branch) => {
    if (!branch?.id) return;
    setSessionModal({ type: "rename", branch, label: branch.label || "" });
  };

  const deleteSession = async (branch) => {
    if (!branch?.id || branch.id === "main") return;
    const branchLabel = branch.label || branch.id;
    const result = await runSessionMutation("delete", branch.id, () => api.deletePlanningBranch(activeNovel.id, branch.id), `已删除会话：${branchLabel}`);
    if (result) syncSessionState(result, { openThreadDrawer: false });
  };

  const forkSession = async (branch) => {
    if (!branch?.id) return;
    setSessionModal({
      type: "fork",
      branch,
      label: `派生：${branch.label || (branch.id === "main" ? "主会话" : branch.id.slice(-6))}`
    });
  };

  const clearSession = (branch) => {
    if (!branch?.id) return;
    setSessionModal({ type: "clear", branch, label: branch.label || "" });
  };

  const cleanupSessions = () => {
    setSessionModal({ type: "cleanup", branch: null, label: "" });
  };

  const openDrawerByCommand = (drawer) => {
    if (drawer === "context") openContextDrawer();
    if (drawer === "thread") openThreadDrawer();
    if (drawer === "history") openVersionDrawer();
    if (drawer === "file") openFileDrawer();
    if (drawer === "model") openModelDrawer();
  };

  const runDoctor = async () => {
    if (!activeNovel?.id) return false;
    setContextDrawerVisible(false);
    setVersionDrawerVisible(false);
    setThreadDrawerVisible(false);
    setModelDrawerVisible(false);
    setFileDrawerVisible(false);
    setTranscriptDrawerVisible(false);
    setDoctorReport(null);
    setDoctorDrawerVisible(true);
    const result = await commit("planning-doctor", () => api.planningDoctor(activeNovel.id), "Agent 环境诊断已完成");
    if (result?.report) setDoctorReport(result.report);
    return Boolean(result?.report);
  };

  const openRunTranscript = async (runId) => {
    if (!activeNovel?.id || !runId) return false;
    const sourceRun = runHistory.find((run) => run.id === runId) || currentRun || activeHistoryRun || null;
    setContextDrawerVisible(false);
    setVersionDrawerVisible(false);
    setThreadDrawerVisible(false);
    setModelDrawerVisible(false);
    setFileDrawerVisible(false);
    setDoctorDrawerVisible(false);
    setRunTranscript(buildPlanningRunTranscriptSkeleton(sourceRun, runId));
    setRunTranscriptError("");
    setRunTranscriptSlow(false);
    setRunTranscriptLoadingId(runId);
    setTranscriptDrawerVisible(true);
    const slowTimer = window.setTimeout(() => {
      setRunTranscriptSlow(true);
    }, 6000);
    try {
      const result = await api.planningRunTranscript(activeNovel.id, runId, {
        maxTextChars: 32000
      });
      if (result?.transcript) {
        setRunTranscript(result.transcript);
        return true;
      }
      setRunTranscriptError("后端没有返回本轮过程详情。");
      return false;
    } catch (error) {
      setRunTranscriptError(error?.message || "读取本轮过程详情失败");
      showError(error);
      return false;
    } finally {
      window.clearTimeout(slowTimer);
      setRunTranscriptLoadingId((previous) => previous === runId ? "" : previous);
      setRunTranscriptSlow(false);
    }
  };

  const queuePlannerCommand = (command, argument = "") => {
    const payload = {
      command,
      argument: String(argument || "").trim(),
      queuedAt: new Date().toISOString()
    };
    queuedCommandRef.current = payload;
    clearQueuedDraft();
    setQueuedCommand(payload);
    clearComposerDraft();
    notify("success", "已暂存下一条命令；当前运行结束后自动执行");
    return true;
  };

  const queueNextAgentMessage = (options = {}) => {
    const activeEditDraft = options.forkDraft?.mode === "edit_from_message" ? options.forkDraft : messageEditDraft;
    if (activeEditDraft?.mode === "edit_from_message") {
      notify("warning", "正在就地编辑一条旧消息。编辑重发不能排到下一条，请先停止当前运行或等它结束。");
      return false;
    }
    const fileSnapshot = options.files ? safeArray(options.files).map(normalizePlanningComposerAttachmentFile).filter(Boolean) : droppedFiles;
    const mentionSnapshot = options.mentions ? safeArray(options.mentions) : mentionRefs;
    const activeForkDraft = options.forkDraft !== undefined ? options.forkDraft : forkDraft;
    const preserveComposerDraft = Boolean(options.preserveComposerDraft);
    const message = String(options.message || input).trim() || (fileSnapshot.length ? `请阅读我拖入的 ${fileSnapshot.length} 个文件。` : "");
    if (!message) {
      notify("warning", "请输入要排到下一条的消息");
      return false;
    }
    const parsedCommand = fileSnapshot.length === 0 ? parsePlanningSlashCommand(message) : null;
    const slashCommand = parsedCommand ? findPlannerSlashCommandByName(parsedCommand.name) : null;
    if (slashCommand) {
      return queuePlannerCommand(slashCommand, parsedCommand.argument);
    }
    const submittedMessage = String(options.submittedMessage || "").trim() || buildPlanningComposerSubmissionMessage(message, {
      mode: agentMode,
      goal: agentGoal,
      mentions: mentionSnapshot,
      files: fileSnapshot
    });
    queuedDraftRef.current = message;
    queuedDraftPayloadRef.current = {
      raw: message,
      submitted: submittedMessage,
      mentions: mentionSnapshot,
      files: fileSnapshot.map(normalizePlanningComposerAttachmentFile).filter(Boolean),
      forkDraft: activeForkDraft || null
    };
    clearQueuedCommand();
    setQueuedDraft(message);
    if (!preserveComposerDraft) clearComposerDraft();
    notify("success", "已排到当前运行之后");
    return true;
  };

  const queueComposerSnapshotAsNextMessage = () => queueNextAgentMessage({
    message: input,
    mentions: mentionRefs,
    files: droppedFiles,
    forkDraft,
    preserveComposerDraft: false
  });

  const applyGoalDraft = () => {
    const nextGoal = goalDraft.trim();
    setAgentGoal(nextGoal);
    setGoalEditing(false);
    notify("success", nextGoal ? "当前目标已更新" : "当前目标已清除");
  };

  const startGoalEditing = () => {
    setGoalDraft(agentGoal);
    setGoalEditing(true);
    window.requestAnimationFrame(() => composerInputRef.current?.focus?.());
  };

  const executePlannerCommand = (command, options = {}) => {
    if (!command) return false;
    const argument = String(options.argument || "").trim();
    if (options.queueIfRunning !== false && liveRun && !isPlanningRunDisplayTerminal(liveRun)) {
      return queuePlannerCommand(command, argument);
    }
    if (command.kind === "drawer") {
      setInput("");
      openDrawerByCommand(command.drawer);
      return true;
    }
    if (command.kind === "doctor") {
      setInput("");
      runDoctor();
      return true;
    }
    if (command.kind === "mode") {
      setAgentMode(command.mode || "auto");
      setInput("");
      notify("success", command.mode === "auto" ? "已交给 Agent 智能判断" : `已设置执行偏好：${plannerModeLabel(command.mode)}`);
      return true;
    }
    if (command.kind === "goal") {
      if (argument) {
        setAgentGoal(argument);
        setGoalDraft(argument);
        setGoalEditing(false);
        setInput("");
        notify("success", "当前目标已更新");
      } else {
        setGoalDraft(agentGoal);
        setGoalEditing(true);
        setInput("");
      }
      return true;
    }
    if (command.kind === "prompt") {
      const prompt = argument ? `${command.prompt}\n\n补充要求：${argument}` : command.prompt;
      if (options.submitPrompt) {
        setInput("");
        startAgent(prompt);
      } else {
        setInput(prompt);
        window.requestAnimationFrame(() => composerInputRef.current?.focus?.());
      }
      return true;
    }
    return false;
  };

  const executeSlashInput = (message, options = {}) => {
    const parsed = parsePlanningSlashCommand(message);
    if (!parsed) return false;
    const command = findPlannerSlashCommandByName(parsed.name);
    if (!command) return false;
    return executePlannerCommand(command, { argument: parsed.argument, submitPrompt: options.submitPrompt });
  };

  const selectMention = (mention) => {
    setMentionRefs((current) => {
      if (current.some((item) => item.id === mention.id)) return current;
      return [...current, mention].slice(-8);
    });
    setInput((current) => replaceComposerMentionTrigger(current, mention));
    window.requestAnimationFrame(() => composerInputRef.current?.focus?.());
  };

  const removeMention = (mentionId) => {
    setMentionRefs((current) => current.filter((item) => item.id !== mentionId));
  };

  const removeDroppedFile = (fileId) => {
    setDroppedFiles((current) => current.filter((file) => file.id !== fileId));
  };

  const addDroppedPlannerFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const unsupported = [];
    const tooLarge = [];
    const failed = [];
    const additions = [];
    for (const file of files) {
      const name = file.name || "未命名文件";
      if (!isPlannerDroppedTextFile(file)) {
        unsupported.push(name);
        continue;
      }
      if (Number(file.size || 0) > PLANNING_DROPPED_FILE_MAX_BYTES) {
        tooLarge.push(`${name}（${formatPlanningFileSize(file.size)}）`);
        continue;
      }
      try {
        const text = await fileToText(file);
        const clipped = clipPlanningDroppedFileText(text);
        additions.push({
          id: `drop:${name}:${file.size || 0}:${file.lastModified || 0}:${clipped.originalChars}`,
          type: "dropped_file",
          typeLabel: "文件",
          color: "cyan",
          label: name,
          detail: `${formatPlanningFileSize(file.size)}${clipped.truncated ? " · 已截取" : ""}`,
          name,
          size: file.size || 0,
          lastModified: file.lastModified || 0,
          text: clipped.text,
          truncated: clipped.truncated,
          originalChars: clipped.originalChars
        });
      } catch {
        failed.push(name);
      }
    }
    const existingIds = new Set(droppedFiles.map((file) => file.id));
    const acceptedAdditions = additions
      .filter((addition) => !existingIds.has(addition.id))
      .slice(0, Math.max(0, PLANNING_DROPPED_FILE_LIMIT - droppedFiles.length));
    if (acceptedAdditions.length > 0) {
      setDroppedFiles((current) => {
        const next = [...current];
        const existing = new Set(next.map((file) => file.id));
        for (const addition of acceptedAdditions) {
          if (existing.has(addition.id) || next.length >= PLANNING_DROPPED_FILE_LIMIT) continue;
          next.push(addition);
          existing.add(addition.id);
        }
        return next;
      });
      notify("success", `已加入 ${acceptedAdditions.length} 个文件到本轮消息`);
    }
    if (additions.length > acceptedAdditions.length) {
      notify("warning", `本轮最多保留 ${PLANNING_DROPPED_FILE_LIMIT} 个拖入文件，重复或超出的文件已忽略`);
    }
    if (unsupported.length > 0) notify("warning", `暂不支持直接拖入这些非文本文件：${shortText(unsupported.join("、"), 120)}`);
    if (tooLarge.length > 0) notify("warning", `文件过大，建议放到工作区让 Agent 读取：${shortText(tooLarge.join("、"), 120)}`);
    if (failed.length > 0) notify("error", `读取失败：${shortText(failed.join("、"), 120)}`);
  };

  const isFileDragEvent = (event) => Array.from(event?.dataTransfer?.types || []).includes("Files");

  const handleComposerDragEnter = (event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleComposerDragOver = (event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const handleComposerDragLeave = (event) => {
    if (!dragActive && !isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleComposerDrop = (event) => {
    if (!isFileDragEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    addDroppedPlannerFiles(event.dataTransfer?.files).catch(showError);
  };

  const sessionModalTitle = {
    create: "新建 Agent 会话",
    fork: "派生 Agent 会话",
    rename: "重命名 Agent 会话",
    delete: "删除 Agent 会话",
    clear: "清空 Agent 会话",
    cleanup: "清理会话列表"
  }[sessionModal.type] || "Agent 会话";
  const sessionModalOkText = {
    create: "新建并切换",
    fork: "派生并切换",
    rename: "保存名称",
    delete: "删除会话",
    clear: "清空会话",
    cleanup: "清理"
  }[sessionModal.type] || "确定";
  const sessionModalLoadingKey = {
    create: "planning-session-create",
    fork: "planning-session-fork",
    rename: "planning-session-rename",
    delete: "planning-session-delete",
    clear: "planning-session-clear",
    cleanup: "planning-session-cleanup"
  }[sessionModal.type] || "";
  const revertModalTitle = revertModal.type === "checkpoint" ? "回退到当前轮细节" : "回退当前会话上一轮";
  const revertModalLoadingKey = revertModal.type === "checkpoint" ? "planning-checkpoint-revert" : "planning-revert";
  const collapseDrawerDetails = () => setDrawerCollapseResetKey((key) => key + 1);
  const drawerCloseFooter = (onClose, label = "关闭抽屉", onCollapseAll = null) => (
    <div className="agent-drawer-footer">
      <Text type="secondary">关闭只收起当前抽屉，不影响会话和运行。</Text>
      <Space size={8}>
        {onCollapseAll && <Button icon={<IconArrowUp />} onClick={onCollapseAll}>收起展开项</Button>}
        <Button icon={<IconClose />} onClick={onClose}>{label}</Button>
      </Space>
    </div>
  );

  return (
    <>
      <div className={`planning-agent-workspace ${workspaceRailCollapsed ? "rail-collapsed" : "rail-open"}`} ref={agentShellRef}>
        <div className="codex-agent-shell">
          <section className="codex-thread" ref={agentThreadRef}>
        <AgentTopReveal
          anchorRef={agentShellRef}
          activeNovel={activeNovel}
          providers={providers}
          busy={busy}
          liveRun={liveRun}
          pageTitle={currentPageLabel || "策划 Agent"}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          onOpenBackground={openBackground}
          onRefreshApp={refresh}
          appLoading={appLoading}
          surfaceVars={surfaceVars}
          onOpenContext={openContextDrawer}
          onOpenThreads={openThreadDrawer}
          onOpenHistory={openVersionDrawer}
          onOpenFile={openFileDrawer}
          onOpenModel={openModelDrawer}
          onSwitchModel={switchPlannerModel}
        />
        <div className="codex-thread-body" ref={threadBodyRef} onScroll={handleThreadScroll}>
          <PlanningConversationThread
            messages={messages}
            run={displayRun}
            liveRun={liveRun}
            liveRunStreams={liveRunStreams}
            busy={busy}
            hiddenMessageCount={hiddenMessageCount}
            hasOlderMessages={hasOlderMessages}
            loadingOlderMessages={loadingOlderMessages}
            runById={runById}
            latestAuditableRun={latestAuditableRun}
            messageEditDraft={messageEditDraft}
            messageEditSubmitting={composerSubmitting}
            messageEndRef={messageEndRef}
            onCancel={cancelRun}
            onDecideApproval={decideApproval}
            onRevertCheckpoint={revertCheckpoint}
            onOpenHistory={openVersionDrawer}
            onReturnToMessage={returnToMessage}
            onChangeMessageEdit={changeMessageEditDraft}
            onCancelMessageEdit={cancelMessageEditDraft}
            onSubmitMessageEdit={submitMessageEditDraft}
            onOpenTranscript={openRunTranscript}
            onDraftPrompt={draftStarterPrompt}
          />
        </div>

        <div
          className="codex-composer-wrap"
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          <div className={`codex-composer ${liveRun ? "is-live" : ""} ${composerHasContent ? "has-text" : ""} ${droppedFiles.length ? "has-files" : ""} ${dragActive ? "is-dragging" : ""}`}>
            {dragActive && (
              <div className="codex-drop-hint">
                <IconFile />
                <span>松开加入本轮消息上下文</span>
              </div>
            )}
            <PlanningGoalLine
              goal={agentGoal}
              draft={goalDraft}
              editing={goalEditing}
              liveRun={liveRun}
              onDraftChange={setGoalDraft}
              onEdit={startGoalEditing}
              onApply={applyGoalDraft}
              onCancel={() => {
                setGoalDraft(agentGoal);
                setGoalEditing(false);
              }}
              onClear={() => {
                setAgentGoal("");
                setGoalDraft("");
                setGoalEditing(false);
              }}
            />
            {commandQuery !== null && commandItems.length > 0 && (
              <PlanningSlashCommandMenu
                commands={commandItems}
                onSelect={(command) => executePlannerCommand(command)}
              />
            )}
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <PlanningMentionMenu
                mentions={mentionCandidates}
                onSelect={selectMention}
              />
            )}
            {(mentionRefs.length > 0 || droppedFiles.length > 0) && (
              <div className="codex-mention-strip">
                {mentionRefs.map((mention) => (
                  <Tag
                    key={mention.id}
                    color={mention.color}
                    closable
                    onClose={(event) => {
                      event?.stopPropagation?.();
                      removeMention(mention.id);
                    }}
                  >
                    {mention.typeLabel} · {shortText(mention.label, 28)}
                  </Tag>
                ))}
                {droppedFiles.map((file) => (
                  <Tag
                    key={file.id}
                    color={file.color || "cyan"}
                    icon={<IconFile />}
                    closable
                    onClose={(event) => {
                      event?.stopPropagation?.();
                      removeDroppedFile(file.id);
                    }}
                  >
                    文件 · {shortText(file.name || file.label, 28)}
                    <span className="codex-file-chip-meta">{file.truncated ? "截取" : formatPlanningFileSize(file.size)}</span>
                  </Tag>
                ))}
              </div>
            )}
            <div className="codex-composer-main">
              <TextArea
                ref={composerInputRef}
                className="codex-composer-input"
                value={input}
                onChange={setInput}
                onKeyDown={handleComposerKeyDown}
                autoSize={{ minRows: 1, maxRows: 8 }}
                placeholder={liveRun ? "运行中可直接补充一句话..." : "给策划 Agent 发消息，或直接粘贴资料..."}
              />
              <div className="codex-composer-primary">
                {liveRun ? (
                  <>
                    <Button className="codex-send-button compact" type="primary" icon={<IconArrowUp />} onClick={queueComposerSnapshotAsNextMessage} disabled={!composerHasContent}>
                      <span className="codex-send-label">发送</span>
                    </Button>
                    <Button className="codex-icon-action" aria-label="追加到当前运行" icon={<IconThunderbolt />} onClick={steerCurrentRun} loading={busy === "planning-steer"} disabled={!composerHasContent} />
                    <Button className="codex-icon-action codex-stop-action" aria-label="停止当前运行" status="danger" icon={<IconRecordStop />} onClick={cancelRun} loading={busy === "planning-cancel"} />
                  </>
                ) : (
                  <Button className="codex-send-button" type="primary" icon={<IconArrowUp />} onClick={() => startAgent()} disabled={!composerHasContent || composerSubmitting}>
                    发送
                  </Button>
                )}
              </div>
            </div>
            {queuedDraft && (
              <div className="codex-composer-statebar queued">
                <div className="codex-composer-statebar-main">
                  <Tag color="orange">下一条</Tag>
                  {queuedDraftPayload?.forkDraft && <Tag color="purple" icon={<IconBranch />}>从消息继续</Tag>}
                  <Text>当前运行结束后自动发送</Text>
                  <Text type="secondary">{shortText(queuedDraft, 120)}</Text>
                  {safeArray(queuedDraftPayload?.files).map((file) => (
                    <Tag key={file.id || file.name} color={file.color || "cyan"} icon={<IconFile />}>
                      文件 · {shortText(file.name || file.label, 24)}
                    </Tag>
                  ))}
                </div>
                <Button size="mini" type="text" icon={<IconClose />} onClick={clearQueuedDraft}>取消</Button>
              </div>
            )}
            {queuedCommand && (
              <div className="codex-composer-statebar queued command">
                <div className="codex-composer-statebar-main">
                  <Tag color={queuedCommand.command?.color || "orange"}>下一条命令</Tag>
                  <Text>{queuedCommand.command?.label || queuedCommand.command?.command}</Text>
                  {queuedCommand.argument && <Text type="secondary">{shortText(queuedCommand.argument, 120)}</Text>}
                </div>
                <Button size="mini" type="text" icon={<IconClose />} onClick={clearQueuedCommand}>取消</Button>
              </div>
            )}
            <div className="codex-composer-toolbar">
              <div className="codex-composer-tools">
                <PlannerModeChip value={agentMode} onChange={setAgentMode} />
                <PlannerModelInlineSwitch
                  activeNovel={activeNovel}
                  providers={providers}
                  busy={busy}
                  onSubmit={switchPlannerModel}
                />
                <PlannerPermissionInlineSwitch
                  value={visiblePermissionMode}
                  busy={busy}
                  onChange={switchPlannerPermissionMode}
                />
              </div>
              <Text className="codex-composer-shortcut" type="secondary">{liveRun ? "Enter 发送 · 运行中自动排队" : "Enter 发送 · Shift+Enter 换行"}</Text>
            </div>
            <PlanningComposerStatusLine items={statusLineItems} />
          </div>
        </div>
          </section>
        </div>

        <PlanningWorkspaceRail
          activeNovel={activeNovel}
          branchState={{ activeBranchId, branches: planningBranches }}
          runs={visibleCurrentRun ? [visibleCurrentRun, ...runHistory.filter((run) => run.id !== visibleCurrentRun.id)] : runHistory}
          liveRun={liveRun}
          busy={busy}
          sessionBusy={sessionBusy}
          collapsed={workspaceRailCollapsed}
          onToggle={() => setWorkspaceRailCollapsed((value) => !value)}
          onSwitch={switchBranch}
          onCreateSession={createSession}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          onForkSession={forkSession}
          onCleanupSessions={cleanupSessions}
          onOpenHistory={openVersionDrawer}
          onOpenContext={openContextDrawer}
          onOpenFile={openFileDrawer}
          onOpenModel={openModelDrawer}
          onOpenTranscript={openRunTranscript}
        />
      </div>

      <Drawer width={760} title="过程与资料" visible={contextDrawerVisible} footer={null} onCancel={() => setContextDrawerVisible(false)}>
        <WorkspaceDrawerShell>
          <PlanningContextPanel
            key={`context-${drawerCollapseResetKey}`}
            lastAssistant={lastAssistant}
            activeNovel={activeNovel}
            activeBranchId={activeBranchId}
            providers={providers}
            busy={busy}
            commit={commit}
          />
        </WorkspaceDrawerShell>
      </Drawer>

      <Modal
        title={sessionModalTitle}
        visible={Boolean(sessionModal.type)}
        okText={sessionModalOkText}
        cancelText="取消"
        confirmLoading={busy === sessionModalLoadingKey}
        okButtonProps={["delete", "clear"].includes(sessionModal.type) ? { status: "danger" } : undefined}
        onOk={submitSessionModal}
        onCancel={closeSessionModal}
      >
        {sessionModal.type === "create" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text type="secondary">新会话会拥有独立消息流、运行历史、已保存原文和回退范围，适合探索另一种策划方向。</Text>
            <Input
              value={sessionModal.label}
              placeholder="会话名称，例如：第二章方案"
              onChange={(value) => setSessionModal((current) => ({ ...current, label: value }))}
            />
          </Space>
        )}
        {sessionModal.type === "fork" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text type="secondary">派生会复制源会话到当前消息为止的可见上下文，然后在新会话里继续；旧会话不会被覆盖。</Text>
            <Input
              value={sessionModal.label}
              placeholder="派生会话名称"
              onChange={(value) => setSessionModal((current) => ({ ...current, label: value }))}
            />
          </Space>
        )}
        {sessionModal.type === "rename" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text type="secondary">只修改当前会话在列表里的显示名称，不改变消息、运行历史或小说资料。</Text>
            <Input
              value={sessionModal.label}
              placeholder="输入新的会话名称"
              onChange={(value) => setSessionModal((current) => ({ ...current, label: value }))}
            />
          </Space>
        )}
        {sessionModal.type === "delete" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Alert type="warning" content="这会从会话列表中移除该会话，但保留审计记录。当前会话如果被删除，会自动切回主会话。" />
            <Text>将删除：{sessionModal.branch?.label || sessionModal.branch?.id || "未命名会话"}</Text>
          </Space>
        )}
        {sessionModal.type === "clear" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Alert type="warning" content="这只清空这个会话里的可见对话、运行历史和版本审计，不删除小说档案、记忆、世界书、角色卡或扮演配置。主会话也可以清空，但不能删除。" />
            <Text>将清空：{sessionModal.branch?.label || sessionModal.branch?.id || "当前会话"}</Text>
          </Space>
        )}
        {sessionModal.type === "cleanup" && (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Alert type="info" content="只会移除已删除、已归档或没有消息和运行记录的非当前会话；不会清空有内容的会话，也不会影响当前会话。" />
          </Space>
        )}
      </Modal>

      <Drawer width={820} title="当前会话记录" visible={versionDrawerVisible} footer={null} onCancel={() => setVersionDrawerVisible(false)}>
        <WorkspaceDrawerShell>
          <PlanningHistoryVersionPanel
            key={`history-${drawerCollapseResetKey}`}
            activeNovel={activeNovel}
            runs={branchScopedRuns}
            allRuns={runHistory}
            activeBranchId={activeBranchId}
            activeBranchLabel={activeBranchSummary?.label || (activeBranchId === "main" ? "主会话" : activeBranchId)}
            busy={busy}
            commit={commit}
            canRestoreLast={canRestoreCurrentTask}
            onRestoreLast={revertLast}
            onRevertCheckpoint={revertCheckpoint}
            onOpenTranscript={openRunTranscript}
          />
        </WorkspaceDrawerShell>
      </Drawer>

      <Modal
        title={revertModalTitle}
        visible={Boolean(revertModal.type)}
        okText="回退"
        cancelText="取消"
        confirmLoading={busy === revertModalLoadingKey}
        okButtonProps={{ status: "warning" }}
        onOk={submitRevertModal}
        onCancel={closeRevertModal}
      >
        {revertModal.type === "checkpoint" ? (
          <Alert type="warning" content="这是当前轮对话内部的细节回退，会恢复当时的档案、记忆、世界书、角色和行文状态。主流程仍建议优先使用“回退当前会话上一轮”。" />
        ) : (
          <Alert type="warning" content="优先回退当前会话上一轮的业务快照；如果这轮没有写入资料，就只撤回本轮用户消息和 Agent 回复，并把用户原文放回输入框。" />
        )}
      </Modal>

      <PlanningApprovalToast
        entry={pendingApprovalEntry}
        scope={approvalScope}
        busy={busy}
        onScopeChange={setApprovalScope}
        onDecide={decideApproval}
      />

      <Drawer width={520} title="策划模型" visible={modelDrawerVisible} footer={null} onCancel={() => setModelDrawerVisible(false)}>
        <PlannerModelQuickSwitch
          activeNovel={activeNovel}
          providers={providers}
          busy={busy}
          onSubmit={switchPlannerModel}
        />
      </Drawer>

      <Drawer width={690} title="工作区文件" visible={fileDrawerVisible} footer={null} onCancel={() => setFileDrawerVisible(false)}>
        <WorkspaceDrawerShell>
          <LocalFileSearchPanel activeNovel={activeNovel} busy={busy} commit={commit} />
        </WorkspaceDrawerShell>
      </Drawer>

      <Drawer width={660} title="Agent 环境诊断" visible={doctorDrawerVisible} footer={null} onCancel={() => setDoctorDrawerVisible(false)}>
        <WorkspaceDrawerShell>
          <PlanningDoctorPanel key={`doctor-${drawerCollapseResetKey}`} report={doctorReport} loading={busy === "planning-doctor"} />
        </WorkspaceDrawerShell>
      </Drawer>

      <Drawer width={780} title="本轮过程详情" visible={transcriptDrawerVisible} footer={null} onCancel={() => setTranscriptDrawerVisible(false)}>
        <WorkspaceDrawerShell>
          <PlanningRunTranscriptPanel
            key={`transcript-${drawerCollapseResetKey}`}
            transcript={runTranscript}
            loading={Boolean(runTranscriptLoadingId)}
            slow={runTranscriptSlow}
            error={runTranscriptError}
          />
        </WorkspaceDrawerShell>
      </Drawer>
    </>
  );
}

function PlanningApprovalToast({ entry, scope, busy, onScopeChange, onDecide }) {
  if (!entry?.approval || !entry?.run?.id) return null;
  const approval = entry.approval;
  const operations = safeArray(approval.operations);
  const visibleOperations = operations.slice(0, 1);
  const hiddenOperationCount = Math.max(0, operations.length - visibleOperations.length);
  const reason = approval.reason || "Agent 需要访问受保护对象";
  const scopes = [
    { value: "once", label: "本次" },
    { value: "session", label: "会话" },
    { value: "persistent", label: "工作区" }
  ];
  const layer = (
    <section className="agent-approval-toast" role="dialog" aria-live="assertive" aria-label="权限确认">
      <div className="agent-approval-toast-head">
        <div className="agent-approval-toast-title">
          <span className="agent-approval-toast-dot" aria-hidden="true" />
          <Text>权限确认</Text>
        </div>
        <Text className="agent-approval-toast-reason" title={reason}>{reason}</Text>
      </div>
      <div className="approval-operation-list compact agent-approval-toast-ops">
        {visibleOperations.length ? visibleOperations.map((operation, index) => {
          const type = String(operation?.type || operation?.action || "工具");
          const summary = approvalOperationSummary(operation);
          return (
            <div key={`${approval.id}-${index}`} className="approval-operation-row">
              <Tag color={type === "runShell" ? "orange" : "arcoblue"}>{planningToolKindLabel(type)}</Tag>
              <Text title={summary}>{shortText(summary, 90)}</Text>
            </div>
          );
        }) : (
          <div className="approval-operation-row">
            <Tag color="orange">受保护</Tag>
            <Text>等待确认后继续当前会话</Text>
          </div>
        )}
        {hiddenOperationCount > 0 && <Text className="agent-approval-toast-more">还有 {hiddenOperationCount} 个操作，完整内容在本轮步骤里。</Text>}
      </div>
      <div className="agent-approval-toast-scope" role="group" aria-label="授权范围">
        {scopes.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`approval-scope-chip ${scope === item.value ? "active" : ""}`}
            onClick={() => onScopeChange?.(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="agent-approval-toast-actions">
        <Button
          size="mini"
          loading={busy === "planning-approval-rejected"}
          onClick={() => onDecide?.(entry.run.id, approval.id, "rejected", "once")}
        >
          拒绝
        </Button>
        <Button
          size="mini"
          type="primary"
          loading={busy === "planning-approval-approved" || busy === "planning-chat-start"}
          onClick={() => onDecide?.(entry.run.id, approval.id, "approved", scope)}
        >
          允许继续
        </Button>
      </div>
    </section>
  );
  return layer;
}

function PlanningGoalLine({ goal, draft, editing, liveRun, onDraftChange, onEdit, onApply, onCancel, onClear }) {
  if (!goal && !editing) return null;
  return (
    <div className={`codex-goal-line ${goal ? "has-goal" : ""} ${editing ? "is-editing" : ""}`}>
      {editing ? (
        <>
          <Tag color="purple" icon={<IconMindMapping />}>目标</Tag>
          <Input
            size="small"
            value={draft}
            onChange={onDraftChange}
            onPressEnter={onApply}
            placeholder="例如：完成第一章写前定位并修正角色卡冲突"
          />
          <Button size="mini" type="primary" onClick={onApply}>保存</Button>
          <Button size="mini" onClick={onCancel}>取消</Button>
        </>
      ) : (
        <>
          <div className="codex-goal-copy">
            <Tag color={goal ? "purple" : "gray"} icon={<IconMindMapping />}>目标</Tag>
            <Text>{goal || "未设定持续目标"}</Text>
            {liveRun && <Tag color="orange">{planningRunStatusLabel(liveRun.status)}</Tag>}
          </div>
          <Space size={6}>
            <Button size="mini" icon={<IconEdit />} onClick={onEdit}>{goal ? "编辑" : "设定"}</Button>
            {goal && <Button size="mini" icon={<IconClose />} onClick={onClear}>清除</Button>}
          </Space>
        </>
      )}
    </div>
  );
}

function PlanningSlashCommandMenu({ commands, onSelect }) {
  return (
    <div className="codex-composer-palette command-palette">
      <div className="composer-palette-head">
        <Tag color="arcoblue" icon={<IconCode />}>/ 命令</Tag>
        <Text type="secondary">入口 / 快捷草稿</Text>
      </div>
      <div className="composer-palette-list">
        {commands.map((command) => (
          <button key={command.id} type="button" className="composer-palette-row" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(command)}>
            <span className="composer-palette-icon">{command.icon}</span>
            <span className="composer-palette-main">
              <span className="composer-palette-title">
                <Text bold>{command.command}</Text>
                <Tag color={command.color || "gray"}>{command.label}</Tag>
              </span>
              <Text type="secondary">{command.description}</Text>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlanningMentionMenu({ mentions, onSelect }) {
  return (
    <div className="codex-composer-palette mention-palette">
      <div className="composer-palette-head">
        <Tag color="green" icon={<IconArchive />}>@ 引用</Tag>
        <Text type="secondary">只附加证据指向</Text>
      </div>
      <div className="composer-palette-list">
        {mentions.map((mention) => (
          <button key={mention.id} type="button" className="composer-palette-row" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(mention)}>
            <span className="composer-palette-icon"><IconSearch /></span>
            <span className="composer-palette-main">
              <span className="composer-palette-title">
                <Text bold>{mention.label}</Text>
                <Tag color={mention.color}>{mention.typeLabel}</Tag>
              </span>
              <Text type="secondary">{mention.detail || mention.id}</Text>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlannerModeChip({ value, onChange }) {
  return (
    <Select
      className="planner-mode-chip"
      size="small"
      value={value}
      onChange={onChange}
      getPopupContainer={popupToBody}
      triggerProps={{ autoAlignPopupWidth: false }}
    >
      {plannerModeOptions.map((mode) => (
        <Option key={mode.key} value={mode.key}>
          {mode.label}
        </Option>
      ))}
    </Select>
  );
}

function PlannerPermissionInlineSwitch({ value, busy, onChange }) {
  const options = [
    { value: "read_only", label: "只读" },
    { value: "auto_edit", label: "低风险" },
    { value: "ask_high_risk", label: "询问" },
    { value: "full_auto", label: "全自动" }
  ];
  return (
    <Select
      className="planner-permission-chip"
      size="small"
      value={value || "ask_high_risk"}
      loading={busy === "planner-permission-switch"}
      onChange={onChange}
      getPopupContainer={popupToBody}
      triggerProps={{ autoAlignPopupWidth: false }}
    >
      {options.map((option) => (
        <Option key={option.value} value={option.value}>
          {option.label}
        </Option>
      ))}
    </Select>
  );
}

function PlanningComposerStatusLine({ items }) {
  const visibleItems = safeArray(items).filter(Boolean);
  if (!visibleItems.length) return null;
  return (
    <div className="codex-statusline">
      {visibleItems.map((item) => (
        <Text key={item} type="secondary">{item}</Text>
      ))}
    </div>
  );
}

function PlanningDisclosureHeader({ label, meta }) {
  return (
    <span className="codex-disclosure-label">
      <IconArrowRight className="codex-disclosure-caret" />
      <span>{label}</span>
      {meta && <span className="codex-disclosure-meta">{meta}</span>}
    </span>
  );
}

function PlanningConversationThread({ messages, run, liveRun, liveRunStreams, busy, hiddenMessageCount, hasOlderMessages, loadingOlderMessages, runById, latestAuditableRun, messageEditDraft, messageEditSubmitting = false, messageEndRef, onCancel, onDecideApproval, onRevertCheckpoint, onOpenHistory, onReturnToMessage, onChangeMessageEdit, onCancelMessageEdit, onSubmitMessageEdit, onOpenTranscript, onDraftPrompt }) {
  const hasMessages = safeArray(messages).length > 0;
  const standaloneRun = run?.id && !safeArray(messages).some((message) => message?.role === "assistant" && message.runId === run.id)
    ? run
    : null;
  return (
    <div className="codex-messages">
      {!hasMessages && !run && (
        <div className="codex-empty-thread">
          <IconRobot />
          <Title heading={4}>从一句话开始</Title>
          <Paragraph>把资料、设定变更或下一章目标放到底部输入区，Agent 会沿当前会话继续推进。</Paragraph>
          <div className="codex-empty-suggestions">
            {planningStarterPrompts.map((item) => (
              <Button key={item.label} size="small" onClick={() => onDraftPrompt?.(item.prompt)}>{item.label}</Button>
            ))}
            {latestAuditableRun && (
              <Button size="small" icon={<IconFile />} onClick={() => onOpenTranscript?.(latestAuditableRun.id)}>
                查看最近运行
              </Button>
            )}
          </div>
        </div>
      )}

      {hasOlderMessages && (
        <div className="thread-history-sentinel">
          <Spin size={14} loading={loadingOlderMessages}>
            <Text type="secondary">{loadingOlderMessages ? "正在载入更早对话" : `上滑继续载入更早对话 · 还有 ${hiddenMessageCount} 条`}</Text>
          </Spin>
        </div>
      )}

      {safeArray(messages).map((message) => (
        <PlanningThreadMessage
          key={message.id}
          message={message}
          run={runById?.get(message.runId)}
          busy={busy}
          submitting={messageEditSubmitting}
          showRunTrail={Boolean(message.role === "assistant" && message.runId && runById?.get(message.runId))}
          editDraft={messageEditDraft?.messageId === message.id ? messageEditDraft : null}
          onReturnToMessage={onReturnToMessage}
          onChangeMessageEdit={onChangeMessageEdit}
          onCancelMessageEdit={onCancelMessageEdit}
          onSubmitMessageEdit={onSubmitMessageEdit}
          onOpenTranscript={onOpenTranscript}
        />
      ))}

      {standaloneRun && (
        <PlanningRunMessageBlock
          run={standaloneRun}
          liveRun={liveRun}
          liveStream={liveRunStreams?.[standaloneRun.id]}
          busy={busy}
          onCancel={onCancel}
          onDecideApproval={onDecideApproval}
          onRevertCheckpoint={onRevertCheckpoint}
          onOpenHistory={onOpenHistory}
          onOpenTranscript={onOpenTranscript}
        />
      )}
      <div ref={messageEndRef} />
    </div>
  );
}

function PlanningBranchSwitcher({ branches, activeBranchId, busy, onSwitch }) {
  const options = safeArray(branches);
  if (options.length <= 1) {
    return <Tag color="arcoblue" icon={<IconBranch />}>主会话</Tag>;
  }
  return (
    <Select
      className="planning-branch-switch"
      size="small"
      value={activeBranchId || "main"}
      onChange={onSwitch}
      loading={busy === "planning-branch-switch"}
      getPopupContainer={popupToBody}
      triggerProps={{ autoAlignPopupWidth: false }}
    >
      {options.map((branch) => (
        <Option key={branch.id} value={branch.id}>
          {branch.label || (branch.id === "main" ? "主会话" : `会话 ${branch.id.slice(-6)}`)}
        </Option>
      ))}
    </Select>
  );
}

function PlanningThreadSwitchPanel({ branchState, runs, busy, sessionBusy = {}, onSwitch, onCreateSession, onRenameSession, onDeleteSession, onForkSession, onClearSession, onCleanupSessions, onOpenHistory }) {
  const activeBranchId = branchState?.activeBranchId || "main";
  const runMap = new Map(safeArray(runs).map((run) => [run.id, run]));
  const branches = safeArray(branchState?.branches).length
    ? safeArray(branchState.branches).filter((branch) => !branch.deletedAt)
    : [{ id: "main", label: "主会话", messageCount: 0, runCount: 0, active: true }];
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranchId);
  useEffect(() => {
    setSelectedBranchId(activeBranchId);
  }, [activeBranchId]);
  useEffect(() => {
    if (!branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(activeBranchId);
    }
  }, [activeBranchId, branches, selectedBranchId]);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) || branches.find((branch) => branch.id === activeBranchId) || branches[0] || null;
  const latestRun = selectedBranch?.latestRunId ? runMap.get(selectedBranch.latestRunId) : null;
  const selectedRuns = safeArray(runs)
    .filter((run) => (run.branchId || "main") === (selectedBranch?.id || "main"))
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  const currentActivity = selectedRuns[0] || latestRun || null;
  const isDeletingBranch = (branchId) => Boolean(sessionBusy[`delete:${branchId}`] || busy === `planning-session-delete-${branchId}`);
  const openBranch = (branch) => {
    if (!branch?.id) return;
    setSelectedBranchId(branch.id);
    if (branch.id !== activeBranchId) onSwitch?.(branch.id);
  };
  return (
    <div className="planning-session-panel">
      <div className="planning-session-toolbar">
        <div>
          <Text bold>Agent 会话</Text>
          <Paragraph className="trace-reply">每条会话拥有独立消息流、运行历史、已保存原文和回退范围。</Paragraph>
        </div>
        <Tooltip content="创建一条新的 Agent 会话，后续消息不会污染当前会话。">
          <Button type="primary" size="small" icon={<IconPlus />} onClick={onCreateSession} loading={busy === "planning-session-create"}>
            新会话
          </Button>
        </Tooltip>
        <Tooltip content="清理已删除、已归档或没有内容的旧会话，不会影响当前会话。">
          <Button size="small" icon={<IconDelete />} onClick={onCleanupSessions} loading={busy === "planning-session-cleanup"}>
            清理空会话
          </Button>
        </Tooltip>
      </div>
      <div className="planning-session-layout">
        <div className="planning-thread-list">
        {branches.map((branch) => {
          const active = branch.id === activeBranchId;
          const selected = branch.id === selectedBranch?.id;
          const branchRun = branch.latestRunId ? runMap.get(branch.latestRunId) : null;
          const branchDeleting = isDeletingBranch(branch.id);
          return (
            <div
              key={branch.id}
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              className={`planning-thread-row ${active ? "active" : ""} ${selected ? "selected" : ""} ${branchDeleting ? "is-busy" : ""}`}
              onClick={() => openBranch(branch)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openBranch(branch);
                }
              }}
            >
              <div className="planning-thread-main">
                <div className="planning-thread-row-head">
                  <span className="planning-thread-current-dot" aria-hidden="true" />
                  <Text bold>{branch.label || branch.title || (branch.id === "main" ? "主会话" : `会话 ${branch.id.slice(-6)}`)}</Text>
                  <div className="planning-thread-row-actions" onClick={(event) => event.stopPropagation()}>
                    {branch.canResume && <Tag color="orange">未收束</Tag>}
                    {branchRun && <Tag color={planningRunTagColor(branchRun.status)}>{planningRunStatusLabel(branchRun.status)}</Tag>}
                    <Tooltip content="派生这个会话，旧会话不会被覆盖。">
                      <Button size="mini" type="text" icon={<IconBranch />} onClick={() => onForkSession?.(branch)} loading={busy === "planning-session-fork"} />
                    </Tooltip>
                    {branch.id !== "main" && (
                      <Popconfirm
                        title={`删除会话“${branch.label || branch.id}”？`}
                        content="只从列表移除，会话审计仍保留。"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ status: "danger" }}
                        onOk={() => {
                          onDeleteSession?.(branch);
                        }}
                      >
                        <Tooltip content="删除这个会话，不影响其它会话。">
                          <Button size="mini" type="text" status="danger" icon={<IconDelete />} loading={branchDeleting} />
                        </Tooltip>
                      </Popconfirm>
                    )}
                  </div>
                </div>
                <Text className="planning-thread-preview" type="secondary">
                  {branch.latestUserPreview || "还没有用户消息。"}
                </Text>
                <div className="planning-thread-row-meta">
                  <Text type="secondary">{branch.messageCount || 0} 条消息</Text>
                  <Text type="secondary">{branch.runCount || 0} 次运行</Text>
                  {branch.forked && <Text type="secondary">派生</Text>}
                  {branch.latestActivityAt && <Text type="secondary">{formatDate(branch.latestActivityAt)}</Text>}
                </div>
              </div>
            </div>
          );
        })}
        </div>
        <div className="planning-session-detail">
          {selectedBranch ? (
            <>
              <div className="planning-session-detail-head">
                <div>
                  <Text bold>{selectedBranch.label || selectedBranch.title || "未命名会话"}</Text>
                  <Paragraph className="trace-reply">
                    {selectedBranch.id === "main" ? "主会话" : selectedBranch.id}
                    {selectedBranch.parentBranchId ? ` · 派生自 ${selectedBranch.parentBranchId}` : ""}
                  </Paragraph>
                </div>
                <Tag color={selectedBranch.id === activeBranchId ? "green" : "gray"}>{selectedBranch.id === activeBranchId ? "当前" : "未打开"}</Tag>
              </div>
              <div className="agent-kpi-strip compact">
                <div><Text type="secondary">运行</Text><strong>{selectedBranch.runCount || 0}</strong></div>
                <div><Text type="secondary">消息</Text><strong>{selectedBranch.messageCount || 0}</strong></div>
                <div><Text type="secondary">最近运行</Text><strong>{currentActivity ? planningRunStatusLabel(currentActivity.status) : "无"}</strong></div>
                <div><Text type="secondary">更新时间</Text><strong>{formatDate(selectedBranch.latestActivityAt || selectedBranch.updatedAt)}</strong></div>
              </div>
              <Paragraph className="planning-session-detail-preview">
                {selectedBranch.latestUserPreview || "这个会话还没有用户消息。切换过去后可以从底部输入区开始。"}
              </Paragraph>
              {selectedRuns.length > 0 && (
                <div className="planning-session-activity-stack">
                  <Text type="secondary">最近活动</Text>
                  {selectedRuns.slice(0, 3).map((run) => (
                    <div key={run.id} className="planning-session-activity-row">
                      <Tag color={planningRunTagColor(run.status)}>{planningRunStatusLabel(run.status)}</Tag>
                      <div>
                        <Text>{shortText(run.userMessagePreview || run.id, 96)}</Text>
                        <Paragraph className="trace-reply">{run.id} · {formatDate(run.createdAt)}</Paragraph>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Space wrap>
                <Button
                  size="small"
                  type="primary"
                  disabled={selectedBranch.id === activeBranchId}
                  loading={busy === "planning-branch-switch"}
                  onClick={() => onSwitch?.(selectedBranch.id)}
                >
                  {selectedBranch.id === activeBranchId ? "正在此会话" : "切换到此会话"}
                </Button>
                <Tooltip content="从这个会话复制已有上下文，派生出新会话；旧会话不会被覆盖。">
                  <Button size="small" icon={<IconBranch />} onClick={() => onForkSession?.(selectedBranch)} loading={busy === "planning-session-fork"}>
                    派生
                  </Button>
                </Tooltip>
                <Tooltip content="只改这个会话的显示名称，不改任何小说资料。">
                  <Button size="small" icon={<IconEdit />} onClick={() => onRenameSession?.(selectedBranch)} loading={busy === "planning-session-rename"}>
                    重命名
                  </Button>
                </Tooltip>
                <Tooltip content="清空这个会话的对话、运行历史和版本审计；不会删除小说资料。主会话也可以清空。">
                  <Button size="small" icon={<IconUndo />} status="warning" onClick={() => onClearSession?.(selectedBranch)} loading={busy === "planning-session-clear"}>
                    清空会话
                  </Button>
                </Tooltip>
                <Tooltip content="查看这个会话的运行、会话版本和回退入口。">
                  <Button size="small" icon={<IconHistory />} onClick={onOpenHistory}>
                    当前会话记录
                  </Button>
                </Tooltip>
                {selectedBranch.id !== "main" && (
                  <Popconfirm
                    title={`删除会话“${selectedBranch.label || selectedBranch.id}”？`}
                    content="删除确认会立即收起，只在这个会话按钮上显示进度；不会锁住其它会话。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ status: "danger" }}
                    onOk={() => {
                      onDeleteSession?.(selectedBranch);
                    }}
                  >
                    <Tooltip content="软删除会话，审计记录仍保留；不会删除其它会话。">
                      <Button size="small" status="danger" icon={<IconDelete />} loading={isDeletingBranch(selectedBranch.id)}>
                        删除
                      </Button>
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            </>
          ) : (
            <Empty description="暂无会话。" />
          )}
        </div>
      </div>
    </div>
  );
}

function PlanningWorkspaceRail({ activeNovel, branchState, runs, liveRun, busy, sessionBusy = {}, collapsed, onToggle, onSwitch, onCreateSession, onRenameSession, onDeleteSession, onForkSession, onCleanupSessions, onOpenHistory, onOpenContext, onOpenFile, onOpenModel, onOpenTranscript }) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const activeBranchId = normalizeClientPlanningBranchId(branchState?.activeBranchId || "main");
  const branches = safeArray(branchState?.branches).length
    ? safeArray(branchState.branches).filter((branch) => !branch.deletedAt)
    : [{ id: "main", label: "主会话", messageCount: 0, runCount: 0, active: true }];
  const runMap = new Map();
  safeArray(runs).forEach((run) => {
    if (run?.id && !runMap.has(run.id)) runMap.set(run.id, run);
  });
  const runGroups = new Map();
  safeArray(runs)
    .slice()
    .sort((left, right) => String(right.createdAt || right.updatedAt || "").localeCompare(String(left.createdAt || left.updatedAt || "")))
    .forEach((run) => {
      const branchId = normalizeClientPlanningBranchId(run?.branchId || "main");
      if (!runGroups.has(branchId)) runGroups.set(branchId, []);
      runGroups.get(branchId).push(run);
    });
  const activeBranch = branches.find((branch) => branch.id === activeBranchId) || branches[0] || null;
  const activeBranchRuns = runGroups.get(activeBranchId) || [];
  const activeRun = liveRun && normalizeClientPlanningBranchId(liveRun.branchId || "main") === activeBranchId
    ? liveRun
    : activeBranchRuns[0] || null;
  const isDeletingBranch = (branchId) => Boolean(sessionBusy[`delete:${branchId}`] || busy === `planning-session-delete-${branchId}`);
  const branchTitle = (branch) => branch?.label || branch?.title || (branch?.id === "main" ? "主会话" : `会话 ${String(branch?.id || "").slice(-6)}`);
  const openBranch = (branch) => {
    if (!branch?.id) return;
    if (branch.id !== activeBranchId) onSwitch?.(branch.id);
  };
  const visibleBranches = branches.slice().sort((left, right) => {
    if (left.id === activeBranchId) return -1;
    if (right.id === activeBranchId) return 1;
    return String(right.latestActivityAt || right.updatedAt || "").localeCompare(String(left.latestActivityAt || left.updatedAt || ""));
  });
  const recentLimit = 5;
  const displayedBranches = showAllSessions ? visibleBranches : visibleBranches.slice(0, recentLimit);
  const hiddenSessionCount = Math.max(visibleBranches.length - displayedBranches.length, 0);
  const activeRunLive = activeRun && !isPlanningRunDisplayTerminal(activeRun);
  const railCommands = [
    {
      key: "new",
      label: "新会话",
      description: "在当前小说下开始一条独立对话",
      icon: <IconPlus />,
      primary: true,
      loading: busy === "planning-session-create",
      onClick: onCreateSession
    },
    { key: "files", label: "文件", description: "当前小说工作区", icon: <IconFolder />, onClick: onOpenFile },
    { key: "model", label: "模型", description: "模型与上下文预算", icon: <IconRobot />, onClick: onOpenModel },
    { key: "context", label: "过程详情", description: "本轮读写和证据", icon: <IconSearch />, onClick: onOpenContext },
    { key: "history", label: "记录", description: "当前会话版本与回退", icon: <IconHistory />, onClick: onOpenHistory },
    activeRun?.id
      ? { key: "run", label: "详情", description: "当前运行过程", icon: <IconFile />, onClick: () => onOpenTranscript?.(activeRun.id) }
      : null
  ].filter(Boolean);
  return (
    <>
      <Tooltip content={collapsed ? "展开右侧会话栏" : "收起右侧会话栏"}>
        <button type="button" className={`planner-rail-peek ${collapsed ? "is-collapsed" : "is-open"}`} onClick={onToggle} aria-label={collapsed ? "展开右侧会话栏" : "收起右侧会话栏"}>
          {collapsed ? <IconMenuFold /> : <IconMenuUnfold />}
          <span>{collapsed ? "会话" : "收起"}</span>
        </button>
      </Tooltip>
      <aside className={`planner-workspace-rail ${collapsed ? "is-collapsed" : "is-open"}`} aria-label="当前小说会话栏">
      <div className="planner-workspace-rail-inner" aria-hidden={collapsed ? "true" : undefined}>
        <div className="planner-rail-head">
          <div>
            <Text className="planner-rail-kicker" type="secondary">当前小说</Text>
            <Text className="planner-rail-title" bold>{shortText(activeNovel?.title || "未命名小说", 28)}</Text>
            <div className="planner-rail-activity">
              <span className={`planner-rail-status-dot ${activeRunLive ? "live" : "idle"}`} />
              <Text type="secondary">
                {activeBranch ? branchTitle(activeBranch) : "主会话"} · {activeRun ? planningRunStatusLabel(activeRun.status) : "空闲"}
              </Text>
            </div>
          </div>
        </div>

        <div className="planner-rail-actions">
          {railCommands.map((command) => (
            <Tooltip key={command.key} content={command.description}>
              <Button
                size="small"
                type={command.primary ? "primary" : "text"}
                icon={command.icon}
                loading={command.loading}
                onClick={command.onClick}
              >
                <span>{command.label}</span>
              </Button>
            </Tooltip>
          ))}
        </div>

        <div className="planner-rail-section-head">
          <div>
            <Text type="secondary">当前书会话</Text>
            <span>{visibleBranches.length} 条</span>
          </div>
          <div className="planner-rail-section-actions">
            {visibleBranches.length > recentLimit && (
              <Button size="mini" type="text" onClick={() => setShowAllSessions((value) => !value)}>
                {showAllSessions ? "收起" : `展开 ${hiddenSessionCount} 条`}
              </Button>
            )}
            <Tooltip content="清理已删除、已归档或没有内容的旧会话，不影响当前会话。">
              <Button size="mini" type="text" icon={<IconDelete />} onClick={onCleanupSessions} loading={busy === "planning-session-cleanup"} />
            </Tooltip>
          </div>
        </div>

        <div className="planner-rail-thread-list">
          {displayedBranches.map((branch) => {
            const active = branch.id === activeBranchId;
            const branchRuns = runGroups.get(branch.id) || [];
            const liveForBranch = liveRun && normalizeClientPlanningBranchId(liveRun.branchId || "main") === branch.id ? liveRun : null;
            const branchRun = liveForBranch || (branch.latestRunId ? runMap.get(branch.latestRunId) : null) || branchRuns[0] || null;
            const branchDeleting = isDeletingBranch(branch.id);
            const branchSwitching = Boolean(sessionBusy[`switch:${branch.id}`]);
            const running = branchRun && !isPlanningRunDisplayTerminal(branchRun);
            const statusColor = branchRun ? planningRunTagColor(branchRun.status) : branch.canResume ? "orange" : "gray";
            return (
              <div
                key={branch.id}
                role="button"
                tabIndex={0}
                aria-current={active ? "true" : undefined}
                className={`planner-rail-thread-row ${active ? "active" : ""} ${running ? "is-running" : ""} ${branchDeleting || branchSwitching ? "is-busy" : ""} ${branchSwitching ? "is-switching" : ""}`}
                onClick={() => openBranch(branch)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openBranch(branch);
                  }
                }}
              >
                <div className="planner-rail-thread-line">
                  <span className="planner-rail-thread-dot" aria-hidden="true" />
                  <Text bold>{branchTitle(branch)}</Text>
                  <Tag color={branchSwitching ? "arcoblue" : statusColor}>{branchSwitching ? "切换" : branchRun ? planningRunStatusLabel(branchRun.status) : branch.canResume ? "未收束" : "空闲"}</Tag>
                </div>
                <Text className="planner-rail-thread-preview" type="secondary">
                  {branch.latestUserPreview || "还没有用户消息。"}
                </Text>
                <div className="planner-rail-thread-meta" aria-label="会话摘要">
                  <span>{branch.messageCount || 0} 条</span>
                  {running && <span>运行中</span>}
                  {!running && branch.latestActivityAt && <span>{formatDate(branch.latestActivityAt)}</span>}
                </div>
                <div className="planner-rail-thread-actions" onClick={(event) => event.stopPropagation()}>
                  <Tooltip content="重命名这个会话；只改变显示名称。">
                    <Button size="mini" type="text" icon={<IconEdit />} onClick={() => onRenameSession?.(branch)} />
                  </Tooltip>
                  <Tooltip content="派生这个会话；旧会话不会被覆盖。">
                    <Button size="mini" type="text" icon={<IconBranch />} onClick={() => onForkSession?.(branch)} loading={busy === "planning-session-fork"} />
                  </Tooltip>
                  {branch.id !== "main" && (
                    <Popconfirm
                      title={`删除会话“${branchTitle(branch)}”？`}
                      content="只从列表移除，会话审计仍保留。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ status: "danger" }}
                      onOk={() => onDeleteSession?.(branch)}
                    >
                      <Tooltip content="删除这个会话，不影响其它会话。">
                        <Button size="mini" type="text" status="danger" icon={<IconDelete />} loading={branchDeleting} />
                      </Tooltip>
                    </Popconfirm>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </aside>
    </>
  );
}

function planningRunTagColor(status) {
  return {
    completed: "green",
    failed: "red",
    paused: "orange",
    blocked: "orange",
    cancelled: "gray",
    running: "arcoblue",
    queued: "arcoblue"
  }[String(status || "")] || "gray";
}

function AgentTopReveal({ anchorRef, activeNovel, providers, busy, liveRun, pageTitle, sidebarOpen, setSidebarOpen, onOpenBackground, onRefreshApp, appLoading, surfaceVars, onOpenContext, onOpenThreads, onOpenHistory, onOpenFile, onOpenModel, onSwitchModel }) {
  const revealRef = useRef(null);
  const [bounds, setBounds] = useState(null);
  useLayoutEffect(() => {
    const updateBounds = () => {
      const shell = anchorRef?.current || revealRef.current?.closest?.(".codex-agent-shell");
      if (!shell || typeof window === "undefined") return;
      const rect = shell.getBoundingClientRect();
      const left = Math.max(0, Math.min(window.innerWidth, rect.left));
      const right = Math.max(left, Math.min(window.innerWidth, rect.right));
      const visible = rect.bottom > 0 && rect.top < window.innerHeight && right > left;
      const pastShellTop = rect.top < -72;
      const next = {
        left,
        width: right - left,
        visible: visible && pastShellTop
      };
      setBounds((previous) => {
        if (
          previous
          && Math.abs(previous.left - next.left) < 0.5
          && Math.abs(previous.width - next.width) < 0.5
          && previous.visible === next.visible
        ) {
          return previous;
        }
        return next;
      });
    };
    updateBounds();
    const shell = anchorRef?.current || revealRef.current?.closest?.(".codex-agent-shell");
    const resizeObserver = typeof ResizeObserver === "undefined" || !shell ? null : new ResizeObserver(updateBounds);
    resizeObserver?.observe(shell);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
    };
  }, [anchorRef]);
  const scopedStyle = {
    ...(surfaceVars || {}),
    left: bounds?.left || 0,
    right: "auto",
    width: bounds?.width || 0,
    visibility: bounds?.visible ? "visible" : "hidden"
  };
  const layer = (
    <div ref={revealRef} className="viewport-top-reveal" style={scopedStyle} tabIndex={0}>
      <div className="viewport-top-hotzone" />
      <div className="viewport-top-panel">
        <div className="viewport-page-bar">
          <div className="codex-title-line">
            <Title heading={5}>{pageTitle}</Title>
            {activeNovel && <Text type="secondary">{activeNovel.title}</Text>}
          </div>
          <Space wrap>
            <Button size="small" icon={<IconBgColors />} onClick={onOpenBackground}>背景</Button>
            <Button size="small" icon={<IconRefresh />} onClick={onRefreshApp} loading={appLoading}>刷新</Button>
            {activeNovel && <Tag color="green">更新 {formatDate(activeNovel.updatedAt)}</Tag>}
          </Space>
        </div>
        <div className="viewport-agent-bar">
          <Space wrap>
            <Tag color={liveRun ? "orange" : "green"}>{liveRun ? planningRunStatusLabel(liveRun.status) : "空闲"}</Tag>
            <Button size="small" icon={<IconSearch />} onClick={onOpenContext}>过程详情</Button>
            <Button size="small" icon={<IconHistory />} onClick={onOpenHistory}>会话记录</Button>
            <Button size="small" icon={<IconFolder />} onClick={onOpenFile}>工作区</Button>
            <Button size="small" icon={<IconRobot />} onClick={onOpenModel}>策划模型</Button>
          </Space>
          <PlannerModelInlineSwitch
            activeNovel={activeNovel}
            providers={providers}
            busy={busy}
            onSubmit={onSwitchModel}
          />
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}

// 只渲染对话常用 Markdown 结构，避免把模型输出转成不受控 HTML。
function PlanningInlineMarkdownText({ text }) {
  const source = String(text || "");
  const parts = source.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((part) => part !== "");
  return parts.map((part, index) => {
    if (/^`[^`]+`$/.test(part)) {
      return <code key={`${part}-${index}`} className="planning-inline-code">{part.slice(1, -1)}</code>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function sanitizePlanningAssistantPublicContent(content) {
  const source = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!source) return "";
  return source
    .split("\n")
    .filter((line) => !/^(?:我)?(?:根据|通过|从)?(?:自动)?(?:证据调度|evidenceScheduler|runtimeGuard|completionVerifier|toolUseDecision|skillOps|native_tool_call|tool_call|tool_result|contextAsset|assetRef|运行器|审查器|统一工具执行器)/i.test(String(line || "").trim()))
    .join("\n")
    .replace(/自动证据调度/g, "资料读取")
    .replace(/证据调度/g, "资料读取")
    .replace(/evidenceScheduler/gi, "资料读取")
    .replace(/context assets?|上下文资产/gi, "长资料引用")
    .replace(/assetRefs?/gi, "引用")
    .replace(/skillOps|native_tool_call|tool_call|tool_result/gi, "工具")
    .replace(/runtimeGuard|completionVerifier|toolUseDecision/gi, "运行检查")
    .replace(/统一工具执行器/g, "工具")
    .replace(/运行器/g, "系统")
    .replace(/审查器/g, "检查")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function PlanningMessageContent({ content, isUser = false }) {
  const visibleContent = isUser ? String(content || "") : sanitizePlanningAssistantPublicContent(content);
  const lines = visibleContent.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };
  const flushCode = () => {
    if (!code) return;
    blocks.push({ type: "code", text: code.lines.join("\n"), lang: code.lang });
    code = null;
  };

  lines.forEach((line) => {
    const raw = String(line || "");
    const fence = raw.match(/^```([\w-]*)\s*$/);
    if (fence) {
      if (code) flushCode();
      else {
        flushParagraph();
        flushList();
        code = { lang: fence[1] || "", lines: [] };
      }
      return;
    }
    if (code) {
      code.lines.push(raw);
      return;
    }
    if (!raw.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    if (!isUser && heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      return;
    }
    const unordered = raw.match(/^\s*[-*]\s+(.+)$/);
    const ordered = raw.match(/^\s*\d+[.)]\s+(.+)$/);
    if (!isUser && (unordered || ordered)) {
      flushParagraph();
      const nextType = ordered ? "ordered" : "unordered";
      if (!list || list.type !== nextType) {
        flushList();
        list = { type: nextType, items: [] };
      }
      list.items.push((unordered?.[1] || ordered?.[1] || "").trim());
      return;
    }
    flushList();
    paragraph.push(raw);
  });
  flushCode();
  flushParagraph();
  flushList();

  if (!blocks.length) return null;
  return (
    <div className={`planning-markdown-content ${isUser ? "is-user" : "is-agent"}`}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <div key={`heading-${index}`} className={`planning-md-heading level-${block.level}`}>
              <PlanningInlineMarkdownText text={block.text} />
            </div>
          );
        }
        if (block.type === "unordered" || block.type === "ordered") {
          const TagName = block.type === "ordered" ? "ol" : "ul";
          return (
            <TagName key={`list-${index}`} className="planning-md-list">
              {safeArray(block.items).map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}><PlanningInlineMarkdownText text={item} /></li>
              ))}
            </TagName>
          );
        }
        if (block.type === "code") {
          return <pre key={`code-${index}`} className="planning-md-code"><code>{block.text}</code></pre>;
        }
        return (
          <p key={`paragraph-${index}`} className="planning-md-paragraph">
            <PlanningInlineMarkdownText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

function PlanningThreadMessage({ message, run, busy, submitting = false, showRunTrail = false, editDraft = null, onReturnToMessage, onChangeMessageEdit, onCancelMessageEdit, onSubmitMessageEdit, onOpenTranscript }) {
  const isUser = message.role === "user";
  const isEditing = Boolean(isUser && editDraft?.messageId === message.id);
  const showInlineRunTrail = !isUser && showRunTrail && run?.id && isPlanningRunDisplayTerminal(run);
  const attachmentFiles = planningMessageAttachmentFiles(message);
  const attachmentMentions = planningMessageAttachmentMentions(message);
  const copyMessage = async () => {
    try {
      await navigator.clipboard?.writeText?.(message.content || "");
      notify("success", "已复制这条消息");
    } catch {
      notify("warning", "浏览器没有开放剪贴板权限");
    }
  };
  return (
    <div className={`codex-message-row ${isUser ? "user" : "assistant"} ${isEditing ? "is-editing" : ""}`}>
      <div className="codex-avatar">{isUser ? "你" : <IconRobot />}</div>
      <div className="codex-message-bubble">
        <div className="message-meta">
          <Text className="message-author">{isUser ? "你" : "策划 Agent"}</Text>
          <Text type="secondary">{formatDate(message.createdAt)}</Text>
          {!isEditing && (
            <>
              <Button className="codex-inline-action" size="mini" icon={<IconCopy />} onClick={copyMessage}>复制</Button>
              {isUser && <Button className="codex-inline-action" size="mini" icon={<IconEdit />} onClick={() => onReturnToMessage(message)}>编辑</Button>}
              {!isUser && run?.id && !showInlineRunTrail && <Button className="codex-inline-action" size="mini" icon={<IconFile />} onClick={() => onOpenTranscript?.(run.id)}>详情</Button>}
            </>
          )}
        </div>
        {isEditing ? (
          <PlanningInlineMessageEditor
            draft={editDraft}
            busy={busy}
            submitting={submitting}
            onChange={onChangeMessageEdit}
            onCancel={onCancelMessageEdit}
            onSubmit={onSubmitMessageEdit}
          />
        ) : (
          <>
            <PlanningMessageContent content={message.content} isUser={isUser} />
            {showInlineRunTrail && <PlanningMessageRunTrail run={run} onOpenTranscript={onOpenTranscript} />}
            {isUser && (attachmentFiles.length > 0 || attachmentMentions.length > 0) && (
              <div className="codex-message-attachments">
                {attachmentMentions.map((mention) => (
                  <Tag key={`mention-${mention.id || mention.label}`} color={mention.color || "arcoblue"}>
                    {mention.typeLabel || "引用"} · {shortText(mention.label, 34)}
                  </Tag>
                ))}
                {attachmentFiles.map((file) => (
                  <Tag key={file.id || file.name} color={file.color || "cyan"} icon={<IconFile />}>
                    文件 · {shortText(file.name || file.label, 34)}
                    <span className="codex-file-chip-meta">{file.truncated ? "截取" : formatPlanningFileSize(file.size)}</span>
                  </Tag>
                ))}
              </div>
            )}
          </>
        )}
        {!showInlineRunTrail && !run?.id && !message.runId && (
          !isUser && message.skillOpReport && <PlanningMessageToolSummary report={message.skillOpReport} trace={message.agentTrace} />
        )}
      </div>
    </div>
  );
}

function PlanningInlineMessageEditor({ draft, busy, submitting = false, onChange, onCancel, onSubmit }) {
  const inputRef = useRef(null);
  const files = safeArray(draft?.files).map(normalizePlanningComposerAttachmentFile).filter(Boolean);
  const mentions = safeArray(draft?.mentions);
  const content = String(draft?.content || "");
  useLayoutEffect(() => {
    const node = inputRef.current?.dom || inputRef.current?.textarea || inputRef.current;
    window.requestAnimationFrame(() => {
      inputRef.current?.focus?.();
      if (node?.setSelectionRange) {
        const length = content.length;
        node.setSelectionRange(length, length);
      }
    });
  }, [draft?.messageId]);
  const submit = () => {
    if (submitting) return false;
    return onSubmit?.(draft);
  };
  const handleKeyDown = (event) => {
    const isComposing = event?.isComposing || event?.nativeEvent?.isComposing;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || isComposing) return;
    event.preventDefault();
    submit();
  };
  return (
    <div className="codex-inline-message-editor">
      <TextArea
        ref={inputRef}
        className="codex-inline-message-input"
        value={content}
        onChange={(value) => onChange?.({ content: value })}
        onKeyDown={handleKeyDown}
        disabled={submitting}
        autoSize={{ minRows: 2, maxRows: 8 }}
      />
      {(mentions.length > 0 || files.length > 0) && (
        <div className="codex-message-attachments inline-edit">
          {mentions.map((mention) => (
            <Tag key={`mention-${mention.id || mention.label}`} color={mention.color || "arcoblue"}>
              {mention.typeLabel || "引用"} · {shortText(mention.label, 34)}
            </Tag>
          ))}
          {files.map((file) => (
            <Tag key={file.id || file.name} color={file.color || "cyan"} icon={<IconFile />}>
              文件 · {shortText(file.name || file.label, 34)}
              <span className="codex-file-chip-meta">{file.truncated ? "截取" : formatPlanningFileSize(file.size)}</span>
            </Tag>
          ))}
        </div>
      )}
      <div className="codex-inline-message-actions">
        <Text type="secondary">发送后从这条消息继续</Text>
        <Space size={6}>
          <Button size="mini" type="text" disabled={submitting} onClick={onCancel}>取消</Button>
          <Button size="mini" type="primary" icon={<IconArrowUp />} loading={submitting || busy === "planning-chat-start"} disabled={!content.trim() || submitting} onClick={submit}>
            发送
          </Button>
        </Space>
      </div>
    </div>
  );
}

function buildPlanningRunTrailSummarySteps({ run, toolTimeline, activityRows, checkSummary, limit = 3 }) {
  const seen = new Set();
  const steps = [];
  const userText = String(run?.userMessagePreview || run?.userMessage || "").trim();
  const explicitLightReply = planningDisplayTextLooksLikeLightReplyRequest(userText)
    && !planningDisplayTextHasConcreteReadTarget(userText);
  if (explicitLightReply && String(run?.reply || run?.assistantMessagePreview || "").trim()) {
    return [];
  }
  const reviewLine = (summary) => {
    const text = String(summary || "").trim();
    if (!text) return "";
    if (/^检查/.test(text)) return text;
    if (/^(通过|已通过)$/.test(text)) return "检查通过";
    return `检查：${text}`;
  };
  const pushStep = (text, patch = {}) => {
    let cleaned = String(text || "").trim();
    if (!cleaned) return;
    cleaned = cleaned
      .replace(/^完成[:：]\s*/, "已")
      .replace(/^已已/, "已")
      .replace(/当前工作区/g, "当前资料目录")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return;
    if (/native_tool_call|tool_result|tool_call|contextAsset|assetRef|evidence_scheduler|model_call|skillOps|run_[a-z0-9_]+|tool_asset/i.test(cleaned)) return;
    if (/正在思考|调用策划模型|整理本轮上下文|准备进入连续处理|权限已确认|等待你继续|本轮普通回复已完成|自检未发现明显|已检查通过|自然语言回复已完成|上下文压缩输入过大|确定性摘要|长内容引用|^\s*已检查\s*\d+\s*项|验收步骤已记录/i.test(cleaned)) return;
    if (/可复用内容.*没有闭环|未闭合.*工具目标|让 Agent 继续|运行器要求/i.test(cleaned)) return;
    if (planningDisplayTextLooksLikeLightReplyRetrievalNoise(cleaned)) return;
    const key = planningCodexDisplayStepTextKey(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    steps.push({
      id: `trail-summary-${steps.length}-${key}`,
      type: "action",
      tone: patch.tone || "muted",
      kind: patch.kind || "",
      status: patch.status || "completed",
      icon: patch.icon || null,
      text: cleaned
    });
  };

  // 终态主消息流优先使用后端整理好的公开过程流。
  // parts 是运行过程的半审计层，旧运行里可能包含模型思考、完成判定等过渡部件；
  // 这些内容应该进详情，而不是重新污染 Codex 式主消息摘要。
  const canonicalSteps = planningCanonicalProcessStepsFromRun(run, { live: false, limit });
  const serverSteps = (canonicalSteps.length ? canonicalSteps : safeArray(run?.displaySteps))
    .filter((step) => shouldShowPlanningCodexServerStep(step, false))
    .map(normalizePlanningCodexDisplayStep)
    .filter(Boolean);
  for (const step of serverSteps) {
    if (steps.length >= limit) break;
    pushStep(step.text, {
      tone: step.tone,
      kind: step.kind,
      status: step.status,
      icon: step.icon || planningCodexDisplayStepIcon(step)
    });
  }
  if (steps.length > 0) return steps.slice(0, limit);

  const parts = visiblePlanningRunParts(run?.parts, { compact: true, live: false })
    .filter((part) => part.type === "tool" || part.type === "review" || part.type === "approval");
  for (const part of parts) {
    if (part.type === "review") {
      if (checkSummary?.status === "passed" && !["danger", "warning"].includes(String(part.tone || ""))) continue;
      const summary = planningRunUserFacingCheckSummary(part.text || checkSummary?.summary);
      if (summary) pushStep(reviewLine(summary), { tone: planningActivityRowTone(part), kind: "review", icon: <IconSafe /> });
      continue;
    }
    const label = planningRunPartActionLabel(part);
    const target = planningRunPartTargetText(part);
    const statusText = planningRunPartStatusText(part);
    const prefix = statusText === "完成" ? "已" : `${statusText}：`;
    pushStep(`${prefix}${label}${target ? `：${target}` : ""}`, {
      tone: planningActivityRowTone(part),
      kind: part.kind || planningToolActionKind(part.toolType),
      status: part.status,
      icon: planningRunPartIcon(part)
    });
  }

  for (const row of safeArray(activityRows)) {
    if (steps.length >= limit) break;
    if (!row || ["model", "idle"].includes(String(row.key || ""))) continue;
    if (String(row.kind || "") === "model" || String(row.toolType || "") === "model" || /思考下一步/.test(String(row.text || row.label || ""))) continue;
    if (String(row.kind || "") === "review" && /自然语言回复已完成|本轮结果可以进入会话|检查通过/.test(String(row.text || row.summary || ""))) continue;
    pushStep(planningCodexActionRowText(row), {
      tone: row.tone || "muted",
      icon: row.icon
    });
  }

  for (const entry of safeArray(toolTimeline)) {
    if (steps.length >= limit) break;
    const kind = planningToolActionKind(entry.toolType);
    const label = planningToolActionLabel(entry);
    const target = planningToolActionTarget(entry);
    const statusText = planningToolActionStatusLabel(entry.status);
    const prefix = statusText === "完成" ? "已" : `${statusText}：`;
    pushStep(`${prefix}${label}${target ? `：${target}` : ""}`, {
      tone: planningToolActionStatusTone(entry.status),
      kind,
      status: entry.status,
      icon: kind === "write" ? <IconEdit /> : kind === "shell" ? <IconCode /> : <IconSearch />
    });
  }

  const checkText = planningRunUserFacingCheckSummary(checkSummary?.summary);
  if (["failed", "warning"].includes(String(checkSummary?.status || "")) && checkText) {
    pushStep(checkText ? reviewLine(checkText) : reviewLine(planningReviewStatusLabel(checkSummary?.status)), {
      tone: checkSummary?.status === "failed" ? "danger" : checkSummary?.status === "warning" ? "warning" : "done",
      kind: "review",
      icon: <IconSafe />
    });
  }

  if (steps.length === 0 && String(run?.reply || run?.assistantMessagePreview || "").trim()) {
    if (isPlanningRunPlainAwaitingReply(run)) return steps.slice(0, limit);
    pushStep("已形成回复", {
      tone: "done",
      kind: "review",
      icon: <IconSafe />
    });
  }

  return steps.slice(0, limit);
}

function PlanningMessageRunTrail({ run, onOpenTranscript }) {
  const checkSummary = buildPlanningRunCheckSummary(run);
  const isPlainAwaitingReply = isPlanningRunPlainAwaitingReply(run);
  const explicitReplyOnlyTrail = planningDisplayTextLooksLikeLightReplyRequest(String(run?.userMessagePreview || run?.userMessage || ""))
    && !planningDisplayTextHasConcreteReadTarget(String(run?.userMessagePreview || run?.userMessage || ""))
    && Boolean(String(run?.reply || run?.assistantMessagePreview || "").trim());
  const isSoftToolPause = isPlanningRunSoftToolPause(run);
  const elapsedText = formatElapsedTime(run.createdAt, run.finishedAt || run.updatedAt);
  const displaySteps = planningCanonicalProcessStepsFromRun(run, { live: false, limit: 5 });
  const primaryProcessStream = displaySteps.length > 0 ? (
    <PlanningCodexDisplayStream steps={displaySteps} onOpenDetails={() => onOpenTranscript?.(run.id)} />
  ) : null;
  // 终态回复已经有正文消息，主消息下只保留一条 Codex 式轻摘要；
  // 详细工具和审查记录统一进入“过程详情”，避免看起来还在运行。
  const terminalSummarySteps = buildPlanningRunTrailSummarySteps({
    run,
    toolTimeline: [],
    activityRows: [],
    checkSummary,
    limit: isPlainAwaitingReply ? 2 : 3
  });
  const suppressReplyOnlyTrailDetails = isPlainAwaitingReply || explicitReplyOnlyTrail;
  const terminalNeedsInlineAttention = ["failed", "blocked", "cancelled", "paused", "awaiting_approval"].includes(String(run?.status || ""))
    || isSoftToolPause
    || checkSummary.status === "failed"
    || checkSummary.status === "warning";
  const showPrimaryProcessStream = !suppressReplyOnlyTrailDetails && terminalSummarySteps.length === 0 && terminalNeedsInlineAttention && Boolean(primaryProcessStream);
  const showTerminalSummarySteps = !suppressReplyOnlyTrailDetails && terminalSummarySteps.length > 0 && terminalNeedsInlineAttention;
  const hasActionableCheckDetails = planningCheckSummaryIsActionable(checkSummary);
  const hasBottomRunDetails = displaySteps.length > 0 || hasActionableCheckDetails || Boolean(run?.id);
  const statusNeedsTrail = terminalNeedsInlineAttention;
  const shouldKeepCompactTrail = Boolean(run?.id) && !suppressReplyOnlyTrailDetails && !isPlainAwaitingReply;
  const hasVisibleRunTrail = shouldKeepCompactTrail || (!suppressReplyOnlyTrailDetails && (
    showPrimaryProcessStream
    || showTerminalSummarySteps
    || hasBottomRunDetails
    || statusNeedsTrail
  ));
  if (!hasVisibleRunTrail) return null;
  const trailSummary = buildPlanningCodexSettledSummary(
    terminalSummarySteps.length ? terminalSummarySteps : displaySteps
  );
  const turnTrailSummary = buildPlanningTurnItemsTrailSummary(run);
  const trailText = shortText(
    turnTrailSummary
      || trailSummary?.text
      || terminalSummarySteps[0]?.text
      || displaySteps[0]?.text
      || checkSummary.summary
      || "",
    180
  );
  const trailTone = trailSummary?.tone || planningRunSettledTone(run, checkSummary);
  return (
    <div className={`codex-message-run-trail is-compact ${trailTone}`}>
      <button type="button" className="codex-message-run-trail-main" onClick={() => onOpenTranscript?.(run.id)} aria-label="查看本轮过程详情">
        <span className={`codex-run-state-line codex-elapsed-only ${trailTone}`}>
          <Text>{elapsedText ? `已处理 ${elapsedText}` : planningRunStatusLabel(run.status)}</Text>
          <IconArrowRight />
        </span>
        {trailText && <Text className="codex-message-run-trail-text">{trailText}</Text>}
        {isSoftToolPause && <Text className="codex-run-settled-meta" type="secondary">已保留进度</Text>}
        <span className="codex-run-trail-link"><IconFile />详情</span>
      </button>
      {showTerminalSummarySteps && (
        <PlanningCodexDisplayStream
          steps={terminalSummarySteps.slice(0, 4)}
          live={false}
          compact
          onOpenDetails={() => onOpenTranscript?.(run.id)}
        />
      )}
      {showPrimaryProcessStream && primaryProcessStream}
      {hasActionableCheckDetails && (
        <button type="button" className="codex-run-trail-check" onClick={() => onOpenTranscript?.(run.id)}>
          <span className={`codex-tool-status ${checkSummary.status === "failed" ? "danger" : checkSummary.status === "warning" ? "warning" : "done"}`}>
            <span className="codex-tool-status-dot" aria-hidden="true" />
            {checkSummary.status === "passed" ? "检查通过" : checkSummary.status === "failed" ? "需要处理" : "有提醒"}
          </span>
          <Text>{shortText(checkSummary.summary, 180)}</Text>
        </button>
      )}
    </div>
  );
}

function PlanningMessageToolSummary({ report, trace }) {
  const stats = planningToolStats(report);
  const toolTimeline = compactPlanningToolTimeline(buildPlanningToolTimeline({ report }));
  if (stats.total === 0 && safeArray(trace).length === 0) return null;
  const hasTools = toolTimeline.length > 0 || stats.total > 0;
  const activityRows = buildPlanningReportActivityRows({ report, trace, toolTimeline, stats });
  const summaryText = hasTools
    ? [
        stats.searches || stats.evidenceReads ? `已读取 ${(stats.searches || 0) + (stats.evidenceReads || 0)} 份资料` : "",
        stats.writes ? `已编辑 ${stats.writes} 项` : "",
        stats.skipped ? `有 ${stats.skipped} 个问题` : "",
        !stats.searches && !stats.evidenceReads && !stats.writes && !stats.skipped && toolTimeline.length ? "已处理本轮消息" : ""
      ].filter(Boolean).join(" · ")
    : `${safeArray(trace).length} 段运行摘要`;
  return (
    <div className="agent-tool-summary">
      <div className="agent-tool-summary-line">
        <span className="codex-run-state-line ok">
          <span className="codex-run-state-dot" aria-hidden="true" />
          <Text>{summaryText}</Text>
        </span>
      </div>
      <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
        <Collapse.Item name="tools" header={<PlanningDisclosureHeader label={hasTools ? "旧版过程" : "查看摘要"} meta="" />}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {activityRows.length > 0 && <PlanningCodexStepStream rows={activityRows} limit={6} />}
            {hasTools && <PlanningToolTimeline entries={toolTimeline} limit={8} compact={false} />}
            {safeArray(trace).length > 0 && (
              <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
                <Collapse.Item name="trace" header={<PlanningDisclosureHeader label="查看文字摘要" meta={`${safeArray(trace).length} 段`} />}>
                  <div className="codex-tool-call-list">
                    {safeArray(trace).slice(-8).map((step, index) => (
                      <div key={step.id || `${step.type}-${index}`} className="codex-tool-raw-row">
                        <Tag color="purple">{step.type || step.phase || `步骤 ${index + 1}`}</Tag>
                        <Text>{shortText(step.summary || step.reply || step.reason || prettyJson(step), 180)}</Text>
                      </div>
                    ))}
                  </div>
                </Collapse.Item>
              </Collapse>
            )}
          </Space>
        </Collapse.Item>
      </Collapse>
    </div>
  );
}

function PlanningToolReportRow({ item, bucket }) {
  const hasDiff = Boolean(item?.diff);
  const hasFileDiffs = safeArray(item?.files).some((file) => file.diff);
  const sources = safeArray(item?.sources);
  const assetRefs = [
    ...safeArray(item?.assetRef ? [item.assetRef] : []),
    ...safeArray(item?.assetRefs),
    ...safeArray(item?.results).flatMap((result) => safeArray(result?.assetRef ? [result.assetRef] : []))
  ].filter(Boolean);
  const isLocalRead = ["searchLocalFiles", "readLocalFile", "readFile", "readMessageAttachment", "listFiles", "globFiles", "grepFiles", "indexLocalFiles", "previewPatchFile", "previewPatchSet"].includes(item?.type);
  const tagColor = bucket === "write" ? "green" : item?.type === "webSearch" ? "orange" : isLocalRead ? "arcoblue" : "gray";
  return (
    <div className={`agent-tool-report ${hasDiff || hasFileDiffs ? "has-diff" : ""}`}>
      <div className="agent-tool-row">
        <Tag color={tagColor}>{planningToolKindLabel(item.type)}</Tag>
        <Text>{shortText(item.query || item.relativePath || item.path || item.name || item.subject || item.id || item.reason, 120)}</Text>
        <Space size={4} wrap>
          {item.patchId && <Tag color="purple">{shortText(item.patchId, 18)}</Tag>}
          {item.patchSetId && <Tag color="purple">{shortText(item.patchSetId, 18)}</Tag>}
          {item.cached && <Tag color="arcoblue">缓存</Tag>}
          {item.provider && <Tag color="gray">{item.requestedProvider && item.requestedProvider !== item.provider ? `${item.requestedProvider}→${item.provider}` : item.provider}</Tag>}
          {item.retrievalMode && <Tag color="purple">{item.retrievalMode}</Tag>}
          {item.vectorIndex && <Tag color="arcoblue">向量 {item.vectorIndex.chunkCount || 0}</Tag>}
          {assetRefs.length > 0 && <Tag color="orange">原文 {assetRefs.length}</Tag>}
          {item.credibility?.level && <Tag color={item.credibility.level === "high" ? "green" : item.credibility.level === "low" ? "orange" : "gray"}>可信度 {item.credibility.level}</Tag>}
          {sources.length > 0 && <Tag color="orange">引用 {sources.length}</Tag>}
          {bucket === "search" && <Text type="secondary">{item.count || 0} 条结果</Text>}
        </Space>
      </div>
      {hasDiff && (
        <Collapse className="agent-inline-collapse agent-diff-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="diff" header={<PlanningDisclosureHeader label={item.patchSetId ? "补丁集 diff" : item.patchId ? "diff" : "补丁预览 diff"} meta={shortText(item.patchSetId || item.patchId || "", 28)} />}>
            <pre className="agent-diff-block">{item.diff}</pre>
          </Collapse.Item>
        </Collapse>
      )}
      {hasFileDiffs && (
        <Collapse className="agent-inline-collapse agent-diff-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="file-diffs" header={<PlanningDisclosureHeader label="逐文件 diff" meta={`${safeArray(item.files).length} 个文件`} />}>
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {safeArray(item.files).map((file, index) => (
                <div key={`${file.relativePath || file.path}-${index}`}>
                  <Text type="secondary">{file.relativePath || file.path}</Text>
                  <pre className="agent-diff-block">{file.diff}</pre>
                </div>
              ))}
            </Space>
          </Collapse.Item>
        </Collapse>
      )}
      {sources.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="sources" header={<PlanningDisclosureHeader label="引用来源" meta={`${sources.length} 条`} />}>
            <div className="agent-source-list">
              {sources.slice(0, 8).map((source) => (
                <div key={source.citationId || source.url} className="agent-source-row">
                  <Tag color="arcoblue">{source.citationId || "source"}</Tag>
                  <Text>{shortText(source.title || source.url, 120)}</Text>
                </div>
              ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
      {assetRefs.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="assets" header={<PlanningDisclosureHeader label="已保存原文" meta={`${assetRefs.length} 条`} />}>
            <div className="agent-source-list">
              {assetRefs.slice(0, 8).map((asset) => (
                <div key={asset.id} className="agent-source-row">
                  <Tag color="orange">{planningReferenceKindLabel(asset)}</Tag>
                  <Text>{shortText(planningReferenceTitle(asset), 120)}</Text>
                  <Text type="secondary">{asset.tokens || 0} tokens</Text>
                </div>
              ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
}

function PlanningToolTimeline({ entries, limit = 8, live = false, compact = true, showDebug = false }) {
  const allEntries = compact ? compactPlanningToolTimeline(entries) : safeArray(entries);
  const visible = allEntries.length > limit ? allEntries.slice(-limit) : allEntries;
  const hidden = Math.max(0, allEntries.length - visible.length);
  if (visible.length === 0) {
    return <Text type="secondary">本轮没有可展示的动作。</Text>;
  }
  const liveOpenKeys = live
    ? uniqueStrings([
        ...visible.filter((entry) => ["running", "pending", "awaiting_approval"].includes(String(entry.status || ""))).map((entry, index) => entry.key || `${entry.toolType}-${index}`),
        ...visible.slice(-2).map((entry, index) => entry.key || `${entry.toolType}-${visible.length - 2 + index}`)
      ])
    : [];
  return (
    <div className="codex-tool-call-list">
      <Collapse
        key={live ? `tools-live-${visible.length}-${liveOpenKeys.join("|")}` : `tools-settled-${visible.length}`}
        className="agent-inline-collapse codex-tool-call-collapse codex-disclosure-collapse"
        bordered={false}
        defaultActiveKey={liveOpenKeys}
      >
        {visible.map((entry, index) => (
          <Collapse.Item
            key={entry.key || `${entry.toolType}-${index}`}
            name={entry.key || `${entry.toolType}-${index}`}
            header={<PlanningToolActionHeader entry={entry} />}
          >
            <PlanningToolActionDetail entry={entry} showDebug={showDebug} />
          </Collapse.Item>
        ))}
      </Collapse>
      {hidden > 0 && <Text className="codex-tool-hidden-count" type="secondary">还有 {hidden} 条较早动作已收进过程详情。</Text>}
    </div>
  );
}

function PlanningToolActionHeader({ entry }) {
  const label = planningToolActionLabel(entry);
  const target = planningToolActionTarget(entry);
  const meta = planningToolActionMeta(entry);
  const statusTone = planningToolActionStatusTone(entry.status);
  return (
    <span className="codex-tool-call-header">
      <IconArrowRight className="codex-disclosure-caret" />
      <span className={`codex-tool-status ${statusTone}`}>
        <span className="codex-tool-status-dot" aria-hidden="true" />
        {planningToolActionStatusLabel(entry.status)}
      </span>
      <span className="codex-tool-call-title">{label}</span>
      <span className="codex-tool-call-target">{shortText(target, 150)}</span>
      {meta && <span className="codex-tool-call-meta">{meta}</span>}
    </span>
  );
}

function PlanningToolActionDetail({ entry, showDebug = false }) {
  const isContextFileFlow = planningToolIsContextFileFlow(entry);
  const usedFor = isContextFileFlow ? "" : safeArray(entry.usedFor)[0];
  const queries = safeArray(entry.queries);
  const assets = safeArray(entry.assetRefs);
  const assetIds = safeArray(entry.assetIds);
  const resultIds = safeArray(entry.resultIds);
  const topResults = safeArray(entry.topResults);
  const evidenceReads = safeArray(entry.evidenceReads);
  const writePreview = safeArray(entry.writePreviews)[0] || null;
  const archiveDiff = safeArray(entry.archiveDiffs)[0] || null;
  const rollbackPlan = safeArray(entry.rollbackPlans)[0] || null;
  const occurrenceCount = Number(entry.occurrenceCount || 1);
  const isFailed = ["failed", "blocked", "skipped"].includes(String(entry.status || ""));
  const reason = isContextFileFlow && !isFailed ? "" : planningToolActionReason(entry);
  const fileNames = planningToolEntryFileNames(entry);
  const showResultList = topResults.length > 0 && entry.toolType !== "readContextAsset" && !isContextFileFlow;
  return (
    <div className="codex-tool-call-detail">
      <div className="codex-tool-fields">
        <PlanningToolField label={isContextFileFlow ? "文件" : "对象"} value={isContextFileFlow ? planningToolFileTarget(entry) : queries.length > 0 ? queries.join("；") : planningToolActionTarget(entry)} />
        {occurrenceCount > 1 && !isContextFileFlow && <PlanningToolField label="次数" value={`同类动作已合并 ${occurrenceCount} 次`} />}
        {reason && <PlanningToolField label={isFailed ? "失败原因" : "说明"} value={reason} />}
        {usedFor && <PlanningToolField label="结果用途" value={usedFor} />}
        {entry.count > 0 && <PlanningToolField label="结果" value={`${entry.count} 条结果`} />}
        {writePreview?.summary && <PlanningToolField label="写入摘要" value={writePreview.summary} />}
        {writePreview?.sourceFiles?.length > 0 && <PlanningToolField label="来源文件" value={writePreview.sourceFiles.join("；")} />}
        {rollbackPlan?.supported && <PlanningToolField label="回滚依据" value={`已保存节点级快照，可追踪 ${rollbackPlan.changeCount || 0} 项变更`} />}
      </div>

      {entry.toolType === "applyArchivePatch" && archiveDiff?.changes?.length > 0 && (
        <div className="codex-tool-result-list compact">
          {archiveDiff.changes.slice(0, 8).map((change) => (
            <div key={change.id || `${change.field}-${change.title}`} className="codex-tool-result-row">
              <Tag color={change.action === "create" ? "green" : "orange"}>{change.action === "create" ? "新增" : "更新"}</Tag>
              <div>
                <Text>{shortText(`${change.field}：${change.title || change.key || "未命名节点"}`, 180)}</Text>
                {safeArray(change.changedFields).length > 0 && <Paragraph className="trace-reply">字段：{safeArray(change.changedFields).slice(0, 6).join("、")}</Paragraph>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showResultList && (
        <PlanningToolResultPreviewList results={topResults} />
      )}

      {isContextFileFlow && fileNames.length > 0 && (
        <div className="codex-tool-result-list compact">
          {fileNames.slice(0, 6).map((name) => (
            <div key={name} className="codex-tool-result-row">
              <Tag color="arcoblue">文件</Tag>
              <Text>{shortText(name, 180)}</Text>
            </div>
          ))}
        </div>
      )}

      {!isContextFileFlow && entry.toolType === "readContextAsset" && assets.length > 0 && (
        <div className="codex-tool-result-list compact">
          {assets.slice(0, 5).map((asset) => (
            <div key={asset.id || asset.relativePath || asset.title} className="codex-tool-result-row">
              <Tag color="arcoblue">{planningReferenceKindLabel(asset)}</Tag>
              <div>
                <Text>{shortText(planningReferenceTitle(asset), 180)}</Text>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDebug && assets.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="assets" header={<PlanningDisclosureHeader label="查看已保存原文" meta={`${assets.length} 条`} />}>
            <PlanningAssetRefList assets={assets} />
          </Collapse.Item>
        </Collapse>
      )}

      {showDebug && assets.length === 0 && assetIds.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="assetIds" header={<PlanningDisclosureHeader label="引用编号" meta={`${assetIds.length} 条`} />}>
            <div className="codex-tool-id-list">
              {assetIds.slice(0, 24).map((id) => <Tag key={id} color="orange">{shortText(id, 54)}</Tag>)}
            </div>
          </Collapse.Item>
        </Collapse>
      )}

      {showDebug && evidenceReads.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="evidence" header={<PlanningDisclosureHeader label="证据读取记录" meta={`${evidenceReads.length} 条`} />}>
            <div className="codex-tool-evidence-list">
              {evidenceReads.map((read) => (
                <div key={planningToolEvidenceKey(read)} className="codex-tool-evidence-row">
                  <Tag color="arcoblue">{planningReadableEvidenceLayerLabel(read.layer)}</Tag>
                  <div>
                    <Text>{shortText(read.query || read.assetId || "未记录查询", 180)}</Text>
                    <Paragraph className="trace-reply">{shortText(read.resultUsedFor || read.whyRead, 260)}</Paragraph>
                    <Text type="secondary">{read.assetId ? `引用：${read.assetId}` : ""}{read.count ? ` · ${read.count} 条结果` : ""}</Text>
                  </div>
                </div>
              ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}

      {showDebug && resultIds.length > 0 && (
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="resultIds" header={<PlanningDisclosureHeader label="结果编号" meta={`${resultIds.length} 条`} />}>
            <div className="codex-tool-id-list">
              {resultIds.slice(0, 24).map((id) => <Tag key={id} color="gray">{shortText(id, 48)}</Tag>)}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
}

function PlanningToolResultPreviewList({ results }) {
  const visible = safeArray(results).slice(0, 8);
  if (!visible.length) return null;
  return (
    <div className="codex-tool-result-list">
      {visible.map((result, index) => (
        <div key={planningToolTopResultKey(result) || `${result.title}-${index}`} className="codex-tool-result-row">
          <Tag color={planningToolResultKindLabel(result).includes("文件") ? "arcoblue" : "orange"}>{planningToolResultKindLabel(result)}</Tag>
          <div>
            <Text>{shortText(result.title || result.relativePath || result.path || result.id || "未命名结果", 180)}</Text>
            {planningToolResultDisplaySnippet(result) && (
              <Paragraph className="trace-reply">
                {shortText(planningToolResultDisplaySnippet(result), 220)}
              </Paragraph>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlanningToolField({ label, value }) {
  if (!String(value || "").trim()) return null;
  return (
    <div className="codex-tool-field">
      <Text type="secondary">{label}</Text>
      <Text>{shortText(value, 260)}</Text>
    </div>
  );
}

function PlanningAssetRefList({ assets }) {
  return (
    <div className="codex-tool-asset-list">
      {safeArray(assets).map((asset) => (
        <div key={asset.id || asset.relativePath || asset.title} className="codex-tool-asset-row">
          <Tag color="orange">{planningReferenceKindLabel(asset)}</Tag>
          <div>
            <Text>{shortText(planningReferenceTitle(asset), 180)}</Text>
            <Paragraph className="trace-reply">
              {[
                asset.tokens ? `${asset.tokens} tokens` : "",
                asset.chars ? `${asset.chars} 字符` : ""
              ].filter(Boolean).join(" · ")}
            </Paragraph>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildPlanningRunCheckSummary(run) {
  const runStatus = String(run?.status || "");
  const isSoftToolPause = isPlanningRunSoftToolPause(run);
  const explicitReplyOnly = planningDisplayTextLooksLikeLightReplyRequest(String(run?.userMessagePreview || run?.userMessage || ""))
    && !planningDisplayTextHasConcreteReadTarget(String(run?.userMessagePreview || run?.userMessage || ""));
  const diagnostics = safeArray(run?.diagnostics);
  const checkpoints = safeArray(run?.checkpoints);
  const doneCriteria = safeArray(run?.doneCriteria);
  const verifierSteps = safeArray(run?.verifierChain?.steps);
  const failedVerifier = verifierSteps.some((step) => ["failed", "blocked"].includes(String(step.status || "")));
  const warningVerifier = verifierSteps.some((step) => ["warning", "skipped", "manual_required"].includes(String(step.status || "")));
  const failedSelfReview = ["failed", "blocked"].includes(String(run?.selfReview?.status || ""));
  const failedCompletion = !isSoftToolPause && ["failed", "blocked"].includes(String(run?.completionVerifier?.status || ""));
  const terminalRunCanShowHardProblem = ["failed", "blocked"].includes(runStatus) || (runStatus === "paused" && !isSoftToolPause);
  const hasHardProblem = terminalRunCanShowHardProblem && (
    failedVerifier
    || failedSelfReview
    || failedCompletion
    || diagnostics.some((item) => item.retryable === false && item.level !== "info")
  );
  const publicDiagnostics = diagnostics.filter((item) => !planningTextLooksInternalToUser(`${item?.code || ""} ${item?.message || ""}`));
  const hasWarning = !isSoftToolPause && !explicitReplyOnly && (warningVerifier || publicDiagnostics.length > 0 || ["warning", "skipped", "manual_required"].includes(String(run?.selfReview?.status || "")) || ["warning", "skipped", "manual_required"].includes(String(run?.completionVerifier?.status || "")));
  const status = hasHardProblem ? "failed" : hasWarning ? "warning" : "passed";
  const summary = planningRunUserFacingCheckSummary(run?.completionVerifier?.summary)
    || planningRunUserFacingCheckSummary(run?.selfReview?.summary)
    || planningRunUserFacingCheckSummary(publicDiagnostics[publicDiagnostics.length - 1]?.message)
    || (verifierSteps.length ? `${verifierSteps.length} 个验收步骤已记录` : "")
    || (checkpoints.length ? `已保存 ${checkpoints.length} 个版本点` : "")
    || "未发现需要打断当前会话的问题";
  const hasActionableDetails = status !== "passed";
  return {
    status,
    summary,
    diagnostics: publicDiagnostics,
    checkpoints,
    doneCriteria,
    verifierSteps,
    hasDetails: !explicitReplyOnly && hasActionableDetails && (publicDiagnostics.length > 0
      || checkpoints.length > 0
      || doneCriteria.length > 0
      || verifierSteps.length > 0
      || (!isSoftToolPause && Boolean(planningRunUserFacingCheckSummary(run?.selfReview?.summary)))
      || (!isSoftToolPause && Boolean(planningRunUserFacingCheckSummary(run?.completionVerifier?.summary))))
  };
}

function buildPlanningRunFailureInfo(run, checkSummary, processSummary) {
  const status = String(run?.status || "");
  if (isPlanningRunSoftToolPause(run)) return null;
  const diagnostics = safeArray(run?.diagnostics).filter((item) => !planningTextLooksInternalToUser(`${item?.code || ""} ${item?.message || ""}`));
  const latestDiagnostic = diagnostics.slice().reverse().find((item) => item?.message || item?.code) || null;
  const failedItem = safeArray(run?.items).slice().reverse().find((item) => (
    ["failed", "blocked"].includes(String(item?.status || ""))
    || /^工具失败/.test(String(item?.title || ""))
  )) || null;
  const error = run?.error || null;
  const terminalProblem = ["failed", "blocked", "cancelled"].includes(status)
    || (status === "paused" && Boolean(error || checkSummary?.status === "failed"));
  const shouldShow = terminalProblem
    || (["failed", "blocked", "cancelled", "paused"].includes(status) && Boolean(error || latestDiagnostic || failedItem || processSummary?.failedCount > 0));
  if (!shouldShow) return null;
  const reason = planningUserVisibleText(error?.message, 280)
    || latestDiagnostic?.message
    || failedItem?.summary
    || failedItem?.title
    || checkSummary?.summary
    || processSummary?.summary
    || "运行没有正常完成";
  const code = error?.code || latestDiagnostic?.code || latestDiagnostic?.type || "";
  const retryable = error?.retryable ?? latestDiagnostic?.retryable;
  const suggestion = status === "cancelled"
    ? "这是你主动停止后的结果，可以直接继续发下一句。"
    : retryable === false
      ? "这类问题不会靠重复发送自动解决，需要先换模型、改权限或修正工具参数。"
      : status === "blocked"
        ? "Agent 已停在可处理状态，建议先查看这条原因，再继续本会话。"
        : "可以修正输入或模型配置后重新发送。";
  return {
    tone: status === "cancelled" ? "warning" : "danger",
    label: status === "blocked" ? "阻断原因" : status === "cancelled" ? "停止原因" : "失败原因",
    reason: planningUserVisibleText(reason, 280) || "运行没有正常完成",
    code,
    suggestion
  };
}

function PlanningRunFailureInline({ info }) {
  if (!info) return null;
  return (
    <div className={`codex-run-failure-inline ${info.tone || "danger"}`}>
      <div>
        <Text bold>{info.label}</Text>
        <Text>{info.reason}</Text>
        {info.code && <Text type="secondary">{info.code}</Text>}
      </div>
      <Text type="secondary">{info.suggestion}</Text>
    </div>
  );
}

function planningRunProblemMessage(run) {
  const diagnostic = safeArray(run?.diagnostics).slice().reverse().find((item) => (item?.message || item?.code) && !planningTextLooksInternalToUser(`${item?.code || ""} ${item?.message || ""}`));
  const failedItem = safeArray(run?.items).slice().reverse().find((item) => ["failed", "blocked"].includes(String(item?.status || "")) || /^工具失败/.test(String(item?.title || "")));
  return planningUserVisibleText(run?.error?.message, 280)
    || diagnostic?.message
    || failedItem?.summary
    || failedItem?.title
    || planningRunUserFacingCheckSummary(run?.completionVerifier?.summary)
    || planningRunUserFacingCheckSummary(run?.selfReview?.summary)
    || "";
}

function planningRunUserFacingCheckSummary(summary) {
  const text = planningUserVisibleText(summary, 260);
  if (!text) return "";
  if (/JSON|运行片段|结构修复|模型输出|修复器/i.test(text)) return "";
  if (/自然语言回复已完成|本轮普通回复已完成|本轮结果可以进入会话|检查通过|完成判定器未发现未闭合任务节点|自检未发现明显|未发现明显一致性|等待你继续|上下文压缩输入过大|确定性摘要|长内容引用/i.test(text)) return "";
  if (/^已读取相关资料并形成回复[。.]?$/.test(text)) return "";
  if (/^\d+\s*个验收步骤已记录[。.]?$/.test(text)) return "";
  if (/^已保存\s*\d+\s*个版本点[。.]?$/.test(text)) return "";
  if (/^未发现需要打断当前会话的问题[。.]?$/.test(text)) return "";
  return text;
}

function planningCheckSummaryIsActionable(checkSummary) {
  if (!checkSummary?.hasDetails || checkSummary.status === "passed") return false;
  const summary = planningRunUserFacingCheckSummary(checkSummary.summary);
  if (!summary) return false;
  if (/验收步骤已记录|已读取相关资料并形成回复|已保存\s*\d+\s*个版本点|未发现需要打断/.test(summary)) return false;
  return checkSummary.status === "failed"
    || /失败|未通过|阻断|需要处理|等待确认|权限|错误|超限/.test(summary);
}

function buildPlanningRunSettledSummary(run, { processSummary, checkSummary, taskPlan, completedPlanCount }) {
  const status = String(run?.status || "");
  const taskText = safeArray(taskPlan).length ? `计划 ${completedPlanCount}/${safeArray(taskPlan).length}` : "";
  const errorText = run?.error?.message || run?.error?.code || "";
  const checkText = planningRunUserFacingCheckSummary(checkSummary?.summary);
  const processText = planningRunUserFacingCheckSummary(processSummary?.summary);
  if (status === "completed") {
    if (String(run?.phase || "") === "awaiting_user") {
      return [checkText || processText || "已回复，等待你的下一句", taskText].filter(Boolean).join(" · ");
    }
    return [checkText || processText || "本轮对话已完成", taskText].filter(Boolean).join(" · ");
  }
  if (status === "failed") {
    return [errorText || checkText || processText || "本轮运行失败", taskText].filter(Boolean).join(" · ");
  }
  if (status === "paused") {
    if (isPlanningRunSoftToolPause(run)) return ["已保存进度，需要处理后再继续", taskText].filter(Boolean).join(" · ");
    return [checkText || "已保存进度，需要处理后再继续", taskText].filter(Boolean).join(" · ");
  }
  if (status === "blocked") {
    return [checkText || errorText || "没有可靠完成，需要处理后再继续", taskText].filter(Boolean).join(" · ");
  }
  if (status === "cancelled") {
    return [errorText || "本轮已终止", taskText].filter(Boolean).join(" · ");
  }
  return [checkText || processText || planningRunStatusLabel(status), taskText].filter(Boolean).join(" · ");
}

function planningRunSettledTone(run, checkSummary) {
  const status = String(run?.status || "");
  if (isPlanningRunSoftToolPause(run)) return "muted";
  if (["failed", "blocked"].includes(status) || checkSummary?.status === "failed") return "danger";
  if (["paused", "cancelled"].includes(status) || checkSummary?.status === "warning") return "warning";
  return "ok";
}

function planningActivityRowIcon(activity) {
  const kind = String(activity?.kind || "");
  const toolType = String(activity?.toolType || "");
  if (kind === "write") return <IconEdit />;
  if (kind === "shell") return <IconCode />;
  if (kind === "review") return <IconSafe />;
  if (kind === "approval" || String(activity?.status || "") === "awaiting_approval") return <IconQuestionCircle />;
  if (["webSearch", "webFetch"].includes(toolType)) return <IconThunderbolt />;
  return <IconSearch />;
}

function planningActivityRowTone(activity) {
  const tone = String(activity?.tone || "");
  if (["danger", "warning", "done", "active", "muted"].includes(tone)) return tone;
  const status = String(activity?.status || "");
  if (["failed", "blocked"].includes(status)) return "danger";
  if (["awaiting_approval", "paused", "skipped"].includes(status)) return "warning";
  if (String(activity?.kind || "") === "write" || status === "applied") return "done";
  if (status === "running") return "active";
  return "muted";
}

function planningActivityTargetLooksInternal(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^(ctx_|tool_|context_|run_|call_|fc_)[a-z0-9_]+$/i.test(text)) return true;
  if (/(^|[\\/])(tool_result|tool_report|context_asset|ctx_compact_asset)-/i.test(text)) return true;
  if (/asset_[a-z0-9_]{8,}/i.test(text) && !/[.\u4e00-\u9fa5]/.test(text)) return true;
  return false;
}

function planningActivityReadableResultTitleClient(results = []) {
  for (const result of safeArray(results)) {
    const candidates = [
      result?.title,
      result?.name,
      result?.relativePath,
      result?.path,
      result?.snippet
    ].map((item) => String(item || "").trim()).filter(Boolean);
    const readable = candidates.find((item) => !planningActivityTargetLooksInternal(item));
    if (readable) return readable;
  }
  return "";
}

function planningActivityReadableTarget(activity) {
  const fileNames = uniqueStrings(safeArray(activity?.fileNames).map((item) => String(item || "").trim()).filter(Boolean));
  if (fileNames.length > 0) {
    return `${fileNames.length} 个文件：${fileNames.slice(0, 3).join("；")}${fileNames.length > 3 ? " 等" : ""}`;
  }
  const topResultTitle = planningActivityReadableResultTitleClient(activity?.topResults);
  if (topResultTitle) return topResultTitle;
  const target = String(activity?.target || "").trim();
  if (planningActivityTargetLooksInternal(target)) {
    if (/compact/i.test(target)) return "压缩摘要";
    if (/asset/i.test(target)) return "";
  }
  return target;
}

function planningActivityReadableText(activity, label, target, count, summary) {
  const status = String(activity?.status || "");
  if (status === "running") return `正在${label}${target ? `：${target}` : ""}${summary ? ` · ${summary}` : ""}${count}`;
  if (status === "awaiting_approval") return `等待确认：${label}${target ? `：${target}` : ""}${count}`;
  if (["failed", "blocked"].includes(status)) return `${label}失败${target ? `：${target}` : ""}${summary ? ` · ${summary}` : ""}${count}`;
  if (status === "skipped") return `跳过${label}${target ? `：${target}` : ""}${summary ? ` · ${summary}` : ""}${count}`;
  if (status === "paused") return `暂停在${label}${target ? `：${target}` : ""}${summary ? ` · ${summary}` : ""}${count}`;
  const prefix = ["completed", "read", "applied"].includes(status) || planningActivityRowTone(activity) === "done" ? "已" : "";
  return `${prefix}${label}${target ? `：${target}` : ""}${summary ? ` · ${summary}` : ""}${count}`;
}

function buildPlanningActivityRowsFromTimeline(activityTimeline, limit = 6) {
  const timeline = safeArray(activityTimeline);
  if (!timeline.length) return [];
  const grouped = new Map();
  timeline.forEach((activity, index) => {
    const label = activity.label || planningToolKindLabel(activity.toolType);
    const readableTarget = planningActivityReadableTarget(activity);
    const key = [
      activity.kind || "",
      activity.toolType || "",
      label,
      /读取文件内容|定位文件|读取资料目录|建立文件索引/.test(label) ? "materials" : readableTarget,
      activity.status || ""
    ].join("\u0001");
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...activity,
        _index: index,
        occurrenceCount: Number(activity.occurrenceCount || 1),
        count: Number(activity.count || 0),
        fileNames: safeArray(activity.fileNames),
        topResults: safeArray(activity.topResults)
      });
      return;
    }
    const previous = grouped.get(key);
    grouped.set(key, {
      ...previous,
      ...activity,
      _index: previous._index,
      occurrenceCount: Math.max(Number(previous.occurrenceCount || 1), Number(activity.occurrenceCount || 1)),
      count: Math.max(Number(previous.count || 0), Number(activity.count || 0)),
      fileNames: uniqueStrings([...safeArray(previous.fileNames), ...safeArray(activity.fileNames)]).slice(0, 16),
      topResults: mergePlanningToolTopResults(previous.topResults, activity.topResults)
    });
  });
  return Array.from(grouped.values()).slice(-limit).map((activity, index) => {
    const label = activity.label || planningToolKindLabel(activity.toolType);
    const readableTarget = planningActivityReadableTarget(activity);
    const count = Number(activity.occurrenceCount || 1) > 1 ? ` ${activity.occurrenceCount} 次` : "";
    const summary = activity.summary && !readableTarget && !planningActivityTargetLooksInternal(activity.summary) ? shortText(activity.summary, 90) : "";
    return {
      key: `activity-${activity.key || activity.toolType || index}`,
      icon: planningActivityRowIcon(activity),
      text: planningActivityReadableText(activity, label, readableTarget ? shortText(readableTarget, 110) : "", count, summary),
      tone: planningActivityRowTone(activity)
    };
  });
}

function buildPlanningRunActivityRows({ run, toolTimeline, activityTimeline, eventStats, evidenceReads, taskGraphNodes, verifierSteps, pendingApprovals, liveStream, checkSummary, processSummary }) {
  const plainReply = isPlanningRunPlainAwaitingReply(run);
  const serverRows = buildPlanningActivityRowsFromTimeline(activityTimeline, 6).filter((row) => {
    if (!plainReply) return true;
    const text = String(row?.text || "").trim();
    if (String(row?.kind || "") === "model" || String(row?.toolType || "") === "model" || /思考下一步/.test(text)) return false;
    if (String(row?.kind || "") === "review" || /检查通过|自然语言回复已完成|已检查\s*\d+\s*项|验收步骤已记录/.test(text)) return false;
    if (planningDisplayTextLooksLikeLightReplyRetrievalNoise(text)) return false;
    return true;
  });
  if (serverRows.length > 0) {
    const rows = [...serverRows];
    if (!plainReply && (safeArray(verifierSteps).length > 0 || checkSummary?.hasDetails)) {
      rows.push({
        key: "check",
        icon: <IconSafe />,
        text: safeArray(verifierSteps).length > 0 ? `已检查 ${safeArray(verifierSteps).length} 项` : `检查：${planningReviewStatusLabel(checkSummary?.status)}`,
        tone: checkSummary?.status === "failed" ? "danger" : checkSummary?.status === "warning" ? "warning" : "done"
      });
    }
    if (String(run?.status || "") === "failed") {
      rows.push({
        key: "failed",
        icon: <IconBug />,
        text: processSummary?.summary || run?.error?.message || "运行出现失败",
        tone: "danger"
      });
    }
    return rows.slice(0, 8);
  }
  const tools = safeArray(toolTimeline);
  const shellCount = tools.filter((entry) => planningToolActionKind(entry.toolType) === "shell").reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0);
  const writeCount = tools.filter((entry) => planningToolActionKind(entry.toolType) === "write").reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0);
  const readCount = tools.filter((entry) => planningToolActionKind(entry.toolType) === "read").reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0);
  const completedSteps = safeArray(taskGraphNodes).filter((node) => node.status === "completed").length;
  const runningStep = safeArray(taskGraphNodes).find((node) => node.status === "in_progress") || safeArray(taskGraphNodes).find((node) => node.status !== "completed");
  const streamOutputCount = safeArray(liveStream?.outputs).length;
  const rows = [];
  if (runningStep) {
    rows.push({
      key: "step",
      icon: <IconMindMapping />,
      text: `正在处理：${shortText(runningStep.title || "当前步骤", 120)}`,
      tone: "active"
    });
  } else if (taskGraphNodes.length > 0) {
    rows.push({
      key: "step",
      icon: <IconMindMapping />,
      text: `已推进 ${completedSteps}/${taskGraphNodes.length} 个步骤`,
      tone: completedSteps >= taskGraphNodes.length ? "done" : "muted"
    });
  }
  const toolRows = tools
    .filter((entry) => entry?.toolType && entry.toolType !== "model_call")
    .slice(-4)
    .map((entry, index) => {
      const kind = planningToolActionKind(entry.toolType);
      const target = planningToolActionTarget(entry);
      const status = planningToolActionStatusLabel(entry.status);
      const label = planningToolActionLabel(entry);
      const occurrence = Number(entry.occurrenceCount || 1) > 1 ? ` ${entry.occurrenceCount} 次` : "";
      return {
        key: `tool-${entry.key || entry.toolType || index}`,
        icon: kind === "write" ? <IconEdit /> : kind === "shell" ? <IconCode /> : <IconSearch />,
        text: `${status}：${label}${target ? ` · ${shortText(target, 110)}` : ""}${occurrence}`,
        tone: ["failed", "blocked", "skipped"].includes(String(entry.status || "")) ? "danger" : entry.status === "awaiting_approval" ? "warning" : kind === "write" ? "done" : "muted"
      };
    });
  rows.push(...toolRows);
  if (toolRows.length === 0) {
    if (shellCount > 0) {
      rows.push({ key: "shell", icon: <IconCode />, text: `已运行 ${shellCount} 条命令`, tone: "muted" });
    }
    if (readCount > 0 || safeArray(evidenceReads).length > 0) {
      rows.push({
        key: "read",
        icon: <IconSearch />,
        text: `已读取 ${Math.max(readCount, 0) + safeArray(evidenceReads).length} 份资料`,
        tone: "muted"
      });
    }
    if (writeCount > 0) {
      rows.push({ key: "write", icon: <IconEdit />, text: `已写入 / 编辑 ${writeCount} 项`, tone: "done" });
    }
  }
  if (!plainReply && eventStats?.modelCalls > 0) {
    rows.push({
      key: "model",
      icon: <IconRobot />,
      text: eventStats.modelCalls > 1 ? `模型已返回 ${eventStats.modelCalls} 次` : "模型已返回",
      tone: "muted"
    });
  }
  if (streamOutputCount > 0) {
    rows.push({ key: "stdout", icon: <IconCode />, text: `收到工具输出 ${streamOutputCount} 条`, tone: "muted" });
  }
  if (!plainReply && (safeArray(verifierSteps).length > 0 || checkSummary?.hasDetails)) {
    rows.push({
      key: "check",
      icon: <IconSafe />,
      text: safeArray(verifierSteps).length > 0 ? `已检查 ${safeArray(verifierSteps).length} 项` : `检查：${planningReviewStatusLabel(checkSummary?.status)}`,
      tone: checkSummary?.status === "failed" ? "danger" : checkSummary?.status === "warning" ? "warning" : "done"
    });
  }
  if (safeArray(pendingApprovals).length > 0) {
    rows.push({
      key: "approval",
      icon: <IconQuestionCircle />,
      text: `等待确认 ${safeArray(pendingApprovals).length} 个操作`,
      tone: "warning"
    });
  }
  if (String(run?.status || "") === "failed") {
    rows.push({
      key: "failed",
      icon: <IconBug />,
      text: processSummary?.summary || run?.error?.message || "运行出现失败",
      tone: "danger"
    });
  }
  if (rows.length === 0) {
    rows.push({
      key: "idle",
      icon: <IconThunderbolt />,
      text: run?.status === "awaiting_approval" ? "等待你确认权限" : "正在处理本轮消息",
      tone: "muted"
    });
  }
  return rows.slice(0, 8);
}

function PlanningRunActivityLedger({ rows }) {
  return (
    <div className="codex-activity-ledger">
      {safeArray(rows).map((row) => (
        <div key={row.key} className={`codex-activity-row ${row.tone || "muted"}`}>
          <span className="codex-activity-icon">{row.icon}</span>
          <Text>{row.text}</Text>
        </div>
      ))}
    </div>
  );
}

function planningCodexStepTextKey(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[。.!！?？：:；;，,]/g, "")
    .slice(0, 96);
}

function buildPlanningCodexStepSegments({ notes, rows, summary, limit = 6, includeNotes = true }) {
  const seen = new Set();
  const pushSegment = (segments, segment) => {
    const text = String(segment?.text || "").trim();
    if (!text) return;
    const key = planningCodexStepTextKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    segments.push({ ...segment, text });
  };
  const noteSegments = includeNotes ? safeArray(notes).map((note, index) => ({
    key: `note-${note.id || index}`,
    type: "text",
    tone: planningProgressNoteTone(note),
    text: note.message
  })) : [];
  const actionSegments = safeArray(rows).map((row, index) => ({
    key: `row-${row.key || index}`,
    type: "action",
    tone: row.tone || "muted",
    icon: row.icon,
    text: row.text
  }));
  const segments = [];
  pushSegment(segments, {
    key: "summary",
    type: "text",
    tone: "active",
    text: summary
  });
  const max = Math.max(noteSegments.length, actionSegments.length);
  for (let index = 0; index < max; index += 1) {
    if (noteSegments[index]) pushSegment(segments, noteSegments[index]);
    if (actionSegments[index]) pushSegment(segments, actionSegments[index]);
  }
  if (segments.length <= limit) return segments;
  const head = segments[0];
  return [head, ...segments.slice(-(limit - 1))];
}

function PlanningCodexStepStream({ notes, rows, summary = "", elapsedText = "", statusText = "", live = false, limit = 6, showHeader = false, includeNotes = true }) {
  const segments = buildPlanningCodexStepSegments({ notes, rows, summary, limit, includeNotes });
  if (!segments.length && !showHeader && !live) return null;
  const thinkingText = statusText === "等待确认" ? "等待你确认权限" : "正在思考";
  return (
    <div className={`codex-step-stream ${live ? "is-live" : "is-settled"}`}>
      {showHeader && (
        <div className="codex-step-stream-head">
          <span>{elapsedText ? `已处理 ${elapsedText}` : live ? "正在处理" : "本轮过程"}</span>
          <IconArrowDown />
          {statusText && <em>{statusText}</em>}
        </div>
      )}
      {segments.length > 0 && (
        <div className="codex-step-segments">
          {segments.map((segment) => (
            <div key={segment.key} className={`codex-step-segment ${segment.type || "text"} ${segment.tone || "muted"}`}>
              {segment.type === "action" && <span className="codex-step-action-icon">{segment.icon || <IconThunderbolt />}</span>}
              <Text>{segment.text}</Text>
            </div>
          ))}
        </div>
      )}
      {live && (
        <div className={`codex-step-thinking ${statusText === "等待确认" ? "warning" : ""}`}>
          <span className="codex-step-thinking-dot" aria-hidden="true" />
          <Text>{thinkingText}</Text>
        </div>
      )}
    </div>
  );
}

function planningCodexDisplayStepTextKey(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/·\d+(次|条结果|项|个对象|个操作)/g, "")
    .replace(/[。.!！?？：:；;，,]/g, "")
    .slice(0, 120);
}

function planningUserVisibleInternalPattern() {
  return /运行器|verifier|completionVerifier|runtimeGuard|runtime_guard|tool_opportunity|工具机会|未闭环|未闭合|未落盘|空转|内部调度|observation|toolUseDecision|skillOps|native_tool_call|tool_call|tool_result|contextAsset|assetRef|evidence_scheduler|Agent\s*(仍|准备|循环|根据|要求|没有|未|连续|被|发现)/i;
}

function planningDisplayTextLooksLikeFileTarget(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (planningDisplayTextLooksLikeLightReplyRequest(text)) return false;
  if (/[A-Za-z]:[\\/]/.test(text)) return true;
  if (/[\\/][^\\/]+\.(md|markdown|txt|json|jsonl|ya?ml|csv|docx?|rtf|html?|xml)$/i.test(text)) return true;
  if (/\.(md|markdown|txt|json|jsonl|ya?ml|csv|docx?|rtf|html?|xml)(?:\s|$|[，。；;、])/i.test(text)) return true;
  return /文件|目录|资料目录|旧稿|正文|大纲|角色|场景|线索|世界书|记忆|档案/.test(text);
}

function planningDisplayTextLooksLikeLightReplyRequest(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[A-Za-z]:[\\/]/.test(text)) return false;
  if (/\.(md|markdown|txt|json|jsonl|ya?ml|csv|docx?|rtf|html?|xml)(?:\s|$|[，。；;、])/i.test(text)) return false;
  const inlineOnly = /只(?:用)?(?:一句话)?回复|只回复|仅回复|不要写入|不用写入|无需写入|不写入|不要保存|不用保存|无需保存|不保存|不要沉淀|不用沉淀|无需沉淀/.test(text);
  const noEvidence = /不(?:要|用|需|需要)?(?:检索|搜索|读取|打开|查看|调用工具)|无需工具|不用工具/.test(text);
  const plainTalk = /回复|说明|解释|讨论|聊/.test(text)
    && !/读取|查看|打开|检索|搜索|索引|列出|提取|导入|整理|分析|审查|检查|文件|文件夹|目录|旧稿|资料/.test(text);
  return inlineOnly || noEvidence || plainTalk;
}

function planningDisplayTextHasConcreteReadTarget(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[A-Za-z]:[\\/]/.test(text)) return true;
  if (/\.(md|markdown|txt|json|jsonl|ya?ml|csv|docx?|rtf|html?|xml)(?:\s|$|[，。；;、])/i.test(text)) return true;
  return /(?:读取|查看|打开|检索|搜索|索引|列出).{0,24}(?:文件|文件夹|目录|资料|旧稿|正文|大纲)|(?:文件|文件夹|目录|资料|旧稿|正文|大纲).{0,24}(?:读取|查看|打开|检索|搜索|索引|列出)/.test(text);
}

function planningDisplayTextLooksLikeLightReplyRetrievalNoise(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const retrievalPrefix = /^(?:已|正在|完成|失败[:：])?\s*(?:查找项目资料|项目检索|查找资料|资料检索|读取资料|检索资料|工作区检索|定位文件|查找历史资料|检索工作区文件)[:：]?\s*/;
  if (!retrievalPrefix.test(text)) return false;
  const target = text.replace(retrievalPrefix, "").trim();
  return planningDisplayTextLooksLikeLightReplyRequest(target || text);
}

function planningDisplayTextLooksLikePureHistoryAsset(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /继续任务前自动|旧运行|历史证据|证据原文|被压缩的历史|按引用读取|压缩摘要|上下文资产|context asset|assetRef|tool_asset/i.test(text)
    && !planningDisplayTextLooksLikeFileTarget(text);
}

function planningTextLooksInternalToUser(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return planningUserVisibleInternalPattern().test(text);
}

function planningUserVisibleText(value, maxLength = 280) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!text || planningTextLooksInternalToUser(text)) return "";
  return shortText(text, maxLength);
}

function planningCodexDisplayStepIcon(step) {
  const kind = String(step?.kind || "");
  const type = String(step?.type || "");
  const tone = String(step?.tone || "");
  if (tone === "danger") return <IconBug />;
  if (tone === "warning" || step?.status === "awaiting_approval") return <IconQuestionCircle />;
  if (kind === "write") return <IconEdit />;
  if (kind === "shell") return <IconCode />;
  if (kind === "review" || type === "status") return <IconSafe />;
  if (kind === "web") return <IconSearch />;
  if (kind === "read") return <IconSearch />;
  return <IconThunderbolt />;
}

function normalizePlanningCodexDisplayStep(step, fallbackIndex = 0) {
  const source = step && typeof step === "object" ? step : {};
  const type = ["text", "action", "status"].includes(String(source.type || "")) ? String(source.type) : "status";
  let text = String(source.text || source.summary || "").trim();
  if (!text) return null;
  text = text
    .replace(/^检查[:：]\s*检查通过[。.]?$/, "检查通过")
    .replace(/^检查[:：]\s*检查完成[:：]\s*/, "检查：")
    .replace(/^检查[:：]\s*检查未通过[:：]\s*/, "检查未通过：")
    .trim();
  if (/^\s*[{[]/.test(text) && /tool_calls?|function_call|arguments|skillOps|archivePatch/i.test(text)) return null;
  if (/native_tool_call|tool_result|tool_call|contextAsset|assetRef|evidence_scheduler|model_call|skillOps/i.test(text)) return null;
  if (planningTextLooksInternalToUser(text)) return null;
  if (planningDisplayTextLooksLikeLightReplyRetrievalNoise(text)) return null;
  if (planningDisplayTextLooksLikePureHistoryAsset(text)) return null;
  if (/思考下一步|自然语言回复已完成|已检查\s*\d+\s*项|确定性完成判定|模型审查|自检未发现明显/.test(text)) return null;
  if (/正在处理回复|处理回复[:：]|调用策划模型|DeepSeek|GPT|Claude|Gemini|Kimi|Qwen|GLM|模型/i.test(text) && !/模型不存在|上下文超限|供应商|余额|限流|失败|错误/.test(text)) return null;
  if (/^检查[:：]\s*(警告|有提醒|warning)$/i.test(text)) return null;
  if (/可复用内容.*没有闭环|未闭合.*工具目标|让 Agent 继续|运行器要求|工具机会|未落盘/.test(text)) return null;
  return {
    id: String(source.id || source.key || `${type}-${fallbackIndex}-${planningCodexDisplayStepTextKey(text)}`),
    type,
    text,
    tone: String(source.tone || "muted"),
    status: String(source.status || ""),
    kind: String(source.kind || ""),
    createdAt: source.createdAt || "",
    icon: source.icon || null
  };
}

function normalizePlanningPublicPartForDisplay(part, fallbackIndex = 0) {
  const source = part && typeof part === "object" ? part : {};
  const text = String(source.text || source.summary || source.label || "").trim();
  if (!text) return null;
  return normalizePlanningCodexDisplayStep({
    id: source.id || `public-part-${fallbackIndex}`,
    type: ["text", "action", "status"].includes(String(source.type || "")) ? source.type : "action",
    text,
    tone: source.tone || "muted",
    status: source.status || "",
    kind: source.kind || "",
    createdAt: source.createdAt || source.updatedAt || ""
  }, fallbackIndex);
}

function normalizePlanningTurnItemForDisplay(item, fallbackIndex = 0) {
  const source = item && typeof item === "object" ? item : {};
  const title = String(source.title || "").trim();
  const text = String(source.text || source.summary || "").trim();
  const displayText = text || title;
  if (!displayText) return null;
  const kind = String(source.kind || "");
  const type = kind === "message" ? "text" : kind === "tool" ? "action" : "status";
  const visibleKind = kind === "tool"
    ? planningTurnItemVisibleToolKind(`${title} ${displayText}`)
    : kind;
  return normalizePlanningCodexDisplayStep({
    id: source.id || `turn-item-${fallbackIndex}`,
    type,
    text: displayText,
    tone: source.tone || "",
    status: source.status || "",
    kind: visibleKind,
    createdAt: source.createdAt || source.updatedAt || ""
  }, fallbackIndex);
}

function planningTurnItemIsProcessVisible(item, live = false) {
  const source = item && typeof item === "object" ? item : {};
  const kind = String(source.kind || "");
  const text = String(source.text || source.summary || source.title || "").trim();
  if (!text) return false;
  if (kind === "message") {
    // assistant 正文属于正式会话消息；过程详情只承载工具、权限、审查和状态。
    // 运行中只有真实模型片段才应进入文本流，不能把占位句当成 Codex 过程节点。
    return live && !planningCodexStepIsGenericBridge({ ...source, kind: "message", type: "text", text });
  }
  return true;
}

function planningCanonicalProcessStepsFromRun(run, { live = false, limit = 12, rows = [] } = {}) {
  if (!run || typeof run !== "object") return [];
  const turnItemSteps = safeArray(run.turnItems)
    .filter((item) => planningTurnItemIsProcessVisible(item, live))
    .map(normalizePlanningTurnItemForDisplay)
    .filter((step) => step?.text)
    .filter((step) => shouldShowPlanningCodexServerStep(step, live));
  if (turnItemSteps.length > 0) return turnItemSteps.slice(-limit);
  const processSteps = safeArray(run.processSteps)
    .map(normalizePlanningCodexDisplayStep)
    .filter((step) => step?.text)
    .filter((step) => shouldShowPlanningCodexServerStep(step, live));
  if (processSteps.length > 0) return processSteps.slice(-limit);
  return buildPlanningCodexDisplaySteps({
    run,
    rows,
    statusText: planningRunStatusLabel(run.status),
    pendingApprovals: safeArray(run.approvals).filter((approval) => approval.status === "pending").length,
    failedCount: 0,
    live,
    limit
  });
}

function planningTurnItemVisibleToolKind(value) {
  const text = String(value || "");
  if (/运行命令|Shell|shell|命令|终端/.test(text)) return "shell";
  if (/写入|编辑|更新|保存|修改|补丁|diff|档案|记忆|世界书/.test(text)) return "write";
  if (/联网|网页|搜索网页|抓取/.test(text)) return "web";
  if (/检查|审查|验收|诊断/.test(text)) return "review";
  return "read";
}

function pushPlanningCodexDisplayStep(steps, seen, source, fallbackIndex = 0) {
  const step = normalizePlanningCodexDisplayStep(source, fallbackIndex);
  if (!step) return;
  const key = `${step.type}:${planningCodexDisplayStepTextKey(step.text)}`;
  if (!key || seen.has(key)) return;
  seen.add(key);
  steps.push(step);
}

function shouldShowPlanningCodexServerStep(step, live = false) {
  const source = step && typeof step === "object" ? step : {};
  const text = String(source.text || source.summary || "").trim();
  const kind = String(source.kind || "");
  const toolType = String(source.toolType || "");
  const status = String(source.status || "");
  if (!text) return false;
  // 终态 assistant 正文已经作为会话消息展示，过程流只展示读写、审批、检查等动作。
  // 否则会在回复下面重复出现“形成了本轮回复”这类没有动作含义的占位句。
  if (!live && kind === "message") return false;
  if (/native_tool_call|tool_result|tool_call|contextAsset|assetRef|evidence_scheduler|model_call|skillOps/i.test(text)) return false;
  if (planningTextLooksInternalToUser(text)) return false;
  if (planningDisplayTextLooksLikePureHistoryAsset(text)) return false;
  if (/^(已)?形成了?本轮回复|已形成回复，等待你继续|已保留本轮进度|本轮没有可靠完成，已保留原因$/.test(text)) return false;
  if (/可复用内容.*没有闭环|未闭合.*工具目标|让 Agent 继续|运行器要求|工具机会|未落盘/.test(text)) return false;
  if (/^处理第\s*\d+\s*段[:：]|已完成这一段思考|本轮普通回复已完成|根据上一段结果继续读取、编辑、检查或收束/i.test(text)) return false;
  if (!live && /整理本轮上下文|准备进入连续处理|已确认权限|确认权限|权限已确认/i.test(text)) return false;
  if (/整理本轮上下文|准备进入连续处理|权限已确认，?继续处理|确认已批准|已批准高风险操作|策划 Agent 已回复|等待你继续/i.test(text)) return false;
  if (!live && /检查通过：本轮普通回复|已检查结果[:：]?\s*正在检查本轮回复|正在检查本轮回复|正在检查本轮结果|已检查通过|自然语言回复已完成|上下文压缩输入过大|确定性摘要|长内容引用|^\s*已检查\s*\d+\s*项|验收步骤已记录/i.test(text)) return false;
  if (/正在处理回复|处理回复[:：]|调用策划模型|DeepSeek|GPT|Claude|Gemini|Kimi|Qwen|GLM|模型/i.test(text) && !/模型不存在|上下文超限|供应商|余额|限流|失败|错误/.test(text)) return false;
  if (/^检查[:：]\s*(警告|有提醒|warning)$/i.test(text)) return false;
  if (!live && /思考下一步|确定性完成判定|模型审查|自检未发现明显/i.test(text)) return false;
  if (!live && planningDisplayTextLooksLikeLightReplyRetrievalNoise(text)) return false;
  if (!live && /^(已)?查找资料[:：]?/.test(text)) {
    return /文件|目录|资料目录|旧稿|正文|大纲|角色|世界书|记忆|档案/.test(text);
  }
  if (!live && kind === "approval" && status === "completed") return false;
  if (kind === "model" || toolType === "model" || /^已?思考下一步/.test(text)) {
    return live && ["running", "queued"].includes(status);
  }
  return true;
}

function isPlanningCodexTransitionStep(step) {
  const text = String(step?.text || step?.summary || "").trim();
  const kind = String(step?.kind || "");
  const status = String(step?.status || "");
  if (!text) return true;
  if (kind === "approval" && status === "completed") return true;
  return /整理本轮上下文|准备进入连续处理|权限已确认，?继续处理|确认已批准|已批准高风险操作|策划 Agent 已回复|等待你继续|本轮普通回复已完成/i.test(text);
}

function normalizePlanningRunPartForDisplay(part, fallbackIndex = 0) {
  if (!part || typeof part !== "object") return null;
  const type = String(part.type || "status");
  const status = String(part.status || "completed");
  const text = String(part.text || "").trim();
  const outputPreview = String(part.outputPreview || "").trim();
  const label = String(part.label || "").trim();
  const target = String(part.target || "").trim();
  if (!text && !label && !target && !outputPreview) return null;
  const hiddenText = /context asset|evidence_scheduler|native_tool_call|skillOps|tool_call|tool_result|assetRef|runId|tool_asset/i;
  if (hiddenText.test(text) && !label && !target) return null;
  if (planningTextLooksInternalToUser([text, label, target].filter(Boolean).join(" "))) return null;
  return {
    id: String(part.id || `part-${fallbackIndex}`),
    type: ["assistant_text", "tool", "status", "approval", "review"].includes(type) ? type : "status",
    status,
    tone: String(part.tone || (status === "failed" ? "danger" : status === "running" ? "active" : "muted")),
    kind: String(part.kind || ""),
    toolType: String(part.toolType || ""),
    label,
    target,
    text,
    outputPreview: planningTextLooksInternalToUser(outputPreview) ? "" : outputPreview,
    count: Number(part.count || 0),
    createdAt: part.createdAt || "",
    updatedAt: part.updatedAt || "",
    meta: part.meta || null
  };
}

function planningRunPartIcon(part) {
  if (part.type === "review") return <IconSafe />;
  if (part.type === "approval") return <IconQuestionCircle />;
  if (part.type === "status") return <IconRobot />;
  if (part.kind === "write") return <IconEdit />;
  if (part.kind === "shell") return <IconCode />;
  if (part.kind === "web") return <IconSearch />;
  if (part.kind === "review") return <IconSafe />;
  return <IconSearch />;
}

function planningRunPartStatusText(part) {
  const status = String(part?.status || "");
  if (status === "running" || status === "streaming") return "正在";
  if (status === "awaiting_approval") return "待确认";
  if (status === "failed") return "失败";
  if (status === "blocked") return "阻断";
  if (status === "paused") return "暂停";
  if (status === "cancelled") return "已取消";
  if (part?.type === "review") return part?.tone === "warning" ? "有提醒" : "完成";
  return "完成";
}

function planningRunPartActionLabel(part) {
  const toolType = String(part?.toolType || "");
  const visibleTarget = [
    part?.target,
    part?.label,
    part?.text,
    part?.outputPreview
  ].filter(Boolean).join(" ");
  if (part?.type === "review") return "检查";
  if (part?.type === "approval") return "权限确认";
  if (part?.type === "status") return "思考";
  if (toolType === "listFiles") return "读取资料目录";
  if (toolType === "indexLocalFiles") return "建立文件索引";
  if (toolType === "search") return "检索项目资料";
  if (toolType === "searchLocalFiles") return "检索工作区文件";
  if (toolType === "searchContextAssets") return planningDisplayTextLooksLikeFileTarget(visibleTarget) ? "定位文件" : "查找资料";
  if (toolType === "readContextAsset") return planningDisplayTextLooksLikeFileTarget(visibleTarget) ? "读取文件内容" : "读取历史资料";
  if (["readLocalFile", "readFile"].includes(toolType)) return "读取文件内容";
  if (toolType === "readMessageAttachment") return "读取拖入文件";
  if (toolType) return planningToolKindLabel(toolType);
  const label = String(part?.label || "").trim();
  if (/^查找资料$/.test(label)) return "查找资料";
  if (/^检查完成$/.test(label)) return "检查";
  return label || "处理资料";
}

function planningRunPartTargetText(part) {
  const target = String(part?.target || "").trim();
  if (!target || target === "." || target === "./") return "当前资料目录";
  if (target === "当前工作区" && ["listFiles", "indexLocalFiles", "searchLocalFiles"].includes(String(part?.toolType || ""))) return "当前资料目录";
  return target
    .replace(/context asset|assetRef|tool_asset|run_[a-z0-9_]+/ig, "")
    .replace(/\s+/g, " ")
    .trim();
}

function planningRunPartPreviewText(part) {
  const preview = String(part?.outputPreview || "").trim();
  if (!preview) return "";
  const cleaned = preview
    .replace(/ · 警告：这是轻量结构化索引，不是完整 LSP 语义服务器；适合资料\/脚本\/Markdown 的导航和后续 grep\/readFile 定位。/g, "")
    .replace(/context asset|assetRef|tool_asset|run_[a-z0-9_]+/ig, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function planningRunPartText(part) {
  const text = String(part.text || "").trim();
  if (planningTextLooksInternalToUser(text)) return "";
  const occurrenceSuffix = Number(part.occurrenceCount || 0) > 1 ? ` · ${part.occurrenceCount} 次` : "";
  if (text && part.type !== "tool") return `${text
    .replace(/^已已/, "已")
    .replace(/^正在已/, "正在")
    .trim()}${occurrenceSuffix}`;
  const label = planningRunPartActionLabel(part);
  const target = planningRunPartTargetText(part);
  const subject = target ? `${label}：${target}` : label;
  if (part.status === "running") return `正在${subject}${occurrenceSuffix}`;
  if (part.status === "failed") return `${subject}失败${occurrenceSuffix}`;
  if (part.status === "awaiting_approval") return `等待确认：${subject}${occurrenceSuffix}`;
  return `${planningRunPartStatusText(part)}：${subject}${occurrenceSuffix}`;
}

function shouldHidePlanningRunPartFromMainFlow(part, { compact = false, live = false, hasMeaningfulAction = false } = {}) {
  if (!part) return true;
  // 公开消息流里只保留真正的动作、结果和等待状态。
  // 权限批准、整理上下文、继续处理这类过渡句留在过程详情，避免终态看起来仍卡在运行中。
  if (isPlanningCodexTransitionStep(part) && !(part.type === "approval" && part.status === "awaiting_approval")) return true;
  if (part.type === "status" && hasMeaningfulAction && /^(已完成这一段思考|正在准备本轮上下文|正在根据上一段结果继续处理|正在检查本轮结果|正在整理本轮上下文|我正在整理本轮上下文)/.test(String(part.text || "").trim())) return true;
  const label = planningRunPartActionLabel(part);
  const target = planningRunPartTargetText(part);
  const visibleText = planningRunPartText(part) || [label, target, part.outputPreview].filter(Boolean).join("：");
  const toolType = String(part.toolType || "");
  if (!live && (part.kind === "model" || toolType === "model" || label === "思考下一步")) return true;
  if (!live && part.type === "review" && /正在检查本轮回复|正在检查本轮结果|自然语言回复已完成|本轮结果可以进入会话|检查通过|完成判定器未发现未闭合任务节点/i.test(String(part.text || "").trim())) return true;
  const isReadOrFind = part.type === "tool" && [
    "search",
    "searchContextAssets",
    "searchLocalFiles",
    "readContextAsset",
    "readLocalFile",
    "readFile",
    "readMessageAttachment"
  ].includes(toolType);
  if (!live && isReadOrFind && (planningDisplayTextLooksLikeLightReplyRequest(visibleText) || planningDisplayTextLooksLikeLightReplyRetrievalNoise(visibleText))) {
    return true;
  }
  if (!live && isReadOrFind && /^检索项目资料$|^定位文件$|^查找历史资料$|^检索工作区文件$/.test(label) && target && !planningDisplayTextLooksLikeFileTarget(target)) {
    return true;
  }
  if (compact && part.type === "status" && part.status === "completed" && hasMeaningfulAction) return true;
  return false;
}

function compactPlanningRunPartsForDisplay(parts) {
  const result = [];
  const toolIndexByKey = new Map();
  for (const part of safeArray(parts)) {
    if (!part) continue;
    const canMergeTool = part.type === "tool" && !["running", "streaming", "awaiting_approval"].includes(part.status);
    const key = canMergeTool
      ? [
          part.type,
          part.status,
          part.kind,
          part.toolType,
          String(part.label || "").trim(),
          String(part.target || "").trim()
        ].join("\u0001")
      : "";
    if (key && toolIndexByKey.has(key)) {
      const index = toolIndexByKey.get(key);
      const previous = result[index];
      result[index] = {
        ...previous,
        ...part,
        id: previous.id,
        text: previous.text || part.text,
        outputPreview: part.outputPreview || previous.outputPreview,
        count: Math.max(Number(previous.count || 0), Number(part.count || 0)),
        occurrenceCount: Number(previous.occurrenceCount || 1) + 1,
        createdAt: previous.createdAt || part.createdAt,
        updatedAt: part.updatedAt || previous.updatedAt
      };
      continue;
    }
    if (key) toolIndexByKey.set(key, result.length);
    result.push({ ...part, occurrenceCount: 1 });
  }
  return result;
}

function visiblePlanningRunParts(parts, { compact = false, live = false } = {}) {
  const normalized = compactPlanningRunPartsForDisplay(safeArray(parts).map(normalizePlanningRunPartForDisplay).filter(Boolean));
  if (!normalized.length) return [];
  const hasMeaningfulAction = normalized.some((part) => ["tool", "review", "approval", "assistant_text"].includes(part.type));
  const filtered = normalized.filter((part) => {
    return !shouldHidePlanningRunPartFromMainFlow(part, { compact, live, hasMeaningfulAction });
  });
  const limit = live ? 12 : compact ? 6 : 14;
  return filtered.slice(-limit);
}

function PlanningRunToolCell({ part, compact = false, onOpenDetails }) {
  const canOpen = typeof onOpenDetails === "function";
  const label = planningRunPartActionLabel(part);
  const target = planningRunPartTargetText(part);
  const statusText = planningRunPartStatusText(part);
  const preview = planningRunPartPreviewText(part);
  const occurrence = Number(part.occurrenceCount || 1) > 1 ? `${part.occurrenceCount} 次` : "";
  const count = Number(part.count || 0) > 0 ? `${part.count} 条结果` : "";
  const meta = [statusText, occurrence, count].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="codex-tool-cell-icon">
        {planningRunPartIcon(part)}
        {["running", "streaming"].includes(String(part.status || "")) && <span className="codex-tool-cell-pulse" aria-hidden="true" />}
      </span>
      <span className="codex-tool-cell-body">
        <span className="codex-tool-cell-line">
          <Text className="codex-tool-cell-title">{label}</Text>
          {target && <Text className="codex-tool-cell-target" type="secondary">{shortText(target, compact ? 86 : 132)}</Text>}
          {meta && <Text className={`codex-tool-cell-meta ${part.status || "completed"}`}>{meta}</Text>}
        </span>
        {!compact && preview && <Text className="codex-tool-cell-preview" type="secondary">{shortText(preview, 220)}</Text>}
      </span>
    </>
  );
  const className = `codex-tool-cell ${part.type || "tool"} ${part.status || "completed"} ${part.tone || "muted"} ${canOpen ? "is-clickable" : ""}`;
  return canOpen ? (
    <button type="button" className={className} onClick={onOpenDetails} aria-label="查看本轮过程详情">
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function PlanningRunStatusCell({ part, compact = false, onOpenDetails }) {
  if (compact && part.type === "status" && part.status === "completed") return null;
  const canOpen = typeof onOpenDetails === "function";
  const text = planningRunPartText(part);
  if (!text) return null;
  const content = (
    <>
      <span className="codex-status-cell-icon">{planningRunPartIcon(part)}</span>
      <Text>{shortText(text, compact ? 110 : 180)}</Text>
    </>
  );
  const className = `codex-status-cell ${part.type || "status"} ${part.status || "completed"} ${part.tone || "muted"} ${canOpen ? "is-clickable" : ""}`;
  return canOpen ? (
    <button type="button" className={className} onClick={onOpenDetails} aria-label="查看本轮过程详情">
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function buildPlanningTurnItemsTrailSummary(run) {
  const items = safeArray(run?.turnItems)
    .map(normalizePlanningTurnItemForDisplay)
    .filter(Boolean);
  if (!items.length) return "";
  const toolItems = items.filter((item) => item.kind === "tool" || item.type === "action");
  if (!toolItems.length) return "";
  const parts = [];
  const readItems = toolItems.filter((item) => /读取|整理|定位|查找/.test(item.text));
  const writeItems = toolItems.filter((item) => /写入|编辑|更新|保存|修改/.test(item.text));
  const readCount = readItems.length;
  const writeCount = writeItems.length;
  const firstRead = readItems.slice().sort((a, b) => planningCodexStepInformationRank(b) - planningCodexStepInformationRank(a))[0];
  const firstWrite = writeItems.slice().sort((a, b) => planningCodexStepInformationRank(b) - planningCodexStepInformationRank(a))[0];
  if (firstRead) {
    parts.push(readCount > 1 ? `${shortText(firstRead.text.replace(/^已?/, ""), 72)} 等 ${readCount} 步` : shortText(firstRead.text.replace(/^已?/, ""), 86));
  }
  if (firstWrite) {
    parts.push(writeCount > 1 ? `${shortText(firstWrite.text.replace(/^已?/, ""), 72)} 等 ${writeCount} 步` : shortText(firstWrite.text.replace(/^已?/, ""), 86));
  }
  const issueItem = items.slice().reverse().find((item) => item.tone === "danger" || item.tone === "warning" || /失败|阻断|未通过|暂停|等待确认/.test(item.text));
  if (issueItem) {
    const issueText = /检查完成|提醒|warning/i.test(issueItem.text)
      ? "有提醒"
      : shortText(issueItem.text, 70);
    parts.push(issueText);
  }
  if (!issueItem && items.some((item) => item.kind === "review" || /检查/.test(item.text))) parts.push("检查通过");
  return parts.filter(Boolean).slice(0, 3).join(" · ");
}

function PlanningRunPartStream({ parts, live = false, compact = false, onOpenDetails }) {
  const visibleParts = visiblePlanningRunParts(parts, { compact, live });
  if (!visibleParts.length && !live) return null;
  return (
    <div className={`codex-part-stream ${live ? "is-live" : "is-settled"} ${compact ? "is-compact" : ""}`}>
      {visibleParts.map((part, index) => {
        if (part.type === "assistant_text") {
          return (
            <div key={part.id || index} className="codex-part-text">
              <PlanningMessageContent content={part.text} isUser={false} />
            </div>
          );
        }
        if (part.type === "tool") {
          return <PlanningRunToolCell key={part.id || index} part={part} compact={compact} onOpenDetails={onOpenDetails} />;
        }
        return <PlanningRunStatusCell key={part.id || index} part={part} compact={compact} onOpenDetails={onOpenDetails} />;
      })}
    </div>
  );
}

function buildPlanningCodexDisplaySteps({ run, stream, rows, statusText, pendingApprovals = 0, failedCount = 0, live = false, limit = 8 }) {
  const seen = new Set();
  const steps = [];
  const turnItems = safeArray(run?.turnItems)
    .filter((item) => planningTurnItemIsProcessVisible(item, live))
    .map(normalizePlanningTurnItemForDisplay)
    .filter((step) => shouldShowPlanningCodexServerStep(step, live));
  if (turnItems.length > 0) {
    turnItems.forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
    const hasBlockingState = turnItems.some((step) => ["awaiting_approval", "failed", "blocked", "paused"].includes(String(step.status || "")));
    // Codex APP 的主消息流以 turn item 为一等过程协议。
    // 只要后端已经给出 turnItems，就不再把 processSteps/publicParts/activityRows 叠回主流程；
    // 那些旧来源只进入过程详情，避免工具结果、审计、模型调用重复占屏。
    if (!live || hasBlockingState || turnItems.some((step) => step.type === "action" || step.kind !== "message")) {
      return finalizePlanningCodexDisplaySteps(steps, { live, limit: Math.min(limit, live ? 4 : 7) });
    }
  }
  if (live) {
    buildPlanningLiveStreamSteps(stream, seen)
      .forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
    if (steps.length > 0) {
      return finalizePlanningCodexDisplaySteps(steps, { live, limit: Math.min(limit, 3) });
    }
  }
  const processSteps = safeArray(run?.processSteps);
  const serverSteps = live && processSteps.length > 0 ? processSteps : safeArray(run?.displaySteps);
  // 终态只消费后端清洗后的公开动作项。
  // 旧版本会从 rows / events / items 兜底重建过程，导致刷新后把内部审计重新展示到主消息流。
  if (!live && isPlanningRunDisplayTerminal(run) && serverSteps.length > 0) {
    serverSteps
      .filter((step) => shouldShowPlanningCodexServerStep(step, live))
      .forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
  }
  if (live && serverSteps.length > 0) {
    serverSteps
      .filter((step) => shouldShowPlanningCodexServerStep(step, live))
      .forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
    if (steps.length > 0) {
      return finalizePlanningCodexDisplaySteps(steps, { live, limit: Math.min(limit, 4) });
    }
  }
  const publicParts = safeArray(run?.publicParts)
    .map(normalizePlanningPublicPartForDisplay)
    .filter((step) => shouldShowPlanningCodexServerStep(step, live));
  if (publicParts.length > 0) {
    const visiblePublicParts = live
      ? publicParts
      : publicParts.filter((step) => !isPlanningCodexTransitionStep(step));
    visiblePublicParts.forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
    if (live && steps.length > 0) {
      return finalizePlanningCodexDisplaySteps(steps, { live, limit: Math.min(limit, 4) });
    }
  }
  if (!live && isPlanningRunDisplayTerminal(run) && steps.length > 0) {
    return finalizePlanningCodexDisplaySteps(steps, { live, limit: Math.min(limit, 7) });
  }
  if (!live && isPlanningRunDisplayTerminal(run)) return [];
  if (serverSteps.length > 0) {
    serverSteps
      .filter((step) => shouldShowPlanningCodexServerStep(step, live))
      .forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
  }
  const actionSteps = safeArray(rows)
    .filter((row) => {
      if (!row || String(row.key || "") === "idle") return false;
      if (String(row.key || "") === "model" || String(row.kind || "") === "model" || String(row.toolType || "") === "model") return false;
      return true;
    })
    .map((row, index) => ({
      id: `row-${row.key || index}`,
      type: "action",
      tone: row.tone || "muted",
      text: planningCodexActionRowText(row),
      icon: row.icon
    }));
  actionSteps.forEach((step, index) => pushPlanningCodexDisplayStep(steps, seen, step, index));
  if (!steps.length && pendingApprovals > 0) {
    pushPlanningCodexDisplayStep(steps, seen, {
      type: "status",
      tone: "warning",
      status: "awaiting_approval",
      text: "等待你确认权限"
    });
  }
  if (!steps.length && live) {
    pushPlanningCodexDisplayStep(steps, seen, {
      type: "status",
      tone: failedCount > 0 ? "warning" : "active",
      text: failedCount > 0 ? "正在根据失败原因继续修正" : (statusText === "等待确认" ? "等待你确认权限" : "正在准备本轮处理")
    });
  }
  return finalizePlanningCodexDisplaySteps(steps, { live, limit });
}

function buildPlanningCodexLiveSummary(steps, statusText = "") {
  const visible = safeArray(steps).map(normalizePlanningCodexDisplayStep).filter(Boolean);
  const important = visible.slice().reverse().find((step) => {
    const text = String(step.text || "");
    return /等待确认|失败|阻断|未通过|写入|编辑|更新|保存|运行命令/.test(text)
      || ["warning", "danger"].includes(String(step.tone || ""))
      || ["awaiting_approval", "failed", "blocked"].includes(String(step.status || ""));
  }) || visible.slice().reverse().find((step) => step.type === "action") || visible[visible.length - 1] || null;
  if (!important) {
    return {
      tone: statusText === "等待确认" ? "warning" : "active",
      text: statusText === "等待确认" ? "等待你确认权限" : "正在处理这一轮",
      step: null
    };
  }
  const text = String(important.text || "").trim()
    .replace(/^已读取资料目录[:：]\s*/, "正在读取资料目录：")
    .replace(/^已整理资料目录[:：]\s*/, "正在整理资料目录：")
    .replace(/^已读取文件内容[:：]\s*/, "正在读取文件内容：")
    .replace(/^已定位文件[:：]\s*/, "正在定位文件：")
    .replace(/^已查找资料[:：]\s*/, "正在查找资料：")
    .replace(/^已/, "正在");
  return {
    tone: important.tone || "active",
    text: shortText(text || "正在处理这一轮", 180),
    step: important
  };
}

function PlanningCodexDisplayStream({ steps, live = false, compact = false, summaryMode = false, onOpenDetails }) {
  const visibleSteps = safeArray(steps).map(normalizePlanningCodexDisplayStep).filter(Boolean);
  if (!visibleSteps.length && !live) return null;
  const canOpen = typeof onOpenDetails === "function";
  const settledSummary = !live && summaryMode ? buildPlanningCodexSettledSummary(visibleSteps) : null;
  if (settledSummary) {
    const content = (
      <>
        <span className="codex-display-summary-icon">
          {settledSummary.tone === "danger" ? <IconBug /> : settledSummary.tone === "warning" ? <IconQuestionCircle /> : <IconSafe />}
        </span>
        <Text>{settledSummary.text}</Text>
      </>
    );
    return canOpen ? (
      <button type="button" className={`codex-display-summary ${settledSummary.tone}`} onClick={onOpenDetails} aria-label="查看本轮过程详情">
        {content}
      </button>
    ) : (
      <div className={`codex-display-summary ${settledSummary.tone}`}>
        {content}
      </div>
    );
  }
  if (live) {
    const rows = visibleSteps.slice(-4);
    if (!rows.length) {
      const liveSummary = buildPlanningCodexLiveSummary(visibleSteps);
      const content = (
        <>
          <span className="codex-display-action-icon">{planningCodexDisplayStepIcon(liveSummary.step || { tone: liveSummary.tone })}</span>
          <Text>{liveSummary.text}</Text>
        </>
      );
      return canOpen ? (
        <button type="button" className={`codex-display-step action codex-display-live-summary is-clickable ${liveSummary.tone || "active"}`} onClick={onOpenDetails} aria-label="查看本轮过程详情">
          {content}
        </button>
      ) : (
        <div className={`codex-display-step action codex-display-live-summary ${liveSummary.tone || "active"}`}>
          {content}
        </div>
      );
    }
    return (
      <div className="codex-display-stream is-live">
        {rows.map((step, index) => {
          if (step.type === "text") {
            return (
              <div key={step.id || index} className={`codex-display-step text is-live-text ${step.tone || "active"}`}>
                <PlanningMessageContent content={step.text} isUser={false} />
              </div>
            );
          }
          const content = (
            <>
              <span className="codex-display-action-icon">{step.icon || planningCodexDisplayStepIcon(step)}</span>
              <Text>{step.text}</Text>
            </>
          );
          const className = `codex-display-step action is-live-row ${step.status || ""} ${step.tone || "muted"} ${canOpen ? "is-clickable" : ""}`;
          return canOpen ? (
            <button key={step.id || index} type="button" className={className} onClick={onOpenDetails} aria-label="查看本轮过程详情">
              {content}
            </button>
          ) : (
            <div key={step.id || index} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={`codex-display-stream ${live ? "is-live" : "is-settled"} ${compact ? "is-compact" : ""}`}>
      {visibleSteps.map((step, index) => {
        if (step.type === "text") {
          return (
            <div key={step.id || index} className={`codex-display-step text ${step.tone || "active"}`}>
              <PlanningMessageContent content={step.text} isUser={false} />
            </div>
          );
        }
        const content = (
          <>
            <span className="codex-display-action-icon">{step.icon || planningCodexDisplayStepIcon(step)}</span>
            <Text>{step.text}</Text>
          </>
        );
        const className = `codex-display-step action ${canOpen ? "is-clickable" : ""} ${live ? "is-live-row" : "is-settled-row"} ${step.status || ""} ${step.tone || "muted"}`;
        return canOpen && live ? (
          <button key={step.id || index} type="button" className={className} onClick={onOpenDetails} aria-label="查看本轮过程详情">
            {content}
          </button>
        ) : canOpen ? (
          <div key={step.id || index} role="button" tabIndex={0} className={className} onClick={onOpenDetails} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenDetails();
            }
          }}>
            {content}
          </div>
        ) : (
          <div key={step.id || index} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function buildPlanningCodexSettledSummary(steps) {
  const visible = safeArray(steps).filter((step) => step?.text);
  if (!visible.length) return null;
  const readSteps = visible.filter((step) => step.kind === "read" || /读取|目录|索引|文件|资料/.test(step.text));
  const writeSteps = visible.filter((step) => step.kind === "write" || /写入|编辑|更新|保存/.test(step.text));
  const warningSteps = visible.filter((step) => step.tone === "warning" || /提醒|等待确认|暂停/.test(step.text));
  const dangerSteps = visible.filter((step) => step.tone === "danger" || /失败|阻断|未通过/.test(step.text));
  const checkStep = visible.slice().reverse().find((step) => {
    if (!(step.kind === "review" || /检查|自检|验收/.test(step.text))) return false;
    return step.tone === "danger"
      || step.tone === "warning"
      || /未通过|失败|阻断|提醒|警告|暂停/.test(String(step.text || ""));
  });
  const readSummary = (() => {
    if (!readSteps.length) return "";
    const withFiles = readSteps.slice().reverse().find((step) => /(\d+)\s*个文件/.test(step.text));
    if (withFiles) {
      const match = withFiles.text.match(/(\d+)\s*个文件/);
      return match ? `读取 ${match[1]} 个文件` : shortText(withFiles.text.replace(/^已/, ""), 80);
    }
    const directory = readSteps.find((step) => /资料目录|文件索引/.test(step.text));
    return directory ? shortText(directory.text.replace(/^已/, ""), 80) : `读取资料 ${readSteps.length} 步`;
  })();
  const writeSummary = (() => {
    if (!writeSteps.length) return "";
    const archive = writeSteps.slice().reverse().find((step) => /档案|世界书|记忆|文件|资料/.test(step.text));
    return archive ? shortText(archive.text.replace(/^已/, ""), 90) : `更新资料 ${writeSteps.length} 步`;
  })();
  const important = [
    readSummary,
    writeSummary,
    dangerSteps.length ? `有 ${dangerSteps.length} 个问题` : "",
    warningSteps.length && !dangerSteps.length ? `有 ${warningSteps.length} 条提醒` : "",
    checkStep ? planningCodexSettledCheckSummaryText(checkStep) : ""
  ].filter(Boolean);
  const firstAction = visible.find((step) => !/检查|自检|验收/.test(step.text));
  const fallback = firstAction?.text || visible[0]?.text || "";
  return {
    tone: dangerSteps.length ? "danger" : warningSteps.length ? "warning" : "done",
    text: important.length
      ? `${important.join(" · ")}`
      : shortText(fallback, 180)
  };
}

function planningCodexSettledCheckSummaryText(step) {
  const text = String(step?.text || "").trim();
  if (!text) return "";
  if (/检查未通过|未通过|失败|阻断/.test(text)) return shortText(text.replace(/^已?/, ""), 90);
  if (/有提醒|提醒|警告|warning/i.test(text)) return "检查有提醒";
  return "";
}

function planningLiveModelTextForDisplay(stream) {
  const text = String(stream?.modelText || "").trim();
  if (!text) return "";
  if (planningTextLooksInternalToUser(text)) return "";
  if (/^\s*[{[]/.test(text) && /tool_calls?|function_call|arguments|response\.output|skillOps|archivePatch|toolUseDecision/i.test(text)) return "";
  return text;
}

function buildPlanningLiveStreamSteps(stream, seen = new Set()) {
  const steps = [];
  const segments = [
    ...safeArray(stream?.modelSegments),
    String(stream?.currentModelText || "")
  ].map((item) => planningLiveModelTextForDisplay({ modelText: item })).filter(Boolean);
  segments.forEach((text, index) => {
    pushPlanningCodexDisplayStep(steps, seen, {
      id: `stream-${stream?.modelStep || 0}-${index}`,
      type: "text",
      tone: "active",
      status: "streaming",
      kind: "message",
      text
    }, index);
  });
  return steps;
}

function planningCodexActionRowText(row) {
  return String(row?.text || "")
    .replace(/^已处理[:：]\s*/, "")
    .replace(/^完成[:：]\s*/, "已完成 ")
    .replace(/^运行中[:：]\s*/, "正在")
    .trim();
}

function planningCodexStepIsGenericBridge(step) {
  const text = String(step?.text || "").trim();
  const kind = String(step?.kind || "");
  const type = String(step?.type || "");
  if (!text) return true;
  if (type === "text" || kind === "message") {
    return /^正在处理这一段$/.test(text)
      || /^完成这一段处理$/.test(text)
      || /^已处理这一段$/.test(text)
      || /^(已)?形成了?本轮回复$/.test(text)
      || /^已形成回复，等待你继续$/.test(text)
      || /^决定.+继续处理[。.]?$/.test(text)
      || /^当前请求方式不兼容工具调用，正在换一种方式继续$/.test(text);
  }
  return /^(正在准备本轮处理|正在根据上一段结果继续处理|完成这一段思考)$/.test(text);
}

function planningCodexStepDisplayFamily(step) {
  const text = String(step?.text || "").trim();
  const kind = String(step?.kind || "");
  const status = String(step?.status || "");
  if (!text) return "";
  if (kind === "approval" || /等待确认|确认权限|权限/.test(text)) return `approval:${["awaiting_approval", "running"].includes(status) ? status : "done"}`;
  if (kind === "write" || /写入|编辑|更新|保存|修改/.test(text)) return `write:${["failed", "blocked", "paused"].includes(status) ? status : "done"}`;
  if (kind === "shell" || /运行命令/.test(text)) return `shell:${["failed", "blocked", "paused"].includes(status) ? status : "done"}`;
  if (kind === "web" || /联网|网页/.test(text)) return `web:${["failed", "blocked", "paused"].includes(status) ? status : "done"}`;
  if (kind === "review" || /检查|审查|验收|诊断/.test(text)) return `review:${["failed", "blocked", "warning"].includes(status) || /失败|未通过|警告|提醒/.test(text) ? "issue" : "done"}`;
  if (kind === "read" || /读取|整理资料目录|资料目录|定位文件|查找资料|检索|索引|文件内容/.test(text)) {
    const phase = ["running", "queued", "awaiting_approval"].includes(status) || /^正在|等待/.test(text)
      ? (status || "running")
      : ["failed", "blocked", "paused"].includes(status) || /失败|阻断|暂停/.test(text)
        ? status
        : "done";
    return `read:${phase === "awaiting_approval" ? "awaiting_approval" : ["failed", "blocked", "paused"].includes(phase) ? phase : phase === "running" || phase === "queued" ? "running" : "done"}`;
  }
  return "";
}

function planningCodexStepInformationRank(step) {
  const text = String(step?.text || "");
  let rank = 0;
  if (/失败|阻断|未通过|错误/.test(text) || String(step?.tone || "") === "danger") rank += 100;
  if (/等待确认|权限/.test(text) || String(step?.status || "") === "awaiting_approval") rank += 80;
  if (/写入|编辑|更新|保存|修改/.test(text)) rank += 45;
  if (/读取文件内容|读取相关资料/.test(text)) rank += 35;
  if (/(\d+)\s*个文件/.test(text)) rank += 25;
  if (/定位文件|查找资料/.test(text)) rank += 18;
  if (/读取资料目录/.test(text)) rank += 12;
  if (/整理资料目录|索引/.test(text)) rank += 4;
  rank += Math.min(text.length, 160) / 160;
  return rank;
}

function finalizePlanningCodexDisplaySteps(steps, { live = false, limit = 8 } = {}) {
  const normalized = safeArray(steps)
    .map(normalizePlanningCodexDisplayStep)
    .filter(Boolean);
  if (!normalized.length) return [];
  const hasAction = normalized.some((step) => step.type === "action" || ["tool", "read", "write", "shell", "web", "review", "approval"].includes(String(step.kind || "")));
  const cleaned = normalized.filter((step) => {
    if (hasAction && planningCodexStepIsGenericBridge(step)) return false;
    if (!live && ["running", "queued", "streaming"].includes(String(step.status || "")) && /^正在/.test(String(step.text || ""))) return false;
    return true;
  });
  const byText = new Map();
  for (const step of cleaned) {
    const key = `${step.type}:${step.kind}:${planningCodexDisplayStepTextKey(step.text)}`;
    const existing = byText.get(key);
    if (!existing) {
      byText.set(key, step);
      continue;
    }
    const existingRank = planningToolStatusRank(existing.status);
    const nextRank = planningToolStatusRank(step.status);
    byText.set(key, nextRank >= existingRank ? { ...existing, ...step, createdAt: existing.createdAt || step.createdAt } : existing);
  }
  const byFamily = new Map();
  for (const step of byText.values()) {
    const family = planningCodexStepDisplayFamily(step);
    if (!family) {
      byFamily.set(`${step.id}:${planningCodexDisplayStepTextKey(step.text)}`, step);
      continue;
    }
    const existing = byFamily.get(family);
    if (!existing) {
      byFamily.set(family, step);
      continue;
    }
    const existingStatusRank = planningToolStatusRank(existing.status);
    const nextStatusRank = planningToolStatusRank(step.status);
    const preferNext = nextStatusRank > existingStatusRank
      || (nextStatusRank === existingStatusRank && planningCodexStepInformationRank(step) >= planningCodexStepInformationRank(existing));
    byFamily.set(family, preferNext ? { ...existing, ...step, createdAt: existing.createdAt || step.createdAt } : existing);
  }
  return Array.from(byFamily.values()).slice(-limit);
}

function PlanningCodexInlineActionRows({ rows, limit = 4, onOpenDetails }) {
  const visibleRows = safeArray(rows)
    .filter((row) => row && !["model", "idle"].includes(String(row.key || "")))
    .filter((row) => {
      const text = planningCodexActionRowText(row);
      if (/思考下一步|检查通过|自然语言回复已完成|已检查\s*\d+\s*项|验收步骤已记录/.test(text)) return false;
      if (planningDisplayTextLooksLikeLightReplyRetrievalNoise(text)) return false;
      return true;
    })
    .slice(-limit);
  if (!visibleRows.length) return null;
  const canOpen = typeof onOpenDetails === "function";
  return (
    <div className="codex-inline-action-stream">
      {visibleRows.map((row, index) => {
        const content = (
          <>
            <span className="codex-inline-action-row-icon">{row.icon || <IconCode />}</span>
            <Text>{planningCodexActionRowText(row)}</Text>
          </>
        );
        const key = row.key || index;
        const className = `codex-inline-action-row ${canOpen ? "is-clickable" : ""} ${row.tone || "muted"}`;
        return canOpen ? (
          <button key={key} type="button" className={className} onClick={onOpenDetails} aria-label="查看本轮过程详情">
            {content}
          </button>
        ) : (
          <div key={key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function PlanningCodexLiveBody({ run, stream, rows, steps = [], statusText, pendingApprovals, failedCount, showAction = true, onOpenDetails }) {
  if (isPlanningRunDisplayTerminal(run)) return null;
  const hasVisibleProcess = safeArray(steps).length > 0 || buildPlanningCodexDisplaySteps({
    run,
    stream,
    rows,
    statusText,
    pendingApprovals,
    failedCount,
    live: true,
    limit: 4
  }).length > 0;
  if (hasVisibleProcess) return null;
  const displayParts = safeArray(run?.parts);
  const liveAction = visiblePlanningRunParts(displayParts, { compact: true, live: true })
    .slice()
    .reverse()
    .find((part) => ["running", "streaming", "awaiting_approval"].includes(String(part.status || "")) && ["tool", "approval"].includes(String(part.type || "")));
  const thinkingText = isPlanningRunPersisting(run)
    ? "正在同步结果"
    : statusText === "等待确认"
    ? "等待你确认权限"
    : failedCount > 0
      ? "正在尝试修正"
      : "正在思考";
  const liveActionText = liveAction
    ? planningRunPartText(liveAction).replace(/^正在/, "正在 ").replace(/^等待确认：/, "等待确认：")
    : "";
  const canOpen = typeof onOpenDetails === "function";
  return (
    <div className="codex-live-body codex-live-minimal">
      {showAction && liveActionText && (
        canOpen ? (
          <button type="button" className={`codex-live-action-line ${liveAction.status || ""}`} onClick={onOpenDetails}>
            <span className="codex-live-action-icon">{planningRunPartIcon(liveAction)}</span>
            <span>{shortText(liveActionText, 150)}</span>
          </button>
        ) : (
          <div className={`codex-live-action-line ${liveAction.status || ""}`}>
            <span className="codex-live-action-icon">{planningRunPartIcon(liveAction)}</span>
            <span>{shortText(liveActionText, 150)}</span>
          </div>
        )
      )}
      {!liveActionText && (
        <div className={`codex-step-thinking ${statusText === "等待确认" ? "warning" : ""}`}>
          <span className="codex-step-thinking-dot" aria-hidden="true" />
          <span>{thinkingText}</span>
        </div>
      )}
    </div>
  );
}

function buildPlanningReportActivityRows({ report, trace, toolTimeline, stats }) {
  const rows = [];
  const tools = safeArray(toolTimeline);
  const readCount = tools
    .filter((entry) => planningToolActionKind(entry.toolType) === "read")
    .reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0);
  const writeCount = tools
    .filter((entry) => planningToolActionKind(entry.toolType) === "write")
    .reduce((sum, entry) => sum + Number(entry.occurrenceCount || 1), 0);
  const failed = tools.filter((entry) => ["failed", "blocked", "skipped"].includes(String(entry.status || "")));
  if (readCount > 0 || stats?.searches > 0 || stats?.evidenceReads > 0) {
    rows.push({
      key: "read",
      icon: <IconSearch />,
      text: `读取资料：${readCount || (stats.searches || 0) + (stats.evidenceReads || 0)} 次`,
      tone: "muted"
    });
  }
  if (writeCount > 0 || stats?.writes > 0) {
    rows.push({
      key: "write",
      icon: <IconEdit />,
      text: `编辑资料：${writeCount || stats.writes} 项`,
      tone: "done"
    });
  }
  if (stats?.checks > 0) {
    rows.push({
      key: "check",
      icon: <IconSafe />,
      text: `检查资料：${stats.checks} 项`,
      tone: "done"
    });
  }
  if (failed.length > 0 || stats?.skipped > 0) {
    const first = failed[0];
    rows.push({
      key: "issue",
      icon: <IconBug />,
      text: first ? `${planningToolActionLabel(first)}：${planningToolActionReason(first) || "需要处理"}` : `有 ${stats.skipped} 个工具问题`,
      tone: "warning"
    });
  }
  if (rows.length === 0 && safeArray(trace).length > 0) {
    rows.push({
      key: "trace",
      icon: <IconMindMapping />,
      text: `整理了 ${safeArray(trace).length} 段运行摘要`,
      tone: "muted"
    });
  }
  if (rows.length === 0 && report) {
    rows.push({
      key: "done",
      icon: <IconThunderbolt />,
      text: "本轮没有额外动作",
      tone: "muted"
    });
  }
  return rows;
}

// 过程注记来自后端真实运行事件，但只作为 UI 活动流显示，不写进正式对话正文。
function planningProgressNoteDisplayMessage(message) {
  return String(message || "")
    .replace(/第\s*(\d+)\s*轮/g, "第 $1 段")
    .replace(/开始第\s*(\d+)\s*轮判断：让策划模型决定回复、继续读取资料、编辑资料或收束。/g, "处理第 $1 段：根据上一段结果继续行动。")
    .replace(/模型没有要求工具写入；我会检查回复是否已经足够收束。/g, "检查这段回复是否还需要读取、写入或审查。")
    .replace(/运行器要求 Agent 继续处理未落盘产物或未闭合工具目标/g, "继续处理未闭合的可复用内容")
    .trim();
}

function shouldShowPlanningProgressNote(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (planningTextLooksInternalToUser(text)) return false;
  if (/Agent|运行器|策划模型|模型|verifier|persisting|空转|收束|闭环|工具机会|未落盘|可复用内容/.test(text)) return false;
  if (/^我(正在|先|会|已经|已)|^发现|^资料准备|^检查完成|^准备资料/.test(text)) return false;
  if (/^调用策划模型[:：]/.test(text)) return false;
  if (/^已加入策划 Agent 队列/.test(text)) return false;
  if (/运行器|空动作|JSON|修复运行片段|第\s*\d+\s*段结束|第\s*\d+\s*轮结束/.test(text)) return false;
  if (/^处理第\s*\d+\s*段[:：]/.test(text)) return false;
  if (/检查这段回复是否还需要/.test(text)) return false;
  if (/开始检查本轮结果/.test(text)) return false;
  if (/模型决定(继续使用工具|调用工具继续处理)/.test(text)) return false;
  if (/准备执行[:：].{80,}/.test(text)) return false;
  if (/本轮已经收束|本轮已暂停|本轮被阻断/.test(text)) return false;
  return true;
}

function planningRunProgressNotes(run) {
  return safeArray(run?.events)
    .filter((event) => event?.type === "progress_note" && String(event.message || "").trim())
    .map((event) => {
      const message = planningProgressNoteDisplayMessage(event.message);
      return {
        id: event.id,
        message,
        phase: String(event.phase || event.data?.phase || "progress"),
        createdAt: event.createdAt,
        status: String(event.data?.status || event.data?.completionStatus || ""),
        retryable: event.data?.retryable
      };
    })
    .filter((note) => shouldShowPlanningProgressNote(note.message));
}

function planningProgressNoteTone(note) {
  const text = `${note?.status || ""} ${note?.message || ""}`;
  if (/失败|阻断|超限|错误/.test(text)) return "danger";
  if (/等待|确认|提醒|暂停/.test(text)) return "warning";
  if (/完成|通过|收束|结束/.test(text)) return "done";
  return "active";
}

function planningProgressNoteIcon(note) {
  const phase = String(note?.phase || "");
  const tone = planningProgressNoteTone(note);
  if (tone === "danger") return <IconBug />;
  if (tone === "warning") return <IconQuestionCircle />;
  if (phase.includes("tool") || phase.includes("evidence")) return <IconSearch />;
  if (phase.includes("verifier") || phase.includes("review")) return <IconSafe />;
  if (phase.includes("model")) return <IconRobot />;
  return <IconThunderbolt />;
}

function PlanningRunProgressNotes({ notes, live = false, limit = 6 }) {
  const source = safeArray(notes);
  if (!source.length) return null;
  const visible = source.length > limit ? source.slice(-limit) : source;
  const hidden = Math.max(0, source.length - visible.length);
  return (
    <div className={`codex-progress-notes ${live ? "is-live" : "is-settled"}`}>
      {hidden > 0 && (
        <Text className="codex-progress-hidden">前面还有 {hidden} 条过程注记，已放进过程详情。</Text>
      )}
      {visible.map((note) => (
        <div key={note.id || `${note.createdAt}-${note.message}`} className={`codex-progress-note ${planningProgressNoteTone(note)}`}>
          <span className="codex-progress-note-icon">{planningProgressNoteIcon(note)}</span>
          <Text>{note.message}</Text>
        </div>
      ))}
    </div>
  );
}

function PlanningRunMessageBlock({ run, liveRun, liveStream, busy, onCancel, onDecideApproval, onRevertCheckpoint, onOpenHistory, onOpenTranscript }) {
  const events = safeArray(run.events);
  const items = safeArray(run.items);
  const checkpoints = safeArray(run.checkpoints).slice(-5).reverse();
  const pendingApprovals = safeArray(run.approvals).filter((approval) => approval.status === "pending");
  const taskPlan = safeArray(run.taskPlan);
  const taskGraphNodes = safeArray(run.taskGraph?.nodes);
  const doneCriteria = safeArray(run.doneCriteria);
  const verifierSteps = safeArray(run.verifierChain?.steps);
  const isLive = liveRun?.id === run.id && !isPlanningRunDisplayTerminal(run);
  const isTerminal = isPlanningRunDisplayTerminal(run);
  const isSettled = isTerminal && !isLive;
  const isPlainAwaitingReply = isPlanningRunPlainAwaitingReply(run);
  const isSoftToolPause = isPlanningRunSoftToolPause(run);
  const eventStats = planningRunEventStats(run);
  const evidenceReads = safeArray(run.evidencePlan?.reads);
  const completedPlanCount = taskPlan.filter((item) => item.status === "completed").length;
  const activePlanItem = taskPlan.find((item) => item.status === "in_progress") || taskPlan.find((item) => item.status !== "completed") || taskPlan[0];
  const checkSummary = buildPlanningRunCheckSummary(run);
  const diagnostics = safeArray(checkSummary.diagnostics).slice(-6);
  const rawToolTimeline = buildPlanningToolTimeline({ items, events, evidencePlan: run.evidencePlan });
  const toolTimeline = compactPlanningToolTimeline(rawToolTimeline);
  const processSummary = buildPlanningRunProcessSummary({
    toolTimeline,
    stats: eventStats,
    latest: eventStats.latest,
    live: isLive || run.status === "awaiting_approval"
  });
  const failureInfo = buildPlanningRunFailureInfo(run, checkSummary, processSummary);
  const settledSummary = buildPlanningRunSettledSummary(run, { processSummary, checkSummary, taskPlan, completedPlanCount });
  const settledTone = planningRunSettledTone(run, checkSummary);
  const elapsedText = formatElapsedTime(run.createdAt, isTerminal ? (run.finishedAt || run.updatedAt) : Date.now());
  const fallbackReply = String(run.reply || run.assistantMessagePreview || "").trim();
  const shouldShowFallbackReply = Boolean(fallbackReply) && !run.messageId;
  const activityRows = buildPlanningRunActivityRows({
    run,
    toolTimeline,
    activityTimeline: run.activityTimeline,
    eventStats,
    evidenceReads,
    taskGraphNodes,
    verifierSteps,
    pendingApprovals,
    liveStream,
    checkSummary,
    processSummary
  });
  // 运行块、回复下方 trail 和过程详情必须共用同一个公开过程协议。
  // 优先使用后端整理好的 turnItems/processSteps，只在旧运行缺少 canonical 数据时才回退到 activityRows。
  const displaySteps = planningCanonicalProcessStepsFromRun(run, {
    live: isLive || run.status === "awaiting_approval",
    limit: isLive ? 10 : 5,
    rows: activityRows
  });
  const displayParts = safeArray(run.parts);
  const visibleDisplayPartCount = visiblePlanningRunParts(displayParts, { live: isLive }).length;
  const displayStepStream = displaySteps.length > 0 ? (
    <PlanningCodexDisplayStream steps={displaySteps} live={isLive} onOpenDetails={() => onOpenTranscript?.(run.id)} />
  ) : null;
  const partProcessStream = !isSettled && visibleDisplayPartCount > 0 ? (
    <PlanningRunPartStream parts={displayParts} live={isLive} onOpenDetails={() => onOpenTranscript?.(run.id)} />
  ) : null;
  const progressNotes = planningRunProgressNotes(run);
  const selfReviewSummary = planningRunUserFacingCheckSummary(run.selfReview?.summary);
  const completionVerifierSummary = planningRunUserFacingCheckSummary(run.completionVerifier?.summary);
  const settledNeedsVisiblePreview = isSettled
    && displaySteps.length > 0
    && (
      ["failed", "blocked", "paused", "cancelled", "awaiting_approval"].includes(String(run.status || ""))
      || checkSummary.status === "failed"
      || checkSummary.status === "warning"
      || pendingApprovals.length > 0
    );
  const settledInlineProcess = null;
  const settledPreviewProcess = !isPlainAwaitingReply && settledNeedsVisiblePreview ? (
    <PlanningCodexDisplayStream steps={displaySteps.slice(-4)} live={false} compact onOpenDetails={() => onOpenTranscript?.(run.id)} />
  ) : null;
  const primaryProcessStream = isSettled
    ? null
    : (displayStepStream || partProcessStream);
  const visibleActivityCount = safeArray(run.activityTimeline).length || toolTimeline.length;
  const settledMeta = isSoftToolPause ? "" : [
    visibleActivityCount > 0 ? `${visibleActivityCount} 个动作` : "",
    taskGraphNodes.length > 0 ? `${taskGraphNodes.filter((node) => node.status === "completed").length}/${taskGraphNodes.length} 步` : "",
    checkSummary.hasDetails && checkSummary.status !== "passed" ? `检查 ${planningReviewStatusLabel(checkSummary.status)}` : ""
  ].filter(Boolean).slice(0, 2).join(" · ");
  const settledProcessSummary = buildPlanningCodexSettledSummary(displaySteps);
  const terminalNeedsExpandedAttention = ["failed", "blocked", "cancelled", "paused", "awaiting_approval"].includes(String(run.status || ""))
    || checkSummary.status === "failed"
    || checkSummary.status === "warning"
    || pendingApprovals.length > 0;
  const renderRunDetails = () => (
    <>
      {!isLive && progressNotes.length > 0 && (
        <div className="codex-run-section">
          <PlanningRunProgressNotes notes={progressNotes} live={false} limit={12} />
        </div>
      )}

      {taskPlan.length > 0 && (
          <div className="codex-run-section codex-task-strip">
            <div className="codex-task-summary">
              <Tag color={activePlanItem?.status === "blocked" ? "red" : activePlanItem?.status === "completed" ? "green" : "arcoblue"}>
                计划 {completedPlanCount}/{taskPlan.length}
              </Tag>
              <Text>{activePlanItem?.title || activePlanItem?.name || "等待下一步"}</Text>
            </div>
            <Collapse key={isLive ? "task-plan-live" : "task-plan-settled"} className="agent-inline-collapse codex-task-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={isLive ? ["taskPlan"] : []}>
              <Collapse.Item name="taskPlan" header={<PlanningDisclosureHeader label="计划详情" meta={`${taskPlan.length} 项`} />}>
                <div className="codex-plan-list">
                  {taskPlan.map((item, index) => (
                    <div key={item.id || item.title || index} className={`codex-plan-item ${item.status || "pending"}`}>
                      <Tag color={item.status === "completed" ? "green" : item.status === "blocked" ? "red" : item.status === "in_progress" ? "orange" : "gray"}>
                        {planningTaskStatusLabel(item.status)}
                      </Tag>
                      <Text>{item.title || item.name || `步骤 ${index + 1}`}</Text>
                    </div>
                  ))}
                </div>
              </Collapse.Item>
            </Collapse>
          </div>
      )}

      {taskGraphNodes.length > 0 && (
          <Collapse key={isLive ? "task-graph-live" : "task-graph-settled"} className="codex-run-collapse task-graph-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={isLive ? ["taskGraph"] : []}>
            <Collapse.Item name="taskGraph" header={<PlanningDisclosureHeader label="执行步骤" meta={`${taskGraphNodes.filter((node) => node.status === "completed").length}/${taskGraphNodes.length}`} />}>
              <div className="codex-plan-list">
                {taskGraphNodes.map((node, index) => (
                  <div key={node.id || `${node.title}-${index}`} className={`codex-plan-item ${node.status || "pending"}`}>
                    <Tag color={node.status === "completed" ? "green" : node.status === "blocked" ? "red" : node.status === "in_progress" ? "orange" : "gray"}>
                      {planningTaskStatusLabel(node.status)}
                    </Tag>
                    <div>
                      <Text>{node.title || `节点 ${index + 1}`}</Text>
                      {(safeArray(node.toolTypes).length > 0 || safeArray(node.evidenceIds).length > 0) && (
                        <Paragraph className="trace-reply">
                          {safeArray(node.toolTypes).length > 0 ? `工具：${safeArray(node.toolTypes).join("、")}` : ""}
                          {safeArray(node.evidenceIds).length > 0 ? ` 证据：${safeArray(node.evidenceIds).join("、")}` : ""}
                        </Paragraph>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Collapse.Item>
          </Collapse>
      )}

      {(liveStream?.modelText || safeArray(liveStream?.outputs).length > 0) && (
        <PlanningLiveStreamPanel stream={liveStream} live={isLive} />
      )}

      {pendingApprovals.map((approval) => (
          <Alert
            key={approval.id}
            className="codex-run-alert"
            type="warning"
            title="等待你的权限确认"
            content={(
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text>{approval.reason || "高风险操作要求确认"}。底部权限条已显示；这里保留一个备用入口，避免你滚动后找不到。</Text>
                <Text type="secondary">{safeArray(approval.operations).length} 个操作 · 过期 {formatDate(approval.expiresAt)}</Text>
                <Space>
                  <Button size="small" type="primary" loading={busy === "planning-approval-approved"} onClick={() => onDecideApproval(run.id, approval.id, "approved")}>批准并继续</Button>
                  <Button size="small" status="danger" loading={busy === "planning-approval-rejected"} onClick={() => onDecideApproval(run.id, approval.id, "rejected")}>拒绝</Button>
                </Space>
              </Space>
            )}
          />
      ))}

      {checkSummary.hasDetails && (
          <div className="codex-review-block">
            <div className="codex-review-strip">
              <Tag color={checkSummary.status === "passed" ? "green" : checkSummary.status === "failed" ? "red" : "orange"}>
                {checkSummary.status === "passed" ? "检查通过" : checkSummary.status === "failed" ? "需要处理" : "有提醒"}
              </Tag>
              <Text>{shortText(checkSummary.summary, 150)}</Text>
              <Space size={4} wrap>
                {diagnostics.length > 0 && <Tag color="orange">诊断 {diagnostics.length}</Tag>}
                {verifierSteps.length > 0 && <Tag color="arcoblue">验收 {verifierSteps.length}</Tag>}
                {checkpoints.length > 0 && <Tag color="purple">版本点 {checkpoints.length}</Tag>}
              </Space>
            </div>
            <Collapse className="codex-run-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="details" header={<PlanningDisclosureHeader label="查看检查详情" meta="不会占用主流程" />}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {doneCriteria.length > 0 && (
                  <div className="codex-tag-line">
                    {doneCriteria.map((item) => <Tag key={item} color="arcoblue">{item}</Tag>)}
                  </div>
                )}
                {diagnostics.length > 0 && (
                  <div className="codex-review-list">
                    {diagnostics.map((diagnostic, index) => (
                      <div key={`${diagnostic.code || diagnostic.type}-${index}`} className="codex-review-row">
                        <Tag color={diagnostic.retryable ? "orange" : "gray"}>{diagnostic.retryable ? "可继续" : "提示"}</Tag>
                        <Text>{planningUserVisibleText(diagnostic.message, 180) || "有一条运行提示，详情可在调试记录里查看。"}</Text>
                      </div>
                    ))}
                  </div>
                )}
                {checkpoints.length > 0 && (
                  <div className="version-checkpoint-list">
                    {checkpoints.map((checkpoint) => (
                      <div key={checkpoint.id} className="version-checkpoint-row">
                        <div>
                          <Text>{checkpoint.label || `运行片段 ${checkpoint.step}`}</Text>
                          <br />
                          <Text type="secondary">{formatDate(checkpoint.createdAt)}</Text>
                        </div>
                        {checkpoint.canRollbackToCheckpoint && isPlanningRunTerminal(run) && (
                          <Button size="mini" icon={<IconUndo />} loading={busy === "planning-checkpoint-revert"} onClick={() => onRevertCheckpoint(run.id, checkpoint.id)}>
                            回退
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {run.selfReview && selfReviewSummary && (
                  <Alert
                    type={run.selfReview.status === "passed" ? "success" : run.selfReview.status === "failed" ? "error" : "warning"}
                    title={`自检：${planningReviewStatusLabel(run.selfReview.status)}`}
                    content={selfReviewSummary}
                  />
                )}
                {verifierSteps.length > 0 && (
                  <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
                    <Collapse.Item name="verifierChain" header={<PlanningDisclosureHeader label="验收链" meta={planningReviewStatusLabel(run.verifierChain?.status)} />}>
                      <div className="codex-review-list">
                        {verifierSteps.map((step) => (
                          <div key={step.id} className="codex-review-row">
                            <Tag color={step.status === "passed" ? "green" : step.status === "failed" ? "red" : step.status === "skipped" ? "gray" : "orange"}>{planningReviewStatusLabel(step.status)}</Tag>
                            <Text>{step.label || step.type}</Text>
                            <Text type="secondary">{step.exitCode !== null && step.exitCode !== undefined ? `exit ${step.exitCode}` : shortText(step.summary || step.stderr || step.stdout, 120)}</Text>
                          </div>
                        ))}
                      </div>
                    </Collapse.Item>
                  </Collapse>
                )}
                {run.completionVerifier && completionVerifierSummary && (
                  <Alert
                    type={run.completionVerifier.status === "passed" ? "success" : run.completionVerifier.status === "failed" ? "error" : "warning"}
                    title={`完成判定：${planningReviewStatusLabel(run.completionVerifier.status)}`}
                    content={completionVerifierSummary}
                  />
                )}
                </Space>
              </Collapse.Item>
            </Collapse>
          </div>
      )}
    </>
  );

  if (isSettled) {
    return (
      <div className={`codex-message-row assistant codex-run-message-row is-settled ${settledTone}`}>
        <div className="codex-run-spacer" aria-hidden="true" />
        <div className={`codex-run-stream is-settled ${settledTone}`}>
          <button type="button" className="codex-run-stream-head is-settled" onClick={() => onOpenTranscript?.(run.id)} aria-label="查看本轮过程详情">
            <span className={`codex-run-state-line ${settledTone}`}>
              <span className="codex-run-state-dot" aria-hidden="true" />
            <span>{elapsedText ? `已处理 ${elapsedText}` : planningRunStatusLabel(run.status)}</span>
            </span>
            {!isPlainAwaitingReply && <Text>{shortText(settledProcessSummary?.text || settledSummary, 220)}</Text>}
            {!isPlainAwaitingReply && settledMeta && <Text className="codex-run-settled-meta" type="secondary">{settledMeta}</Text>}
            <span className="codex-run-inline-open">过程</span>
          </button>
          {terminalNeedsExpandedAttention && settledPreviewProcess}
          {!terminalNeedsExpandedAttention && !isPlainAwaitingReply && settledInlineProcess}
          {shouldShowFallbackReply && (
            <div className="codex-run-fallback-reply">
              <PlanningMessageContent content={fallbackReply} isUser={false} />
            </div>
          )}
          {["failed", "blocked", "cancelled", "paused"].includes(String(run.status || "")) && !isSoftToolPause && <PlanningRunFailureInline info={failureInfo} />}
        </div>
      </div>
    );
  }

  return (
    <div className="codex-message-row assistant codex-run-message-row is-live">
      <div className="codex-run-spacer" aria-hidden="true" />
      <div className="codex-run-stream is-live">
        <div className="codex-run-stream-head is-live">
          <div className="codex-run-elapsed">
            <Text>{elapsedText ? `已处理 ${elapsedText}` : run.status === "awaiting_approval" ? "等待确认" : "正在准备"}</Text>
            <IconArrowDown />
          </div>
          <Space className="codex-run-head-actions">
            <Button className="codex-run-subtle-action" type="text" size="mini" onClick={() => onOpenTranscript?.(run.id)}>过程</Button>
            {isLive && (
              <Button className="codex-run-icon-action codex-stop-action" type="text" size="mini" status="danger" icon={<IconRecordStop />} loading={busy === "planning-cancel"} onClick={onCancel} aria-label="停止当前运行" />
            )}
          </Space>
        </div>
        <div className="codex-run-stream-divider" aria-hidden="true" />
        {["failed", "blocked", "cancelled", "paused"].includes(String(run.status || "")) && !isSoftToolPause && <PlanningRunFailureInline info={failureInfo} />}
        {primaryProcessStream}
        <PlanningCodexLiveBody
          run={run}
          stream={liveStream}
          rows={activityRows}
          steps={displaySteps}
          statusText={planningRunStatusLabel(run.status)}
          pendingApprovals={pendingApprovals.length}
          failedCount={processSummary.failedCount}
          showAction={!primaryProcessStream}
          onOpenDetails={() => onOpenTranscript?.(run.id)}
        />
        {run.budget?.exceeded && (
          <div className="codex-run-budget-line">
            <Text type="secondary" title={`上下文窗口 ${run.budget.contextWindowTokens || 0} · prompt 预算 ${run.budget.promptBudgetTokens || 0} · 输出保留 ${run.budget.responseReserveTokens || 0} · 来源 ${run.budget.tokenBudgetSource || "unknown"}`}>
              上下文已压缩 · {run.budget.estimatedPromptTokens || 0}/{run.budget.promptBudgetTokens || 0} tokens
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanningRunProcess({ events, items, stats, evidencePlan, activityTimeline, live = false }) {
  const latest = stats?.latest;
  const rawToolTimeline = buildPlanningToolTimeline({ items, events, evidencePlan });
  const toolTimeline = compactPlanningToolTimeline(rawToolTimeline);
  const activityRows = buildPlanningActivityRowsFromTimeline(activityTimeline, live ? 8 : 6);
  const hasServerActivity = activityRows.length > 0;
  const processSummary = buildPlanningRunProcessSummary({ toolTimeline, stats, latest, live });
  const fallbackRows = hasServerActivity ? [] : buildPlanningRunActivityRows({
    run: { status: live ? "running" : "completed", phase: live ? "running" : "completed" },
    toolTimeline,
    activityTimeline: [],
    eventStats: stats,
    evidenceReads: safeArray(evidencePlan?.reads),
    taskGraphNodes: [],
    verifierSteps: [],
    pendingApprovals: [],
    liveStream: null,
    checkSummary: null,
    processSummary
  });
  const rows = hasServerActivity ? activityRows : fallbackRows;
  const hasRawTools = toolTimeline.length > 0;
  return (
    <div className="codex-run-section agent-process-compact codex-process-ledger">
      <div className={`codex-process-summary ${live ? "is-live" : "is-settled"}`}>
        <Text>{live ? "正在处理" : "处理摘要"}</Text>
        <Text>{processSummary.summary}</Text>
      </div>
      {rows.length > 0 ? (
        <PlanningRunActivityLedger rows={rows} />
      ) : (
        <div className="agent-process-line">
          <Text type="secondary">{processSummary.summary || "没有额外过程记录"}</Text>
        </div>
      )}
      {hasRawTools && (
        <Collapse key={live ? "process-raw-live" : "process-raw-settled"} className="agent-inline-collapse codex-process-collapse codex-disclosure-collapse codex-debug-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="raw-tools" header={<PlanningDisclosureHeader label="展开细节" meta={`${toolTimeline.length} 条动作`} />}>
            <PlanningToolTimeline entries={toolTimeline} limit={10} live={live} compact={false} />
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
}

function PlanningLiveStreamPanel({ stream, live = false }) {
  const modelText = String(stream?.modelText || "");
  const outputs = safeArray(stream?.outputs);
  const recentOutputs = outputs.slice(-8);
  return (
    <div className="codex-run-section agent-live-stream">
      <div className="agent-process-line">
        <Space wrap size={6}>
          {modelText && <Tag color="purple">回复流 {stream.modelChars || modelText.length} 字</Tag>}
          {recentOutputs.length > 0 && <Tag color="orange">stdout {outputs.length}</Tag>}
        </Space>
        <Text type="secondary">运行中的临时输出，正式结果会合并进本轮回复。</Text>
      </div>
      {modelText && (
        <Collapse key={live ? "model-stream-live" : "model-stream-settled"} className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={live ? ["model-stream"] : []}>
          <Collapse.Item name="model-stream" header={<PlanningDisclosureHeader label="实时回复片段" meta={`片段 ${stream.modelStep || 1}`} />}>
            <pre className="agent-stream-block">{modelText}</pre>
          </Collapse.Item>
        </Collapse>
      )}
      {recentOutputs.length > 0 && (
        <Collapse key={live ? "tool-output-live" : "tool-output-settled"} className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={live ? ["tool-output"] : []}>
          <Collapse.Item name="tool-output" header={<PlanningDisclosureHeader label="命令输出" meta={`${recentOutputs.length} 条`} />}>
            <div className="agent-output-list">
              {recentOutputs.map((item, index) => (
                <div key={`${item.createdAt}-${index}`} className={`agent-output-row ${item.stream === "stderr" ? "stderr" : "stdout"}`}>
                  <Tag color={item.stream === "stderr" ? "red" : "arcoblue"}>{item.stream}</Tag>
                  <pre>{item.text}</pre>
                </div>
              ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
}

function doctorStatusType(status) {
  if (status === "passed") return "success";
  if (status === "blocked") return "error";
  return "warning";
}

function doctorStatusColor(status) {
  if (["passed", "completed", "applied"].includes(status)) return "green";
  if (["blocked", "failed", "error"].includes(status)) return "red";
  if (["warning", "paused", "cancelled", "awaiting_approval"].includes(status)) return "orange";
  return "orange";
}

function doctorIssueColor(severity) {
  if (severity === "high") return "red";
  if (severity === "medium") return "orange";
  return "gray";
}

function PlanningDoctorPanel({ report, loading }) {
  if (loading && !report) {
    return (
      <div className="drawer-loading">
        <Spin />
        <Text type="secondary">正在检查 Provider、模型、工具、工作区、RAG 和最近运行...</Text>
      </div>
    );
  }
  if (!report) return <Empty description="输入 /doctor 或点击诊断入口后生成报告。" />;
  const issues = safeArray(report.issues);
  const recentRuns = safeArray(report.runs?.recent);
  const recentAssets = safeArray(report.context?.recentAssets);
  const workspaceResults = safeArray(report.workspace?.searchSmoke?.topResults);
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        type={doctorStatusType(report.status)}
        title={`状态：${report.status || "unknown"}`}
        content={report.summary || "无摘要"}
      />
      <Descriptions column={1} size="small" border>
        <Descriptions.Item label="生成时间">{formatDate(report.createdAt)}</Descriptions.Item>
        <Descriptions.Item label="Provider">
          {report.provider?.missing
            ? `缺失：${report.provider.id || "未配置"}`
            : `${report.provider?.name || "未命名"} · ${report.provider?.baseUrl || "无 baseUrl"}`}
        </Descriptions.Item>
        <Descriptions.Item label="模型">{report.provider?.model || "未配置"}{report.provider?.modelListed === false ? " · 不在模型列表" : ""}</Descriptions.Item>
        <Descriptions.Item label="适配器">{report.provider?.adapterId || "auto"} · {report.provider?.endpointKind || "unknown"}</Descriptions.Item>
        <Descriptions.Item label="工具">{report.tools?.enabled || 0}/{report.tools?.total || 0} 启用 · 权限 {planningPermissionModeLabel(report.tools?.permissionMode)}</Descriptions.Item>
        <Descriptions.Item label="工作区">{report.workspace?.path || "未配置"}</Descriptions.Item>
        <Descriptions.Item label="上下文摘要">{report.context?.promptProjectChars || 0} chars · 原始 {report.context?.fullProjectChars || 0} chars · 缩减 {Math.round((report.context?.reductionRatio || 0) * 100)}%</Descriptions.Item>
      </Descriptions>

      <Collapse className="agent-inline-collapse" bordered={false} accordion defaultActiveKey={["issues"]}>
        <Collapse.Item name="issues" header={`问题 · ${issues.length}`}>
          {issues.length ? (
            <div className="agent-source-list">
              {issues.map((issue, index) => (
                <div key={`${issue.code || issue.message}-${index}`} className="agent-source-row">
                  <Tag color={doctorIssueColor(issue.severity)}>{issue.severity || "info"}</Tag>
                  <div>
                    <Text>{issue.code || "issue"}</Text>
                    <Paragraph className="trace-reply">{issue.message}</Paragraph>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="没有发现阻断或警告项。" />
          )}
        </Collapse.Item>
        <Collapse.Item name="workspace" header="工作区与检索冒烟">
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Space wrap>
              <Tag color={report.workspace?.exists ? "green" : "red"}>{report.workspace?.exists ? "工作区可读" : "工作区异常"}</Tag>
              <Tag color={report.workspace?.searchSmoke?.status === "passed" ? "green" : report.workspace?.searchSmoke?.status === "failed" ? "red" : "gray"}>
                检索 {report.workspace?.searchSmoke?.status || "未执行"}
              </Tag>
              <Text type="secondary">额外来源 {report.workspace?.extraSources || 0}</Text>
            </Space>
            {report.workspace?.warning && <Alert type="warning" content={report.workspace.warning} />}
            {workspaceResults.length ? (
              <div className="agent-source-list">
                {workspaceResults.map((item) => (
                  <div key={item.sourceId || item.title} className="agent-source-row">
                    <Tag color="arcoblue">文件</Tag>
                    <Text>{item.title || item.sourceId}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="没有资料目录结果。" />
            )}
          </Space>
        </Collapse.Item>
        <Collapse.Item name="rag" header="RAG / 记忆 / 世界书">
          <Descriptions column={1} size="small" border>
            <Descriptions.Item label="记忆条目">{report.rag?.memoryItems || 0}</Descriptions.Item>
            <Descriptions.Item label="世界书条目">{report.rag?.lorebookEntries || 0}</Descriptions.Item>
            <Descriptions.Item label="向量索引">{report.rag?.vectorEnabled ? "开启" : "关闭"} · chunk {report.rag?.vectorIndex?.chunkCount || 0} · stale {report.rag?.vectorIndex?.stale ? "是" : "否"}</Descriptions.Item>
            <Descriptions.Item label="Embedding">{report.rag?.embeddingProviderId || "未配置"} / {report.rag?.embeddingModel || "未配置"}</Descriptions.Item>
            <Descriptions.Item label="Rerank">{report.rag?.rerankEnabled ? "开启" : "关闭"}</Descriptions.Item>
          </Descriptions>
        </Collapse.Item>
        <Collapse.Item name="assets" header={`已保存原文 · ${report.context?.contextAssetCount || 0}`}>
          {recentAssets.length ? (
            <div className="agent-source-list">
              {recentAssets.map((asset) => (
                <div key={asset.id} className="agent-source-row">
                  <Tag color="orange">{planningReferenceKindLabel(asset)}</Tag>
                  <Text>{shortText(planningReferenceTitle(asset), 140)}</Text>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无已保存原文。" />
          )}
        </Collapse.Item>
        <Collapse.Item name="runs" header={`最近运行 · 未收束记录 ${report.runs?.openRunItems || 0}`}>
          {recentRuns.length ? (
            <div className="agent-source-list">
              {recentRuns.map((run) => (
                <div key={run.id} className="agent-source-row">
                  <Tag color={doctorStatusColor(run.status)}>{planningRunStatusLabel(run.status)}</Tag>
                  <div>
                    <Text>{shortText(run.preview || run.id, 120)}</Text>
                    <Paragraph className="trace-reply">{formatDate(run.createdAt)} · 未收束记录 {run.openItemCount || 0} · {run.lastEvent || "无事件"}</Paragraph>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无运行记录。" />
          )}
        </Collapse.Item>
      </Collapse>
    </Space>
  );
}

function PlanningRunTranscriptPanel({ transcript, loading, slow, error }) {
  if (loading && !transcript) {
    return (
      <div className="drawer-loading">
        <Spin />
        <Text type="secondary">正在读取本轮过程...</Text>
      </div>
    );
  }
  if (!transcript) {
    return error
      ? <Alert type="error" content={error} />
      : <Empty description="在运行块或 Agent 回复旁点击“过程详情”后查看。" />;
  }
  const items = safeArray(transcript.items);
  const events = safeArray(transcript.events);
  const diagnostics = safeArray(transcript.diagnostics);
  const evidenceReads = safeArray(transcript.evidencePlan?.reads);
  const rawToolTimeline = buildPlanningToolTimeline({ items, events, evidencePlan: transcript.evidencePlan });
  const toolTimeline = compactPlanningToolTimeline(rawToolTimeline);
  const checkSummary = buildPlanningRunCheckSummary(transcript);
  const activityRows = buildPlanningActivityRowsFromTimeline(transcript.activityTimeline, 10);
  const canonicalProcessSteps = planningCanonicalProcessStepsFromRun(transcript, { live: false, limit: 18 });
  const hasCanonicalProcessFlow = canonicalProcessSteps.length > 0;
  const displaySteps = buildPlanningCodexDisplaySteps({
    run: transcript,
    rows: hasCanonicalProcessFlow ? [] : activityRows,
    statusText: planningRunStatusLabel(transcript.status),
    pendingApprovals: safeArray(transcript.approvals).filter((approval) => approval.status === "pending").length,
    failedCount: hasCanonicalProcessFlow ? 0 : toolTimeline.filter((entry) => ["failed", "blocked"].includes(String(entry.status || ""))).length,
    live: false,
    limit: 8
  });
  const visibleProcessSteps = canonicalProcessSteps.length > 0 ? canonicalProcessSteps : displaySteps;
  const showLegacyActionDetails = !hasCanonicalProcessFlow && toolTimeline.length > 0;
  const elapsedText = formatElapsedTime(transcript.createdAt, transcript.finishedAt || transcript.updatedAt);
  const terminalTone = planningRunSettledTone(transcript, checkSummary);
  const primaryCheckStatus = String(transcript.completionVerifier?.status || checkSummary.status || "");
  const primaryCheckLabel = primaryCheckStatus === "passed"
    ? "检查通过"
    : ["failed", "blocked"].includes(primaryCheckStatus)
      ? "检查未通过"
      : "检查有提醒";
  const hasCheckConcern = primaryCheckStatus !== "passed"
    || diagnostics.length > 0
    || safeArray(transcript.verifierChain?.steps).some((step) => !["passed", "completed", ""].includes(String(step?.status || "")));
  const copyMarkdown = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      notify("warning", "当前浏览器不支持直接复制");
      return;
    }
    navigator.clipboard.writeText(transcript.markdown || "").then(() => {
      notify("success", "过程 Markdown 已复制");
    }).catch(() => notify("error", "复制失败"));
  };
  return (
    <div className="agent-transcript-shell">
      {loading && (
        <Alert
          type={slow ? "warning" : "info"}
          content={slow ? "过程还在补全。先显示已返回的摘要，详细记录会继续更新。" : "正在补全过程，下面先显示当前摘要。"}
        />
      )}
      {!loading && error && <Alert type="error" content={error} />}

      <div className={`agent-transcript-hero ${terminalTone}`}>
        <div>
          <div className="agent-transcript-status">
            <span className={`codex-run-state-line ${terminalTone}`}>
              <span className="codex-run-state-dot" aria-hidden="true" />
              <Text>{planningRunStatusLabel(transcript.status)}</Text>
            </span>
            {elapsedText && <Text type="secondary">已处理 {elapsedText}</Text>}
            <Text type="secondary">当前会话</Text>
          </div>
          <Text className="agent-transcript-user">{transcript.userMessagePreview || "未记录用户消息"}</Text>
        </div>
        <Button size="mini" icon={<IconCopy />} onClick={copyMarkdown}>复制过程</Button>
      </div>

      <div className="agent-transcript-meta-line">
        <span>{visibleProcessSteps.length || toolTimeline.length || safeArray(transcript.activityTimeline).length} 段过程</span>
        {hasCheckConcern && <span>{primaryCheckLabel}</span>}
        {transcript.budget && <span>上下文 {formatTokenCount(transcript.budget.estimatedPromptTokens || 0)} / {formatTokenCount(transcript.budget.promptBudgetTokens || 0)}</span>}
      </div>

      {visibleProcessSteps.length > 0 && (
        <div className="agent-transcript-section">
          <div className="agent-section-head compact">
            <Text bold>本轮过程</Text>
            <Text type="secondary">按本轮行动顺序合并显示</Text>
          </div>
          <PlanningCodexDisplayStream steps={visibleProcessSteps} />
        </div>
      )}

      <Collapse className="agent-inline-collapse codex-disclosure-collapse agent-transcript-collapse" bordered={false} defaultActiveKey={[hasCheckConcern && checkSummary.status === "failed" ? "check" : ""].filter(Boolean)}>
        {showLegacyActionDetails && (
          <Collapse.Item name="actions" header={<PlanningDisclosureHeader label="读写记录" meta={`${toolTimeline.length} 条`} />}>
            <PlanningToolTimeline entries={toolTimeline} limit={30} showDebug={false} />
          </Collapse.Item>
        )}
        <Collapse.Item name="check" header={<PlanningDisclosureHeader label="检查" meta={primaryCheckStatus === "passed" ? "通过" : ["failed", "blocked"].includes(primaryCheckStatus) ? "需要处理" : "有提醒"} />}>
          <div className="codex-review-block compact">
            <div className="codex-review-strip">
              <Tag color={primaryCheckStatus === "passed" ? "green" : ["failed", "blocked"].includes(primaryCheckStatus) ? "red" : "orange"}>
                {primaryCheckStatus === "passed" ? "检查通过" : ["failed", "blocked"].includes(primaryCheckStatus) ? "需要处理" : "有提醒"}
              </Tag>
              <Text>{shortText(checkSummary.summary, 220)}</Text>
            </div>
            {diagnostics.length > 0 && (
              <div className="codex-review-list">
                {diagnostics.slice(-8).map((diagnostic, index) => (
                  <div key={`${diagnostic.code || diagnostic.type}-${index}`} className="codex-review-row">
                    <Tag color={diagnostic.retryable === false ? "red" : "orange"}>{diagnostic.retryable === false ? "阻断" : "提示"}</Tag>
                    <Text>{planningUserVisibleText(diagnostic.message, 220) || diagnostic.code || "有一条运行提示"}</Text>
                  </div>
                ))}
              </div>
            )}
            {safeArray(transcript.verifierChain?.steps).length > 0 && (
              <div className="codex-review-list">
                {safeArray(transcript.verifierChain.steps).slice(-8).map((step) => (
                  <div key={step.id || step.type} className="codex-review-row">
                    <Tag color={step.status === "passed" ? "green" : step.status === "failed" ? "red" : "orange"}>{planningReviewStatusLabel(step.status)}</Tag>
                    <Text>{step.label || step.type || "检查项"}</Text>
                    {step.summary && <Text type="secondary">{shortText(step.summary, 120)}</Text>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Collapse.Item>
        <Collapse.Item name="context" header={<PlanningDisclosureHeader label="权限与预算" meta={safeArray(transcript.approvals).length ? `${safeArray(transcript.approvals).length} 条确认` : "本轮设置"} />}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Descriptions column={1} size="small" border>
              <Descriptions.Item label="时间">{formatDate(transcript.createdAt)} → {formatDate(transcript.finishedAt || transcript.updatedAt)}</Descriptions.Item>
              <Descriptions.Item label="上下文预算">
                {transcript.budget ? `${transcript.budget.estimatedPromptTokens || 0}/${transcript.budget.promptBudgetTokens || 0} tokens` : "未记录"}
              </Descriptions.Item>
            </Descriptions>
            {safeArray(transcript.approvals).length > 0 && (
              <div className="agent-source-list">
                {safeArray(transcript.approvals).map((approval) => (
                  <div key={approval.id} className="agent-source-row">
                    <Tag color={approval.status === "approved" ? "green" : approval.status === "rejected" ? "red" : "orange"}>{approval.status === "approved" ? "已允许" : approval.status === "rejected" ? "已拒绝" : "待确认"}</Tag>
                    <Text>{shortText(approval.reason || "权限确认", 180)}</Text>
                    <Text type="secondary">{safeArray(approval.operations).length} 个操作</Text>
                  </div>
                ))}
              </div>
            )}
          </Space>
        </Collapse.Item>
        <Collapse.Item name="debug" header={<PlanningDisclosureHeader label="调试记录" meta={`${items.length} 步 · ${events.length} 事件`} />}>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {rawToolTimeline.length > 0 && (
              <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
                <Collapse.Item name="raw-tools" header={<PlanningDisclosureHeader label="原始工具流水" meta={`${rawToolTimeline.length} 条`} />}>
                  <PlanningToolTimeline entries={rawToolTimeline} limit={40} compact={false} showDebug />
                </Collapse.Item>
              </Collapse>
            )}
          {evidenceReads.length > 0 && (
            <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="raw-evidence" header={<PlanningDisclosureHeader label="原始读取记录" meta={`${evidenceReads.length} 条`} />}>
                <div className="agent-source-list">
                  {evidenceReads.map((read) => (
                    <div key={read.id} className="agent-source-row">
                      <Tag color="arcoblue">{planningToolKindLabel(read.toolType)}</Tag>
                      <div>
                        <Text>{shortText(read.query || read.whyRead, 140)}</Text>
                        <Paragraph className="trace-reply">{shortText(read.resultUsedFor || read.whyRead, 220)}</Paragraph>
                      </div>
                    </div>
                  ))}
                </div>
              </Collapse.Item>
            </Collapse>
          )}
            <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="events" header={<PlanningDisclosureHeader label="原始事件" meta={`${events.length} 条`} />}>
                <Timeline>
                  {events.slice(-120).map((event, index) => (
                    <TimelineItem key={event.id || `${event.type}-${index}`} label={formatDate(event.createdAt)}>
                      <Tag color={event.phase === "tool_execution" ? "orange" : event.phase === "model_call" ? "purple" : event.phase === "evidence" ? "arcoblue" : "gray"}>
                        {event.phase || event.type || "event"}
                      </Tag>
                      <Paragraph className="trace-reply">{event.message || shortText(prettyJson(event.data), 180)}</Paragraph>
                    </TimelineItem>
                  ))}
                </Timeline>
              </Collapse.Item>
              <Collapse.Item name="markdown" header={<PlanningDisclosureHeader label="过程 Markdown" meta="可复制" />}>
                <TextArea value={transcript.markdown || ""} readOnly autoSize={{ minRows: 14, maxRows: 28 }} />
              </Collapse.Item>
            </Collapse>
          </Space>
        </Collapse.Item>
      </Collapse>
    </div>
  );
}

function PlanningContextPanel({ lastAssistant, activeNovel, activeBranchId = "main", providers = [], busy, commit }) {
  const latestRun = safeArray(activeNovel?.planning?.runs)
    .filter((run) => (run.branchId || "main") === activeBranchId)
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
  const latestEvidencePlan = latestRun?.evidencePlan || null;
  const latestRunToolTimeline = latestRun
    ? buildPlanningToolTimeline({ items: latestRun.items, events: latestRun.events, evidencePlan: latestRun.evidencePlan })
    : [];
  const latestEvidenceToolTimeline = planningReadableEvidenceEntries(latestRunToolTimeline);
  const majorCharacters = safeArray(activeNovel?.characters).filter((character) => character.roleType === "major");
  const currentProfile = resolvePlannerContextProfileClient(activeNovel, providers);
  const budget = latestRun?.budget || currentProfile;
  const toolStats = planningToolStats(lastAssistant?.skillOpReport);
  const compaction = activeNovel.planning?.contextCompaction || null;
  const latestProcessSteps = planningCanonicalProcessStepsFromRun(latestRun, { live: false, limit: 14 });
  const [activeSection, setActiveSection] = useState(latestProcessSteps.length ? "process" : "budget");
  const [contextAssets, setContextAssets] = useState(null);
  const [contextTask, setContextTask] = useState("planner");
  const [contextCharacterId, setContextCharacterId] = useState("");
  const [contextQuery, setContextQuery] = useState("");
  const [contextPackPreview, setContextPackPreview] = useState(null);
  const loadContextAssets = async () => {
    const result = await commit("planning-context-assets", () => api.planningContextAssets(activeNovel.id, {
      limit: 40,
      branchId: activeBranchId
    }), "已刷新当前会话保存的原文");
    setContextAssets(result);
  };
  const inspectContextPack = async () => {
    const params = { task: contextTask, query: contextQuery };
    if (contextTask === "character") params.characterId = contextCharacterId || majorCharacters[0]?.id || "";
    const result = await commit("context-pack-inspect", () => api.contextPack(activeNovel.id, params), "已生成上下文包");
    if (result?.contextPack) setContextPackPreview(result.contextPack);
  };
  const revertCompactionVersion = async (version) => {
    await commit("planning-compaction-revert", () => api.revertPlanningContextCompaction(activeNovel.id, { version }), "压缩摘要已回退");
  };
  const assetCount = contextAssets?.count || safeArray(budget.assetRefs).length || safeArray(compaction?.assetRefs).length;
  const sections = [
    { key: "process", label: "本轮过程", meta: latestProcessSteps.length ? `${latestProcessSteps.length} 步` : "暂无" },
    { key: "budget", label: "上下文预算", meta: `${formatTokenCount(budget.estimatedPromptTokens || 0)} / ${formatTokenCount(budget.promptBudgetTokens || 0)}` },
    { key: "ops", label: "读写记录", meta: `${toolStats.total || latestRunToolTimeline.length || 0}` },
    { key: "evidence", label: "资料读取", meta: `${latestEvidenceToolTimeline.length || safeArray(latestEvidencePlan?.reads).length}` },
    { key: "compaction", label: "压缩摘要", meta: compaction ? `v${compaction.version || 1}` : "无" },
    { key: "assets", label: "已保存原文", meta: `${assetCount || 0}` },
    { key: "context-pack", label: "上下文包预览", meta: contextPackPreview ? "已生成" : "按需" }
  ];
  const renderBody = () => {
    if (activeSection === "process") {
      return latestRun ? (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>最近一轮过程</Text>
              <Paragraph className="trace-reply">这里只显示会话里可理解的行动顺序。工具参数、旧证据引用和原始事件放在“读写记录”或过程详情里。</Paragraph>
            </div>
            <Tag color={isPlanningRunDisplayTerminal(latestRun) ? "green" : "orange"}>{planningRunStatusLabel(latestRun.status)}</Tag>
          </div>
          {latestProcessSteps.length ? (
            <PlanningCodexDisplayStream steps={latestProcessSteps} />
          ) : (
            <Empty description="最近一轮还没有可展示的过程。" />
          )}
        </div>
      ) : <Empty description="当前会话还没有运行记录。" />;
    }
    if (activeSection === "budget") {
      return (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>模型上下文预算</Text>
              <Paragraph className="trace-reply">预算按当前策划模型窗口计算。达到压缩触发线后，旧消息和大工具输出会被摘要化或保存成可追踪引用，最近尾部仍保留原文。</Paragraph>
            </div>
            <Tag color={budget.exceeded ? "orange" : "green"}>{budget.exceeded ? "已到压力区" : "预算内"}</Tag>
          </div>
          <div className="agent-kpi-strip">
            <div><Text type="secondary">窗口</Text><strong>{formatTokenCount(budget.contextWindowTokens || currentProfile.contextWindowTokens)}</strong></div>
            <div><Text type="secondary">prompt 预算</Text><strong>{formatTokenCount(budget.promptBudgetTokens || currentProfile.promptBudgetTokens)}</strong></div>
            <div><Text type="secondary">压缩触发</Text><strong>{formatTokenCount(budget.compressionTriggerTokens || currentProfile.compressionTriggerTokens)}</strong></div>
            <div><Text type="secondary">输出保留</Text><strong>{formatTokenCount(budget.responseReserveTokens || currentProfile.responseReserveTokens)}</strong></div>
            <div><Text type="secondary">安全余量</Text><strong>{formatTokenCount(budget.safetyTokens || currentProfile.safetyTokens)}</strong></div>
          </div>
          <Space wrap>
            <Tag color="arcoblue">估算 {budget.tokenizer || "cl100k_base"}</Tag>
            <Tag color="gray">{contextProfileSourceLabel(budget.profileSource || budget.tokenBudgetSource || currentProfile.source)}</Tag>
            {budget.tokenEstimateIsFallback && <Tag color="orange">字符估算兜底</Tag>}
          </Space>
        </div>
      );
    }
    if (activeSection === "ops") {
      const toolEntries = latestRunToolTimeline.length
        ? latestRunToolTimeline
        : lastAssistant?.skillOpReport
          ? buildPlanningToolTimeline({ report: lastAssistant.skillOpReport })
          : [];
      return toolEntries.length ? (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <Text bold>读写记录</Text>
            <Space wrap>
              <Tag color="arcoblue">检索 {toolStats.searches}</Tag>
              <Tag color="green">写入 {toolStats.writes}</Tag>
              <Tag color="purple">原生 {toolStats.nativeToolCalls}</Tag>
              <Tag color="orange">证据 {toolStats.evidenceReads}</Tag>
              {toolStats.skipped > 0 && <Tag color="red">跳过 {toolStats.skipped}</Tag>}
            </Space>
          </div>
          <PlanningToolTimeline entries={toolEntries} limit={16} />
        </div>
      ) : <Empty description="暂无动作明细" />;
    }
    if (activeSection === "evidence") {
      return latestEvidencePlan ? (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>资料读取</Text>
              <Paragraph className="trace-reply">这里优先显示 Agent 实际查找、列目录和读取文件得到的结果；内部引用编号只放在下方调试记录里。</Paragraph>
            </div>
            <Tag color="arcoblue">动作 {latestEvidenceToolTimeline.length}</Tag>
          </div>
          {latestEvidenceToolTimeline.length ? (
            <PlanningToolTimeline entries={latestEvidenceToolTimeline} limit={20} />
          ) : (
            <Empty description="本轮还没有可读资料结果。" />
          )}
          <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
            <Collapse.Item name="scheduler" header={<PlanningDisclosureHeader label="调试读取记录" meta={`${safeArray(latestEvidencePlan.reads).length} 条读取`} />}>
              <Paragraph className="trace-reply">{latestEvidencePlan.reason || "Agent 已自动读取所需资料"}</Paragraph>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {safeArray(latestEvidencePlan.layers).map((layer) => (
                  <div key={layer.name} className="agent-tool-row">
                    <Tag color={layer.status === "completed" ? "green" : layer.status === "warning" ? "orange" : "arcoblue"}>{planningReadableEvidenceLayerLabel(layer.name)}</Tag>
                    <Text>{shortText(layer.reason, 150)}</Text>
                    <Text type="secondary">{safeArray(layer.toolTypes).join("、") || "工具"}</Text>
                  </div>
                ))}
                {safeArray(latestEvidencePlan.reads).map((read) => (
                  <div key={read.id} className="agent-tool-row">
                    <Tag color="arcoblue">{planningToolKindLabel(read.toolType)}</Tag>
                    <div>
                      <Text>{shortText(read.query || read.whyRead, 130)}</Text>
                      <Paragraph className="trace-reply">{shortText(read.resultUsedFor || read.whyRead, 180)}</Paragraph>
                    </div>
                    <Text type="secondary">{read.assetId ? `引用 ${shortText(read.assetId, 18)}` : `${read.count || 0} 条`}</Text>
                  </div>
                ))}
              </Space>
            </Collapse.Item>
          </Collapse>
        </div>
      ) : <Empty description="还没有资料读取记录。Agent 开始运行后会自行查找档案、世界书、记忆、正文和旧运行内容。" />;
    }
    if (activeSection === "compaction") {
      if (!compaction) return <Empty description="当前会话还没有触发上下文压缩。达到上下文压力时会自动生成内部摘要。" />;
      const quality = compaction.qualityReview || {};
      const tokenStats = compaction.tokenStats || {};
      return (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>压缩摘要 v{compaction.version || 1}</Text>
              <Paragraph className="trace-reply">范围 {compaction.sourceRange?.firstMessageId || "-"} → {compaction.sourceRange?.lastMessageId || "-"}。摘要只用于模型上下文，不等于写入档案、记忆或世界书。</Paragraph>
            </div>
            <Tag color={quality.status === "failed" ? "red" : quality.status === "warning" ? "orange" : "green"}>{quality.status || "未审查"}</Tag>
          </div>
          <Space wrap>
            <Tag color="arcoblue">token {formatTokenCount(tokenStats.afterTokens || 0)}</Tag>
            <Tag color="green">节省 {formatTokenCount(tokenStats.savedTokens || 0)}</Tag>
            <Tag color="gray">{tokenStats.tokenizer || "tokenizer"}</Tag>
            <Tag color={compaction.assetRefs?.length ? "orange" : "gray"}>引用 {compaction.assetRefs?.length || 0}</Tag>
            <Tag color="purple">版本 {compaction.versionChain?.length || 0}</Tag>
          </Space>
          {quality.summary && <Paragraph className="trace-reply">{quality.summary}</Paragraph>}
          {safeArray(compaction.versionChain).length > 0 && (
            <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="versions" header={`版本链 ${safeArray(compaction.versionChain).length} 条`}>
                <div className="agent-compact-list">
                  {safeArray(compaction.versionChain).slice().reverse().map((record) => (
                    <div key={record.id || record.version} className="agent-compact-row">
                      <Space wrap size={6}>
                        <Tag color="purple">v{record.version}</Tag>
                        <Tag color={record.qualityStatus === "failed" ? "red" : record.qualityStatus === "warning" ? "orange" : "green"}>{record.qualityStatus || "未审查"}</Tag>
                        <Text type="secondary">{shortText(`${record.sourceFirstMessageId || "-"} → ${record.sourceLastMessageId || "-"}`, 52)}</Text>
                      </Space>
                      <Button
                        size="mini"
                        icon={<IconUndo />}
                        disabled={record.version === compaction.version}
                        loading={busy === "planning-compaction-revert"}
                        onClick={() => revertCompactionVersion(record.version)}
                      >
                        回到此版
                      </Button>
                    </div>
                  ))}
                </div>
              </Collapse.Item>
              <Collapse.Item name="raw" header="压缩记录 JSON">
                <TextArea value={prettyJson(compaction)} autoSize={{ minRows: 12, maxRows: 22 }} readOnly />
              </Collapse.Item>
            </Collapse>
          )}
        </div>
      );
    }
    if (activeSection === "assets") {
      return (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>已保存原文</Text>
              <Paragraph className="trace-reply">长文件、工具输出和压缩历史会保存成可追踪原文，Agent 后续可自动读取。</Paragraph>
            </div>
            <Button size="small" icon={<IconRefresh />} loading={busy === "planning-context-assets"} onClick={loadContextAssets}>刷新</Button>
          </div>
          {contextAssets ? (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Space wrap>
                <Tag color="arcoblue">当前会话原文 {contextAssets.count || 0}</Tag>
                <Tag color="purple">token {formatTokenCount(contextAssets.totalTokens || 0)}</Tag>
                <Tag color="gray">会话 {shortText(contextAssets.branchId || activeBranchId, 24)}</Tag>
                <Tag color="gray">{shortText(contextAssets.root, 80)}</Tag>
              </Space>
              {safeArray(contextAssets.assets).map((asset) => (
                <div key={asset.id} className="agent-tool-row">
                  <Tag color={asset.kind === "context_compaction" ? "purple" : "orange"}>{planningReferenceKindLabel(asset)}</Tag>
                  <Text>{shortText(planningReferenceTitle(asset), 120)}</Text>
                  <Text type="secondary">{formatTokenCount(asset.tokens || 0)} · {shortText(asset.id, 24)}</Text>
                </div>
              ))}
            </Space>
          ) : (
            <Empty description="点击刷新后查看当前会话保存的原文。" />
          )}
        </div>
      );
    }
    return (
      <div className="agent-detail-section">
        <div className="agent-section-head">
          <div>
            <Text bold>上下文包预览</Text>
            <Paragraph className="trace-reply">这是运行时调试视角，用来预览某一类 AI 可能收到的固定层、世界书层、长期记忆层、RAG 证据层和近场历史层。</Paragraph>
          </div>
        </div>
        <Space wrap>
          <Text type="secondary">预览对象</Text>
          <Select
            value={contextTask}
            onChange={(value) => {
              setContextTask(value);
              if (value !== "character") setContextCharacterId("");
            }}
            style={{ width: 180 }}
          >
            {contextPackTaskOptions.map((option) => <Option key={option.value} value={option.value}>{option.label}</Option>)}
          </Select>
          {contextTask === "character" && (
            <Select
              value={contextCharacterId || undefined}
              onChange={(value) => setContextCharacterId(value || "")}
              placeholder="选择主要角色"
              style={{ width: 180 }}
              allowClear
            >
              {majorCharacters.map((character) => <Option key={character.id} value={character.id}>{character.name}</Option>)}
            </Select>
          )}
        </Space>
        <Input.Search
          value={contextQuery}
          onChange={setContextQuery}
          searchButton="生成预览"
          placeholder="输入当前会话目标、场景目标、角色问题或资料关键词"
          onSearch={inspectContextPack}
          loading={busy === "context-pack-inspect"}
        />
        {contextPackPreview ? (
          <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={["summary"]}>
            <Collapse.Item name="summary" header="上下文层摘要">
              <Space wrap>
                {safeArray(contextPackPreview.layers).map((layer) => (
                  <Tag key={layer.id || layer.name} color="arcoblue">{planningReadableEvidenceLayerLabel(layer.name || layer.id)}</Tag>
                ))}
                {contextPackPreview.budget && <Tag color="purple">{formatTokenCount(contextPackPreview.budget.estimatedTokens || contextPackPreview.budget.tokens || 0)}</Tag>}
              </Space>
            </Collapse.Item>
            <Collapse.Item name="raw" header="查看完整 JSON">
              <TextArea value={prettyJson(contextPackPreview)} autoSize={{ minRows: 12, maxRows: 22 }} readOnly />
            </Collapse.Item>
          </Collapse>
        ) : (
          <Empty description="普通创作不需要手动打开这里；只在排查上下文输入时生成预览。" />
        )}
      </div>
    );
  };
  return (
    <div className="agent-drawer-shell">
      <div className="agent-drawer-summary">
        <div>
          <Text type="secondary">最近运行</Text>
          <strong>{latestRun ? planningRunStatusLabel(latestRun.status) : "暂无"}</strong>
        </div>
        <div>
          <Text type="secondary">动作</Text>
          <strong>{toolStats.total || 0}</strong>
        </div>
        <div>
          <Text type="secondary">资料读取</Text>
          <strong>{safeArray(latestEvidencePlan?.reads).length}</strong>
        </div>
        <div>
          <Text type="secondary">上下文</Text>
          <strong>{formatTokenCount(budget.contextWindowTokens || currentProfile.contextWindowTokens)}</strong>
        </div>
        <div>
          <Text type="secondary">压缩线</Text>
          <strong>{formatTokenCount(budget.compressionTriggerTokens || currentProfile.compressionTriggerTokens)}</strong>
        </div>
      </div>
      <div className="agent-drawer-layout">
        <nav className="agent-drawer-nav" aria-label="运行审计导航">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`agent-drawer-nav-item ${activeSection === section.key ? "active" : ""}`}
              onClick={() => setActiveSection(section.key)}
            >
              <span>{section.label}</span>
              <em>{section.meta}</em>
            </button>
          ))}
        </nav>
        <main className="agent-drawer-main">
          {renderBody()}
        </main>
      </div>
    </div>
  );
}

function PlanningHistoryVersionPanel({ activeNovel, runs, allRuns, activeBranchId, activeBranchLabel, busy, commit, canRestoreLast, onRestoreLast, onRevertCheckpoint, onOpenTranscript }) {
  const [activeSection, setActiveSection] = useState("runs");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const list = showAllSessions ? safeArray(allRuns) : safeArray(runs);
  const latestRun = list[0] || null;
  const branchCount = safeArray(activeNovel?.planning?.branchState?.branches || activeNovel?.planning?.branches).filter((branch) => !branch.deletedAt).length;
  const latestCheckpoints = safeArray(latestRun?.checkpoints).slice().reverse();
  const checkpointCount = latestCheckpoints.length;
  const sections = [
    { key: "runs", label: "会话记录", meta: `${list.length}` },
    { key: "versions", label: "会话版本", meta: `${branchCount || 1} 会话` },
    { key: "rollback", label: "回退上一轮", meta: `${checkpointCount}` }
  ];
  const renderBody = () => {
    if (activeSection === "versions") {
      return <PlanningVersionGraphPanel activeNovel={activeNovel} busy={busy} commit={commit} compact />;
    }
    if (activeSection === "rollback") {
      return (
        <div className="agent-detail-section">
          <div className="agent-section-head">
            <div>
              <Text bold>{showAllSessions ? "全部会话细节" : "当前会话回退"}</Text>
              <Paragraph className="trace-reply">主入口只回退当前会话上一轮；本轮细节只显示最近一轮，避免把所有历史点摊出来让你管理。</Paragraph>
            </div>
            <Tooltip content="只影响当前会话。有业务快照时恢复资料；没有快照时只撤回上一轮消息并把原文放回输入框。">
              <Button size="small" icon={<IconUndo />} onClick={onRestoreLast} loading={busy === "planning-revert"} disabled={!canRestoreLast || showAllSessions}>回退上一轮</Button>
            </Tooltip>
          </div>
          {latestCheckpoints.length ? (
            <div className="agent-compact-list">
              {latestCheckpoints.slice(0, 8).map((checkpoint) => (
                <div key={`${latestRun.id}-${checkpoint.id}`} className="agent-compact-row">
                  <div>
                    <Space wrap size={6}>
                      <Tag color={planningRunTagColor(latestRun.status)}>{planningRunStatusLabel(latestRun.status)}</Tag>
                      <Text>{checkpoint.label || `运行片段 ${checkpoint.step}`}</Text>
                    </Space>
                    <Text type="secondary">{shortText(latestRun.userMessagePreview || latestRun.id, 120)} · {formatDate(checkpoint.createdAt)}</Text>
                  </div>
                  {checkpoint.canRollbackToCheckpoint && isPlanningRunTerminal(latestRun) && !showAllSessions && (
                    <Button size="mini" icon={<IconUndo />} loading={busy === "planning-checkpoint-revert"} onClick={() => onRevertCheckpoint(latestRun.id, checkpoint.id)}>
                      回退
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : <Empty description="最近一轮没有可回退细节。" />}
        </div>
      );
    }
    return (
      <PlanningRunHistoryExplorer
        runs={list}
        busy={busy}
        latestRun={latestRun}
        canRestoreLast={!showAllSessions && canRestoreLast}
        onRestoreLast={onRestoreLast}
        onRevertCheckpoint={onRevertCheckpoint}
        onOpenTranscript={onOpenTranscript}
      />
    );
  };
  return (
    <div className="agent-drawer-shell agent-history-shell">
      <div className="agent-history-topline">
        <div className="agent-history-title">
          <Text type="secondary">{showAllSessions ? "全部会话记录" : "当前会话记录"}</Text>
          <strong>{showAllSessions ? (latestRun ? planningRunStatusLabel(latestRun.status) : "暂无运行") : activeBranchLabel}</strong>
        </div>
        <div className="agent-history-pills" aria-label="会话记录摘要">
          <span>最近 {latestRun ? planningRunStatusLabel(latestRun.status) : "暂无"}</span>
          <span>{list.length} 次运行</span>
          <span>{checkpointCount} 个本轮细节</span>
          <span>{branchCount || 1} 条会话</span>
        </div>
        <label className="agent-history-scope">
          <Switch size="small" checked={showAllSessions} onChange={setShowAllSessions} />
          <span>{showAllSessions ? "全部会话" : "当前会话"}</span>
        </label>
      </div>
      <nav className="agent-history-tabs" aria-label="运行历史导航">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`agent-history-tab ${activeSection === section.key ? "active" : ""}`}
            onClick={() => setActiveSection(section.key)}
          >
            <span>{section.label}</span>
            <em>{section.meta}</em>
          </button>
        ))}
      </nav>
      <main className="agent-drawer-main agent-history-main">
        {renderBody()}
      </main>
    </div>
  );
}

function PlanningRunHistoryExplorer({ runs, busy, latestRun, canRestoreLast, onRestoreLast, onRevertCheckpoint, onOpenTranscript }) {
  const [selectedRunId, setSelectedRunId] = useState(latestRun?.id || "");
  useEffect(() => {
    if (!runs.length) {
      setSelectedRunId("");
      return;
    }
    if (!runs.some((run) => run.id === selectedRunId)) setSelectedRunId(runs[0].id);
  }, [runs, selectedRunId]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  if (!runs.length) return <Empty description="暂无会话记录。Agent 运行后会生成可审计版本链。" />;
  return (
    <div className="agent-run-explorer">
      <div className="agent-run-list">
        {runs.slice(0, 40).map((run) => (
          <button
            key={run.id}
            type="button"
            className={`agent-run-list-item ${selectedRun?.id === run.id ? "active" : ""}`}
            onClick={() => setSelectedRunId(run.id)}
          >
            <span>
              <Tag color={planningRunTagColor(run.status)}>{planningRunStatusLabel(run.status)}</Tag>
              {run.branchId && run.branchId !== "main" && <Tag color="purple">{shortText(run.branchId, 12)}</Tag>}
            </span>
            <strong>{shortText(run.userMessagePreview || run.id, 72)}</strong>
            <em>{formatDate(run.createdAt)}</em>
          </button>
        ))}
      </div>
      <div className="agent-run-detail">
        {selectedRun ? (
          <div className="agent-detail-section">
            <div className="agent-section-head">
              <div>
                <Text bold>{shortText(selectedRun.userMessagePreview || selectedRun.id, 120)}</Text>
                <Paragraph className="trace-reply">{selectedRun.id} · {formatDate(selectedRun.createdAt)}</Paragraph>
              </div>
              <Space wrap>
                <Button size="small" icon={<IconFile />} onClick={() => onOpenTranscript?.(selectedRun.id)}>过程详情</Button>
                <Tooltip content="回退当前会话最近一轮；普通对话也能撤回消息，不再只依赖业务快照。">
                  <Button size="small" icon={<IconUndo />} onClick={onRestoreLast} loading={busy === "planning-revert"} disabled={!canRestoreLast}>回退上一轮</Button>
                </Tooltip>
              </Space>
            </div>
            <div className="agent-kpi-strip compact">
              <div><Text type="secondary">状态</Text><strong>{planningRunStatusLabel(selectedRun.status)}</strong></div>
              <div><Text type="secondary">步骤</Text><strong>{planningRunCount(selectedRun, "items")}</strong></div>
              <div><Text type="secondary">事件</Text><strong>{planningRunCount(selectedRun, "events")}</strong></div>
              <div><Text type="secondary">本轮细节</Text><strong>{planningRunCount(selectedRun, "checkpoints")}</strong></div>
              <div><Text type="secondary">预算</Text><strong>{formatTokenCount(selectedRun.budget?.estimatedPromptTokens || 0)} / {formatTokenCount(selectedRun.budget?.promptBudgetTokens || 0)}</strong></div>
            </div>
            <Space wrap>
              {selectedRun.resumeState?.status === "available" && <Tag color="orange">未收束</Tag>}
              {selectedRun.selfReview && <Tag color={selectedRun.selfReview.status === "passed" ? "green" : "orange"}>自检 {planningReviewStatusLabel(selectedRun.selfReview.status)}</Tag>}
              {selectedRun.completionVerifier && <Tag color={selectedRun.completionVerifier.status === "passed" ? "green" : "orange"}>完成判定 {planningReviewStatusLabel(selectedRun.completionVerifier.status)}</Tag>}
              {selectedRun.budget?.compressionTriggerTokens && <Tag color="purple">压缩线 {formatTokenCount(selectedRun.budget.compressionTriggerTokens)}</Tag>}
            </Space>
            <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="checkpoints" header={`本轮细节回退 ${planningRunCount(selectedRun, "checkpoints")}`}>
                {safeArray(selectedRun.checkpoints).length ? (
                  <div className="version-checkpoint-list">
                    {safeArray(selectedRun.checkpoints).slice().reverse().map((checkpoint) => (
                      <div key={checkpoint.id} className="version-checkpoint-row">
                        <div>
                          <Text>{checkpoint.label || `运行片段 ${checkpoint.step}`}</Text>
                          <br />
                          <Text type="secondary">{formatDate(checkpoint.createdAt)}</Text>
                        </div>
                        {checkpoint.canRollbackToCheckpoint && isPlanningRunTerminal(selectedRun) && (
                          <Button size="mini" icon={<IconUndo />} loading={busy === "planning-checkpoint-revert"} onClick={() => onRevertCheckpoint(selectedRun.id, checkpoint.id)}>
                            回退
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <Empty description="这次运行没有可回退细节。" />}
              </Collapse.Item>
              <Collapse.Item name="raw" header="运行摘要 JSON">
                <TextArea value={prettyJson({
                  id: selectedRun.id,
                  status: selectedRun.status,
                  branchId: selectedRun.branchId,
                  budget: selectedRun.budget,
                  resumeState: selectedRun.resumeState,
                  selfReview: selectedRun.selfReview,
                  completionVerifier: selectedRun.completionVerifier
                })} autoSize={{ minRows: 10, maxRows: 20 }} readOnly />
              </Collapse.Item>
            </Collapse>
          </div>
        ) : <Empty description="选择一次运行查看详情。" />}
      </div>
    </div>
  );
}

function PlanningVersionGraphPanel({ activeNovel, busy, commit, compact = false }) {
  const activeBranchId = activeNovel?.planning?.activeBranchId || "main";
  const [graph, setGraph] = useState(null);
  const [responseTree, setResponseTree] = useState(null);
  const [focusedNodeId, setFocusedNodeId] = useState("");
  const [nodeDiff, setNodeDiff] = useState(null);
  const [mergeSourceBranchId, setMergeSourceBranchId] = useState("");
  const [mergeTargetBranchId, setMergeTargetBranchId] = useState(activeBranchId);
  const [mergePreview, setMergePreview] = useState(null);
  const [allBranches, setAllBranches] = useState(false);
  const [responseRevertTarget, setResponseRevertTarget] = useState("");
  const loadGraph = async (nextAllBranches = allBranches) => {
    const result = await commit("planning-version-graph", () => api.planningVersionGraph(activeNovel.id, {
      branchId: activeBranchId,
      allBranches: nextAllBranches ? "1" : "0",
      limit: 220
    }), "版本图已刷新");
    setGraph(result.graph || null);
    setResponseTree(result.graph?.responseTree || null);
    setFocusedNodeId(result.graph?.responseTree?.currentNodeId || "");
  };
  const loadNodeDiff = async (nodeId) => {
    const toNodeId = String(nodeId || "").trim();
    const fromNodeId = String(focusedNodeId || responseTree?.currentNodeId || graph?.responseTree?.currentNodeId || "").trim();
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
      notify("warning", "请先查看一个不同的节点，再进行对比");
      return;
    }
    const result = await commit(`planning-response-diff-${toNodeId}`, () => api.planningResponseTreeDiff(activeNovel.id, {
      branchId: activeBranchId,
      allBranches: allBranches ? "1" : "0",
      fromNodeId,
      toNodeId,
      limit: 800
    }), "节点对比已生成");
    setNodeDiff(result.diff || null);
  };
  const revertResponseNode = (nodeId) => {
    const targetNodeId = String(nodeId || "").trim();
    if (!targetNodeId) return;
    setResponseRevertTarget(targetNodeId);
  };
  const submitResponseNodeRevert = async () => {
    const targetNodeId = String(responseRevertTarget || "").trim();
    if (!targetNodeId) return false;
    const result = await commit(`planning-response-revert-${targetNodeId}`, () => api.revertPlanningResponseTreeNode(activeNovel.id, targetNodeId), "已回退节点");
    if (!result) return false;
    setResponseRevertTarget("");
    await loadGraph(allBranches);
    return true;
  };
  const previewBranchMerge = async () => {
    if (!mergeSourceBranchId) {
      notify("warning", "请选择来源会话");
      return;
    }
    const result = await commit("planning-branch-merge-preview", () => api.planningBranchMergePreview(activeNovel.id, {
      sourceBranchId: mergeSourceBranchId,
      targetBranchId: mergeTargetBranchId || activeBranchId
    }), "会话合并预览已生成");
    setMergePreview(result.preview || null);
  };
  const applyBranchMerge = async () => {
    if (!mergePreview?.canMerge) {
      notify("warning", "当前预览不能合并");
      return;
    }
    await commit("planning-branch-merge-apply", () => api.mergePlanningBranch(activeNovel.id, {
      sourceBranchId: mergePreview.sourceBranch.id,
      targetBranchId: mergePreview.targetBranch.id
    }), "已创建合并会话");
    setMergePreview(null);
    await loadGraph(true);
  };
  const focusResponseTreeNode = async (nodeId) => {
    const targetNodeId = String(nodeId || "").trim();
    if (!targetNodeId) return;
    const result = await commit(`planning-response-tree-${targetNodeId}`, () => api.planningResponseTree(activeNovel.id, {
      branchId: activeBranchId,
      allBranches: allBranches ? "1" : "0",
      nodeId: targetNodeId,
      limit: 260
    }), "会话脉络已刷新");
    setResponseTree(result.tree || null);
    setFocusedNodeId(result.tree?.currentNodeId || targetNodeId);
  };
  useEffect(() => {
    let cancelled = false;
    if (!activeNovel?.id) return undefined;
    api.planningVersionGraph(activeNovel.id, { branchId: activeBranchId, limit: 180 })
      .then((result) => {
        if (cancelled) return;
        setGraph(result.graph || null);
        setResponseTree(result.graph?.responseTree || null);
        setFocusedNodeId(result.graph?.responseTree?.currentNodeId || "");
      })
      .catch(() => {
        if (cancelled) return;
        setGraph(null);
        setResponseTree(null);
        setFocusedNodeId("");
      });
    return () => {
      cancelled = true;
    };
  }, [activeNovel?.id, activeBranchId]);
  useEffect(() => {
    setMergeTargetBranchId(activeBranchId);
    setMergePreview(null);
    setNodeDiff(null);
  }, [activeNovel?.id, activeBranchId]);
  const nodes = safeArray(graph?.nodes).slice().reverse();
  const summary = graph?.summary || {};
  const tree = responseTree || graph?.responseTree || null;
  const treeNodeById = useMemo(() => new Map(safeArray(tree?.nodes).map((node) => [node.id, node])), [tree]);
  const currentPathNodes = safeArray(tree?.currentPathIds).map((id) => treeNodeById.get(id)).filter(Boolean);
  const forkNodes = safeArray(tree?.nodes)
    .filter((node) => safeArray(node.childIds).length > 1)
    .slice(-8)
    .reverse();
  const branchOptions = safeArray(activeNovel?.planning?.branches).filter((branch) => !branch.deletedAt && !branch.archived);
  const effectiveMergeTarget = mergeTargetBranchId || activeBranchId;
  return (
    <div className={`agent-version-graph-card agent-version-graph-panel ${compact ? "compact" : ""}`}>
      <PanelTitle
        icon={<IconBranch />}
        title="会话版本"
        extra={(
          <Space size={8} wrap>
            <Tooltip content="只扩大版本图的查看范围，不会切换当前会话，也不会修改资料。">
              <Switch
                size="small"
                checked={allBranches}
                onChange={(checked) => {
                  setAllBranches(checked);
                  loadGraph(checked);
                }}
              />
            </Tooltip>
            <Tooltip content="开启后用于跨会话审计；回退仍默认按当前会话隔离。">
              <Text type="secondary">全部会话</Text>
            </Tooltip>
            <Button size="mini" icon={<IconRefresh />} loading={busy === "planning-version-graph"} onClick={() => loadGraph()}>
              刷新
            </Button>
          </Space>
        )}
      />
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {!compact && (
          <Alert
            type="info"
            content="这里汇总当前会话的消息、运行、工具调用、最近一轮细节和压缩版本。长链路和节点列表默认收纳，需要时再展开。"
          />
        )}
        <Space wrap>
          <Tag color="arcoblue">节点 {summary.nodeCount || nodes.length}</Tag>
          <Tag color="purple">边 {summary.edgeCount || 0}</Tag>
          <Tag color="gray">会话 {graph?.branchId || activeBranchId}</Tag>
          {Object.entries(summary.kindCounts || {}).slice(0, 6).map(([kind, count]) => (
            <Tag key={kind} color={planningVersionKindColor(kind)}>{planningVersionKindLabel(kind)} {count}</Tag>
          ))}
        </Space>
        <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={compact ? [] : ["path"]}>
          <Collapse.Item name="path" header={<PlanningDisclosureHeader label="会话脉络" meta={`${currentPathNodes.length} 个节点`} />}>
        <div className="agent-response-tree-panel">
          <div className="agent-response-tree-head">
            <Space wrap size={6}>
              <Tag color="magenta" icon={<IconBranch />}>会话脉络</Tag>
              <Tag color="arcoblue">深度 {tree?.summary?.currentDepth || currentPathNodes.length || 0}</Tag>
              <Tag color="gray">根 {tree?.summary?.rootCount || 0}</Tag>
              {tree?.summary?.hasForks && <Tag color="purple">存在派生</Tag>}
            </Space>
            <Text type="secondary">{focusedNodeId ? `当前查看 ${shortText(focusedNodeId, 34)}` : "默认查看当前会话最新节点"}</Text>
          </div>
          {currentPathNodes.length ? (
            <div className="agent-response-path">
              {currentPathNodes.map((node, index) => (
                <div key={node.id} className={`agent-response-path-node ${node.id === tree?.currentNodeId ? "active" : ""}`}>
                  <div className="agent-response-path-rail">
                    <span>{index + 1}</span>
                  </div>
                  <div className="agent-response-path-body">
                    <Space wrap size={6}>
                      <Tag color={planningVersionKindColor(node.kind)}>{planningVersionKindLabel(node.kind)}</Tag>
                      {node.branchId !== "main" && <Tag color="purple">{shortText(node.branchId, 18)}</Tag>}
                      {safeArray(node.otherParentIds).length > 0 && <Tag color="orange">旁路父节点 {safeArray(node.otherParentIds).length}</Tag>}
                      {safeArray(node.childIds).length > 1 && <Tag color="purple">派生 {safeArray(node.childIds).length}</Tag>}
                    </Space>
                    <Text className="agent-version-node-title">{node.label}</Text>
                    <Paragraph className="trace-reply">{shortText(node.summary || node.sourceId, 160)}</Paragraph>
                    <Space wrap size={6}>
                      <Tooltip content="只把会话版本视角移动到这个节点，方便查看它之前的脉络；不会回退、不会修改小说资料。">
                        <Button size="mini" type="text" icon={<IconSearch />} loading={busy === `planning-response-tree-${node.id}`} onClick={() => focusResponseTreeNode(node.id)}>
                          查看到这里
                        </Button>
                      </Tooltip>
                      <Tooltip content="拿当前查看节点和这个节点生成对比，用来判断两段会话记录差异；不会修改资料。">
                        <Button size="mini" type="text" icon={<IconSwap />} loading={busy === `planning-response-diff-${node.id}`} onClick={() => loadNodeDiff(node.id)}>
                          对比
                        </Button>
                      </Tooltip>
                      {(node.sourceType === "planning_checkpoint" || node.kind === "assistant_message") && (
                        <Tooltip content="只有带业务快照的节点可回退；回退会恢复当时资料状态，需要重新从当前会话继续。">
                          <Button size="mini" type="text" status="warning" icon={<IconUndo />} loading={busy === `planning-response-revert-${node.id}`} onClick={() => revertResponseNode(node.id)}>
                            回退此节点
                          </Button>
                        </Tooltip>
                      )}
                    </Space>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无可展示的会话脉络。" />
          )}
          {forkNodes.length > 0 && (
            <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
              <Collapse.Item name="forks" header={`查看最近 ${forkNodes.length} 个派生点`}>
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  {forkNodes.map((node) => (
                    <div key={node.id} className="agent-response-fork-row">
                      <Space wrap size={6}>
                        <Tag color={planningVersionKindColor(node.kind)}>{planningVersionKindLabel(node.kind)}</Tag>
                        <Text>{shortText(node.label, 80)}</Text>
                        <Text type="secondary">子节点 {safeArray(node.childIds).length}</Text>
                      </Space>
                      <Tooltip content="把右侧审计视角移动到这个派生点，只用于查看，不会修改资料。">
                        <Button size="mini" type="text" icon={<IconSearch />} onClick={() => focusResponseTreeNode(node.id)}>
                          查看脉络
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </Space>
              </Collapse.Item>
            </Collapse>
          )}
        </div>
          </Collapse.Item>
        </Collapse>
        <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
          <Collapse.Item name="node-diff" header="节点对比 / 单节点回退">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Alert type="info" content="对比会检查当前查看节点和你选择的节点；单节点回退只支持带业务快照的本轮细节或 Agent 回复节点，普通资料结果节点只能审计不能直接回退。" />
              {nodeDiff ? (
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space wrap>
                    <Tag color="gray">from {shortText(nodeDiff.fromNode?.id, 28)}</Tag>
                    <Tag color="arcoblue">to {shortText(nodeDiff.toNode?.id, 28)}</Tag>
                    <Tag color="purple">节点变化 {nodeDiff.summary?.nodeChangeCount || 0}</Tag>
                    <Tag color="orange">负载变化 {nodeDiff.summary?.payloadChangeCount || 0}</Tag>
                    {nodeDiff.rollback?.supported && <Tag color="green">可回退</Tag>}
                  </Space>
                  <div className="agent-diff-change-grid">
                    {safeArray(nodeDiff.nodeChanges).slice(0, 8).map((change) => (
                      <div key={`node-${change.key}`} className="agent-diff-change-row">
                        <Tag color="arcoblue">{change.key}</Tag>
                        <Text type="secondary">{shortText(change.before, 70)} → {shortText(change.after, 70)}</Text>
                      </div>
                    ))}
                    {safeArray(nodeDiff.payloadChanges).slice(0, 8).map((change) => (
                      <div key={`payload-${change.key}`} className="agent-diff-change-row">
                        <Tag color="orange">{change.key}</Tag>
                        <Text type="secondary">{shortText(change.before, 70)} → {shortText(change.after, 70)}</Text>
                      </div>
                    ))}
                  </div>
                  <TextArea value={nodeDiff.unifiedDiff || ""} autoSize={{ minRows: 8, maxRows: 18 }} readOnly />
                </Space>
              ) : (
                <Empty description="点击版本节点的“对比”后查看差异。" />
              )}
            </Space>
          </Collapse.Item>
          <Collapse.Item name="branch-merge" header="会话合并">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Alert type="info" content="合并不会静默覆盖另一条会话的写入结果，而是创建新的合并会话，把来源会话作为证据上下文交给后续 Agent 审查和继续执行。" />
              <div className="agent-branch-merge-grid">
                <FormItem label="来源会话">
                  <Select value={mergeSourceBranchId} onChange={setMergeSourceBranchId} placeholder="选择要合入的会话">
                    {branchOptions.filter((branch) => branch.id !== effectiveMergeTarget).map((branch) => (
                      <Option key={branch.id} value={branch.id}>{branch.label || branch.id}</Option>
                    ))}
                  </Select>
                </FormItem>
                <FormItem label="目标会话">
                  <Select value={effectiveMergeTarget} onChange={setMergeTargetBranchId}>
                    {branchOptions.map((branch) => (
                      <Option key={branch.id} value={branch.id}>{branch.label || branch.id}</Option>
                    ))}
                  </Select>
                </FormItem>
              </div>
              <Space wrap>
                <Button size="small" icon={<IconSearch />} loading={busy === "planning-branch-merge-preview"} onClick={previewBranchMerge}>
                  预览合并
                </Button>
                <Button size="small" type="primary" icon={<IconBranch />} disabled={!mergePreview?.canMerge} loading={busy === "planning-branch-merge-apply"} onClick={applyBranchMerge}>
                  创建合并会话
                </Button>
              </Space>
              {mergePreview && (
                <div className="agent-branch-merge-preview">
                  <Space wrap>
                    <Tag color="purple">来源新增 {mergePreview.sourceBranch?.newMessageCount || 0}</Tag>
                    <Tag color="arcoblue">目标尾部 {mergePreview.targetBranch?.newMessageCount || 0}</Tag>
                    <Tag color={mergePreview.canMerge ? "green" : "red"}>{mergePreview.canMerge ? "可创建合并会话" : "不可合并"}</Tag>
                  </Space>
                  {safeArray(mergePreview.risks).map((risk, index) => (
                    <Alert key={index} type="warning" content={risk} />
                  ))}
                  <div className="agent-response-path">
                    {safeArray(mergePreview.sourceNewMessages).slice(-6).map((message, index) => (
                      <div key={message.id} className="agent-response-path-node">
                        <div className="agent-response-path-rail"><span>{index + 1}</span></div>
                        <div className="agent-response-path-body">
                          <Space wrap size={6}>
                            <Tag color={message.role === "assistant" ? "green" : "arcoblue"}>{message.role === "assistant" ? "Agent" : "用户"}</Tag>
                            <Text type="secondary">{formatDate(message.createdAt)}</Text>
                          </Space>
                          <Paragraph className="trace-reply">{shortText(message.content, 180)}</Paragraph>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Space>
          </Collapse.Item>
        </Collapse>
        {nodes.length ? (
          <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
            <Collapse.Item name="nodes" header={`版本节点 ${nodes.length} 条`}>
              <div className="agent-version-node-list">
                {nodes.slice(0, 80).map((node) => (
                  <div key={node.id} className={`agent-version-node ${node.id === tree?.currentNodeId ? "active" : ""}`}>
                    <div className="agent-version-node-main">
                      <Space wrap size={6}>
                        <Tag color={planningVersionKindColor(node.kind)}>{planningVersionKindLabel(node.kind)}</Tag>
                        {node.status && <Tag color={node.status === "failed" ? "red" : node.status === "running" ? "arcoblue" : node.status === "applied" ? "orange" : "gray"}>{planningRunStatusLabel(node.status) || node.status}</Tag>}
                        {node.branchId !== "main" && <Tag color="purple" icon={<IconBranch />}>{shortText(node.branchId, 18)}</Tag>}
                      </Space>
                      <Text className="agent-version-node-title">{node.label}</Text>
                      <Paragraph className="trace-reply">{shortText(node.summary || node.sourceId, 180)}</Paragraph>
                    </div>
                    <div className="agent-version-node-side">
                      <Text type="secondary">{formatDate(node.createdAt)}</Text>
                      <Text type="secondary">{safeArray(node.parentIds).length ? `父节点 ${safeArray(node.parentIds).length}` : "根节点"}</Text>
                      {node.meta?.toolType && <Text type="secondary">{planningToolKindLabel(node.meta.toolType)}</Text>}
                      <Tooltip content="只调整会话版本里当前查看的位置，不改变当前会话内容。">
                        <Button size="mini" type="text" icon={<IconSearch />} loading={busy === `planning-response-tree-${node.id}`} onClick={() => focusResponseTreeNode(node.id)}>
                          查看脉络
                        </Button>
                      </Tooltip>
                      <Tooltip content="以当前查看节点为基准生成对比；用于检查会话差异，不会写入或回退。">
                        <Button size="mini" type="text" icon={<IconSwap />} loading={busy === `planning-response-diff-${node.id}`} onClick={() => loadNodeDiff(node.id)}>
                          对比
                        </Button>
                      </Tooltip>
                      {(node.sourceType === "planning_checkpoint" || node.kind === "assistant_message") && (
                        <Tooltip content="恢复这个节点的业务快照；普通工具节点没有快照只能审计。">
                          <Button size="mini" type="text" status="warning" icon={<IconUndo />} loading={busy === `planning-response-revert-${node.id}`} onClick={() => revertResponseNode(node.id)}>
                            回退
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Collapse.Item>
          </Collapse>
        ) : (
          <Empty description="暂无版本节点。运行策划 Agent 后会生成消息、运行和工具版本记录。" />
        )}
      </Space>
      <Modal
        title="回退会话版本节点"
        visible={Boolean(responseRevertTarget)}
        okText="回退"
        cancelText="取消"
        confirmLoading={busy === `planning-response-revert-${responseRevertTarget}`}
        okButtonProps={{ status: "warning" }}
        onOk={submitResponseNodeRevert}
        onCancel={() => setResponseRevertTarget("")}
      >
        <Alert type="warning" content="只支持带业务快照的本轮细节或 Agent 回复节点。回退会恢复当时的项目资料状态，后续运行需重新从当前会话推进。" />
      </Modal>
    </div>
  );
}

function AgentPermissionPanel({ activeNovel, busy, commit }) {
  const planning = activeNovel?.planning || {};
  const [mode, setMode] = useState(planning.agentPermissionMode || "ask_high_risk");
  const [settings, setSettings] = useState(normalizeAgentToolSettingsForClient(planning.agentToolSettings));
  const [permissionPolicy, setPermissionPolicy] = useState(normalizeAgentPermissionPolicyForClient(planning.agentPermissionPolicy));
  const [newCommandPrefix, setNewCommandPrefix] = useState("");
  const [newCommandAccess, setNewCommandAccess] = useState("confirm");
  const [shellJobs, setShellJobs] = useState([]);
  const [verifierRunner, setVerifierRunner] = useState(normalizeVerifierRunnerForClient(planning.verifierRunner));
  const [verifierReviewersText, setVerifierReviewersText] = useState(prettyJson(normalizeVerifierRunnerForClient(planning.verifierRunner).modelReviewers));
  const [verifierCommandsText, setVerifierCommandsText] = useState(prettyJson(normalizeVerifierRunnerForClient(planning.verifierRunner).commandSteps));
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    setMode(planning.agentPermissionMode || "ask_high_risk");
    setSettings(normalizeAgentToolSettingsForClient(planning.agentToolSettings));
    setPermissionPolicy(normalizeAgentPermissionPolicyForClient(planning.agentPermissionPolicy));
    const nextVerifier = normalizeVerifierRunnerForClient(planning.verifierRunner);
    setVerifierRunner(nextVerifier);
    setVerifierReviewersText(prettyJson(nextVerifier.modelReviewers));
    setVerifierCommandsText(prettyJson(nextVerifier.commandSteps));
  }, [activeNovel?.id, planning.agentPermissionMode, planning.agentToolSettings, planning.agentPermissionPolicy, planning.verifierRunner]);
  useEffect(() => {
    let cancelled = false;
    if (!activeNovel?.id) return undefined;
    api.planningTools(activeNovel.id)
      .then((result) => {
        if (!cancelled) setCatalog(result.catalog || null);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeNovel?.id, planning.agentPermissionMode, planning.agentToolSettings]);

  const patchSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  };
  const addCommandRule = () => {
    const prefix = String(newCommandPrefix || "").trim();
    if (!prefix) {
      notify("warning", "请输入命令前缀");
      return;
    }
    setPermissionPolicy((current) => ({
      ...current,
      commandRules: [
        ...safeArray(current.commandRules),
        {
          id: `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          prefix,
          access: newCommandAccess,
          scope: "persistent"
        }
      ].slice(-80)
    }));
    setNewCommandPrefix("");
  };
  const removeCommandRule = (ruleId) => {
    setPermissionPolicy((current) => ({
      ...current,
      commandRules: safeArray(current.commandRules).filter((rule) => rule.id !== ruleId)
    }));
  };
  const removePermissionRule = (bucket, ruleId) => {
    setPermissionPolicy((current) => ({
      ...current,
      [bucket]: safeArray(current?.[bucket]).filter((rule) => rule.id !== ruleId)
    }));
  };
  const loadShellJobs = async () => {
    const result = await commit("planning-shell-jobs", () => api.planningShellJobs(activeNovel.id, { limit: 30 }), "后台 Shell 作业已刷新");
    setShellJobs(result.jobs || []);
  };
  const stopShellJob = async (jobId) => {
    await commit(`planning-shell-job-stop-${jobId}`, () => api.stopPlanningShellJob(activeNovel.id, jobId, { force: true }), "后台 Shell 作业已停止");
    await loadShellJobs();
  };
  const save = () => {
    let commandSteps = [];
    let modelReviewers = [];
    try {
      const parsed = JSON.parse(verifierCommandsText || "[]");
      commandSteps = Array.isArray(parsed) ? parsed : [];
      const parsedReviewers = JSON.parse(verifierReviewersText || "[]");
      modelReviewers = Array.isArray(parsedReviewers) ? parsedReviewers : [];
    } catch {
      notify("error", "Verifier JSON 不合法");
      return Promise.resolve();
    }
    return commit("agent-permission-save", () => api.patchNovel(activeNovel.id, {
      planning: {
        agentPermissionMode: mode,
        agentToolSettings: settings,
        agentPermissionPolicy: permissionPolicy,
        verifierRunner: {
          ...verifierRunner,
          modelReviewers,
          commandSteps
        }
      }
    }), "Agent 权限已保存");
  };
  const catalogTools = safeArray(catalog?.tools);
  const rememberedPermissionRows = [
    ...safeArray(permissionPolicy.directoryRules).map((rule) => ({
      ...rule,
      bucket: "directoryRules",
      kind: "目录",
      target: rule.path,
      color: "arcoblue"
    })),
    ...safeArray(permissionPolicy.commandRules).map((rule) => ({
      ...rule,
      bucket: "commandRules",
      kind: "命令",
      target: rule.prefix,
      color: "orange"
    })),
    ...safeArray(permissionPolicy.toolRules).map((rule) => ({
      ...rule,
      bucket: "toolRules",
      kind: "工具",
      target: planningToolKindLabel(rule.tool),
      color: "purple"
    }))
  ];
  const toolGroups = catalogTools.length
    ? [
        { key: "novel_domain", title: "小说域工具", color: "green" },
        { key: "local_files", title: "本地文件", color: "arcoblue" },
        { key: "web", title: "联网", color: "orange" },
        { key: "shell", title: "Shell", color: "red" },
        { key: "agent", title: "子 Agent", color: "purple" },
        { key: "external", title: "外部接口", color: "gray" }
      ].map((group) => ({
        ...group,
        tools: catalogTools.filter((tool) => tool.category === group.key)
      })).filter((group) => group.tools.length)
    : [
        { title: "小说域工具", color: "green", tools: ["search", "searchContextAssets", "readContextAsset", "readMessageAttachment", "inspectNovelDiagnostics", "applyArchivePatch", "upsertMemory", "patchMemory", "retireMemory", "upsertLorebook", "patchLorebook", "deleteLorebook", "updateCharacterCard", "markArchiveRecord", "patchArchiveRecord", "deleteArchiveRecord", "upsertProseDraft", "patchProseDraft", "annotateTurn", "updateAiSlot", "addProviderModel", "generateRoleplayConfigDraft", "generatePrewritePlan", "runRoleplayTurn", "reviewLatestTurn", "adaptRoleplayToProse", "runNormalWritingWorkflow", "runChapterWorkflow", "postwriteProse"].map((type) => ({ type, label: planningToolKindLabel(type), enabled: true })) },
        { title: "本地文件", color: "arcoblue", tools: ["searchFiles", "searchLocalFiles", "readLocalFile", "listFiles", "globFiles", "grepFiles", "indexLocalFiles", "readFile", "writeFile", "previewPatchFile", "applyPatch", "patchFile", "revertPatch", "revertFilePatch", "previewPatchSet", "applyPatchSet", "revertPatchSet"].map((type) => ({ type, label: planningToolKindLabel(type), enabled: true })) },
        { title: "外部能力", color: "orange", tools: ["webSearch", "webFetch", "runShell", "startShellSession", "writeShellSession", "readShellSession", "stopShellSession", "startShellJob", "listShellJobs", "readShellJob", "stopShellJob", "spawnSubAgent", "customTool", "mcpTool"].map((type) => ({ type, label: planningToolKindLabel(type), enabled: true })) }
      ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        type="info"
        content="这些设置控制 Agent 自主工具边界。低风险检索会自动执行；高风险写入、文件补丁、shell 和外部工具会按权限模式拒绝、询问或执行。"
      />
      <Form layout="vertical">
        <FormItem label="权限模式">
          <Select value={mode} onChange={setMode}>
            <Option value="read_only">只读</Option>
            <Option value="auto_edit">自动编辑低风险</Option>
            <Option value="ask_high_risk">高风险询问</Option>
            <Option value="full_auto">全自动</Option>
          </Select>
        </FormItem>
        <Descriptions column={1} size="small" border>
          <Descriptions.Item label="当前模式">{planningPermissionModeLabel(mode)}</Descriptions.Item>
          <Descriptions.Item label="Agent 工作区">{planning.defaultAgentFolder || "未设置"}</Descriptions.Item>
          <Descriptions.Item label="权限规则">
            目录 {safeArray(catalog?.permissionPolicy?.directoryRules).length} · 命令 {safeArray(catalog?.permissionPolicy?.commandRules).length} · 工具 {safeArray(catalog?.permissionPolicy?.toolRules).length}
          </Descriptions.Item>
        </Descriptions>
        <div className="agent-websearch-grid">
          <FormItem label="联网搜索提供商">
            <Select value={settings.webSearchProvider} onChange={(value) => patchSetting("webSearchProvider", value)}>
              <Option value="auto">自动 fallback</Option>
              <Option value="bing">Bing 轻量搜索</Option>
              <Option value="duckduckgo">DuckDuckGo 轻量搜索</Option>
              <Option value="jina">Jina Search</Option>
              <Option value="disabled">禁用搜索 Provider</Option>
            </Select>
          </FormItem>
          <FormItem label="搜索缓存 TTL（分钟）">
            <InputNumber
              min={5}
              max={10080}
              step={30}
              value={settings.webSearchCacheTtlMinutes}
              onChange={(value) => patchSetting("webSearchCacheTtlMinutes", Number(value || 720))}
            />
          </FormItem>
        </div>
      </Form>
      <div className="agent-permission-switches">
        <label>
          <Switch checked={settings.webEnabled} onChange={(checked) => patchSetting("webEnabled", checked)} />
          <span>联网搜索 / 读取网页</span>
        </label>
        <label>
          <Switch checked={settings.shellEnabled} onChange={(checked) => patchSetting("shellEnabled", checked)} />
          <span>Shell 命令</span>
        </label>
        <label>
          <Switch checked={settings.customToolsEnabled} onChange={(checked) => patchSetting("customToolsEnabled", checked)} />
          <span>自定义工具</span>
        </label>
        <label>
          <Switch checked={settings.mcpEnabled} onChange={(checked) => patchSetting("mcpEnabled", checked)} />
          <span>MCP 工具</span>
        </label>
      </div>
      <div className="agent-command-auth-panel">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Text className="field-label">命令授权</Text>
          <Alert type="warning" content="这里配置 shell 命令前缀的持久授权。拒绝优先级最高；允许规则只跳过同前缀命令的二次确认，不会绕过危险命令和工作区外 cwd 检查。" />
          <div className="agent-command-rule-editor">
            <Input
              value={newCommandPrefix}
              onChange={setNewCommandPrefix}
              placeholder="例如 npm test / node scripts/ / Get-ChildItem"
            />
            <Select value={newCommandAccess} onChange={setNewCommandAccess}>
              <Option value="confirm">每次确认</Option>
              <Option value="allow">允许</Option>
              <Option value="deny">拒绝</Option>
            </Select>
            <Button icon={<IconPlus />} onClick={addCommandRule}>添加</Button>
          </div>
          {safeArray(permissionPolicy.commandRules).length ? (
            <div className="agent-command-rule-list">
              {safeArray(permissionPolicy.commandRules).map((rule) => (
                <div key={rule.id} className="agent-command-rule-row">
                  <Space wrap size={6}>
                    <Tag color={rule.access === "allow" ? "green" : rule.access === "deny" ? "red" : "orange"}>{rule.access === "allow" ? "允许" : rule.access === "deny" ? "拒绝" : "确认"}</Tag>
                    <Text>{rule.prefix}</Text>
                    <Text type="secondary">{rule.scope || "persistent"}</Text>
                  </Space>
                  <Button size="mini" type="text" status="danger" icon={<IconDelete />} onClick={() => removeCommandRule(rule.id)}>删除</Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="还没有命令前缀授权；高风险 shell 会按权限模式请求确认。" />
          )}
        </Space>
      </div>
      <div className="agent-command-auth-panel">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
            <div>
              <Text className="field-label">已记住的权限</Text>
              <Paragraph className="trace-reply">审批弹窗里选择“当前会话 / 当前小说工作区”后会出现在这里；删除后下次同类操作会重新询问。</Paragraph>
            </div>
            <Tag color={rememberedPermissionRows.length ? "arcoblue" : "gray"}>{rememberedPermissionRows.length} 条</Tag>
          </Space>
          {rememberedPermissionRows.length ? (
            <div className="agent-command-rule-list">
              {rememberedPermissionRows.map((rule) => (
                <div key={`${rule.bucket}-${rule.id}`} className="agent-command-rule-row">
                  <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
                    <Space wrap size={6}>
                      <Tag color={rule.color}>{rule.kind}</Tag>
                      <Tag color={rule.access === "allow" ? "green" : rule.access === "deny" ? "red" : "orange"}>
                        {rule.access === "allow" ? "允许" : rule.access === "deny" ? "拒绝" : rule.access || "确认"}
                      </Tag>
                      <Text>{shortText(rule.target, 120)}</Text>
                    </Space>
                    <Text type="secondary">
                      {rule.scope === "persistent" ? "当前小说工作区" : rule.scope === "session" ? "当前会话" : "仅本次"}
                      {rule.branchId ? ` · 会话 ${shortText(rule.branchId, 20)}` : ""}
                      {rule.expiresAt ? ` · 到期 ${formatDate(rule.expiresAt)}` : ""}
                    </Text>
                  </Space>
                  <Button size="mini" type="text" status="danger" icon={<IconDelete />} onClick={() => removePermissionRule(rule.bucket, rule.id)}>删除</Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="还没有从审批弹窗记住的权限。" />
          )}
        </Space>
      </div>
      <div className="agent-command-auth-panel">
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
            <Text className="field-label">后台 Shell 作业</Text>
            <Button size="mini" icon={<IconRefresh />} loading={busy === "planning-shell-jobs"} onClick={loadShellJobs}>刷新</Button>
          </Space>
          {safeArray(shellJobs).length ? (
            <div className="agent-command-rule-list">
              {safeArray(shellJobs).map((job) => (
                <div key={job.id} className="agent-command-rule-row">
                  <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
                    <Space wrap size={6}>
                      <Tag color={job.status === "running" ? "arcoblue" : job.status === "failed" ? "red" : job.status === "stopped" ? "orange" : "green"}>{job.status}</Tag>
                      <Text>{shortText(job.name || job.command, 80)}</Text>
                      <Text type="secondary">{job.exitCode === null || job.exitCode === undefined ? "exit -" : `exit ${job.exitCode}`}</Text>
                    </Space>
                    <Text type="secondary">{shortText(job.cwd, 110)} · {job.durationMs || 0}ms</Text>
                  </Space>
                  {job.status === "running" && (
                    <Button size="mini" status="danger" icon={<IconRecordStop />} loading={busy === `planning-shell-job-stop-${job.id}`} onClick={() => stopShellJob(job.id)}>
                      停止
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无后台 shell 作业；Agent 使用 startShellJob 后会显示在这里。" />
          )}
        </Space>
      </div>
      <Divider />
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Text className="field-label">验收链</Text>
        <Alert
          type="info"
          content="完成判定会按链路执行：确定性检查、可选外部命令检查、可选审查模型。外部命令只允许在当前小说 Agent 工作区内运行，并且需要开启 Shell 命令。"
        />
        <div className="agent-permission-switches">
          <label>
            <Switch checked={verifierRunner.enabled} onChange={(checked) => setVerifierRunner((current) => ({ ...current, enabled: checked }))} />
            <span>启用 runner</span>
          </label>
          <label>
            <Switch checked={verifierRunner.deterministicEnabled} onChange={(checked) => setVerifierRunner((current) => ({ ...current, deterministicEnabled: checked }))} />
            <span>确定性判定</span>
          </label>
          <label>
            <Switch checked={verifierRunner.modelReviewEnabled} onChange={(checked) => setVerifierRunner((current) => ({ ...current, modelReviewEnabled: checked }))} />
            <span>模型审查</span>
          </label>
        </div>
        <FormItem label="外部命令检查步骤 JSON">
          <TextArea
            value={verifierCommandsText}
            onChange={setVerifierCommandsText}
            autoSize={{ minRows: 5, maxRows: 12 }}
            placeholder='[{"id":"workspace_check","label":"工作区检查","command":"node --check scripts/check.js","when":"final","required":true}]'
          />
        </FormItem>
        <FormItem label="模型审查器 JSON">
          <TextArea
            value={verifierReviewersText}
            onChange={setVerifierReviewersText}
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder='[{"id":"style_verifier","label":"风格审查","providerId":"provider_x","model":"model_x","when":"tools","required":false}]'
          />
        </FormItem>
      </Space>
      <Divider />
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {toolGroups.map((group) => (
          <div key={group.title} className="agent-tool-capability-group">
            <Text className="field-label">{group.title} · {group.tools.length}</Text>
            <div className="codex-tag-line">
              {group.tools.map((tool) => (
                <Tooltip key={tool.type} content={tool.blockedReason || `${tool.risk || "read"} · ${tool.type}`}>
                  <Tag color={tool.enabled ? group.color : "gray"}>{tool.label || planningToolKindLabel(tool.type)}</Tag>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </Space>
      <Button type="primary" icon={<IconSave />} loading={busy === "agent-permission-save"} onClick={save}>保存权限设置</Button>
    </Space>
  );
}

function RetrievalSettingsPanel({ activeNovel, providers, busy, commit }) {
  const settings = activeNovel?.memory?.settings || {};
  const vector = activeNovel?.memory?.vectorIndex || {};
  const saveRetrievalSettings = (values) => commit("memory-settings", () => api.updateMemorySettings(activeNovel.id, values), "上下文检索设置已保存");

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Alert type="info" content="这些配置服务于策划、导演、角色扮演、次要角色群和改写 AI 的运行时证据召回；它们不是长期记忆条目，也不属于策划会话审计。" />
      <Form key={`retrieval-${activeNovel.id}`} layout="vertical" initialValues={settings} onSubmit={saveRetrievalSettings}>
        <div className="form-grid two">
          <FormItem field="enabled" label="启用上下文组包" triggerPropName="checked"><Switch /></FormItem>
          <FormItem field="vectorEnabled" label="启用向量召回" triggerPropName="checked"><Switch /></FormItem>
          <FormItem field="retrievalMode" label="检索模式">
            <Select>
              <Option value="bm25">BM25</Option>
              <Option value="vector">Vector</Option>
              <Option value="hybrid">Hybrid</Option>
            </Select>
          </FormItem>
          <FormItem field="maxRetrievedItems" label="检索证据条数"><InputNumber min={1} max={30} /></FormItem>
          <FormItem field="maxEvidenceChars" label="单条证据字符预算"><InputNumber min={80} max={4000} step={100} /></FormItem>
          <FormItem field="maxVectorCandidates" label="向量候选数"><InputNumber min={8} max={120} /></FormItem>
          <FormItem field="vectorChunkChars" label="向量分块字符"><InputNumber min={240} max={2400} step={60} /></FormItem>
        </div>
        <div className="form-grid two">
          <FormItem field="embeddingProviderId" label="Embedding 提供商">
            <Select allowClear showSearch>
              {providers.map((provider) => <Option key={provider.id} value={provider.id}>{provider.name}</Option>)}
            </Select>
          </FormItem>
          <FormItem shouldUpdate noStyle>
            {(values) => (
              <FormItem field="embeddingModel" label="Embedding 模型">
                <Select allowCreate allowClear showSearch>
                  {modelOptions(providers, values?.embeddingProviderId).map((model) => <Option key={model} value={model}>{model}</Option>)}
                </Select>
              </FormItem>
            )}
          </FormItem>
          <FormItem field="rerankEnabled" label="启用 Rerank" triggerPropName="checked"><Switch /></FormItem>
          <FormItem field="rerankProviderId" label="Rerank 提供商">
            <Select allowClear showSearch>
              {providers.map((provider) => <Option key={provider.id} value={provider.id}>{provider.name}</Option>)}
            </Select>
          </FormItem>
          <FormItem shouldUpdate noStyle>
            {(values) => (
              <FormItem field="rerankModel" label="Rerank 模型">
                <Select allowCreate allowClear showSearch>
                  {modelOptions(providers, values?.rerankProviderId).map((model) => <Option key={model} value={model}>{model}</Option>)}
                </Select>
              </FormItem>
            )}
          </FormItem>
        </div>
        <Button type="primary" htmlType="submit" icon={<IconSave />} loading={busy === "memory-settings"}>保存检索配置</Button>
      </Form>
      <Card className="compact-card" bordered={false}>
        <PanelTitle icon={<IconThunderbolt />} title="向量索引" />
        <Descriptions column={1} data={[
          { label: "文档数", value: vector.documentCount || 0 },
          { label: "分块数", value: vector.chunkCount || 0 },
          { label: "状态", value: vector.stale ? "需要重建" : "最新" },
          { label: "更新", value: formatDate(vector.updatedAt) }
        ]} />
        <Button icon={<IconBranch />} loading={busy === "vector-rebuild"} onClick={() => commit("vector-rebuild", () => api.rebuildVector(activeNovel.id), "向量索引已重建")}>重建向量索引</Button>
      </Card>
    </Space>
  );
}

function AgentSettingsPage({ activeNovel, providers, busy, commit }) {
  if (!activeNovel) return <EmptyNovel />;

  const settings = activeNovel.memory?.settings || {};
  const planning = activeNovel.planning || {};
  const vector = activeNovel.memory?.vectorIndex || {};
  const toolSettings = normalizeAgentToolSettingsForClient(planning.agentToolSettings);
  const enabledToolKinds = [
    toolSettings.webEnabled && "联网",
    toolSettings.shellEnabled && "Shell",
    toolSettings.customToolsEnabled && "自定义工具",
    toolSettings.mcpEnabled && "MCP"
  ].filter(Boolean);

  return (
    <div className="page-grid agent-settings-layout">
      <section className="page-primary">
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconTool />} title="Agent 权限与工具边界" />
          <Alert type="warning" content="这里是跨 Agent 的运行权限配置，不属于某一轮策划对话的审计记录。改动会影响策划 Agent 后续调用工具、读取文件、执行 shell、联网和 verifier 的边界。" />
          <AgentPermissionPanel activeNovel={activeNovel} busy={busy} commit={commit} />
        </Card>
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconSearch />} title="上下文检索配置" />
          <RetrievalSettingsPanel activeNovel={activeNovel} providers={providers} busy={busy} commit={commit} />
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSafe />} title="配置归属" />
          <ul className="plain-list">
            <li>运行审计：放在策划 Agent 页，只看本轮发生了什么。</li>
            <li>权限和工具开关：放在本页，影响后续所有 Agent 运行。</li>
            <li>RAG 检索配置：放在本页，供策划、导演、角色和改写共用。</li>
            <li>长期记忆条目：仍在“长期记忆”页维护。</li>
          </ul>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconThunderbolt />} title="当前状态" />
          <Descriptions column={1} data={[
            { label: "权限模式", value: planningPermissionModeLabel(planning.agentPermissionMode || "ask_high_risk") },
            { label: "已开启工具", value: enabledToolKinds.join("、") || "仅小说域只读工具" },
            { label: "检索模式", value: settings.retrievalMode || "hybrid" },
            { label: "向量召回", value: settings.vectorEnabled ? "启用" : "关闭" },
            { label: "向量分块", value: vector.chunkCount || 0 }
          ]} />
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconQuestionCircle />} title="为什么不放策划页" />
          <Paragraph type="secondary">
            策划页的审计抽屉应该像 Codex 的运行观察区，只解释当前会话里 Agent 做了什么。检索预算、权限、shell 和 verifier 是项目级运行边界，放在独立设置页更清楚，也能避免误以为它们只影响当前策划消息。
          </Paragraph>
        </Card>
      </aside>
    </div>
  );
}

function PlannerModelQuickSwitch({ activeNovel, providers, busy, onSubmit }) {
  const [form] = Form.useForm();
  const autoFillBudgetRef = useRef(false);
  const plannerSetting = activeNovel.aiRoles?.planner || {};
  const initialProviderId = plannerSetting.providerId || "";
  const initialModel = plannerSetting.model || "";
  const initialContextWindow = plannerSetting.contextWindowTokens || 0;
  const initialResponseReserve = plannerSetting.responseReserveTokens || 0;
  const initialPromptBudget = plannerSetting.promptBudgetTokens || 0;
  const initialCompressionTrigger = plannerSetting.compressionTriggerTokens || 0;
  const initialSafetyTokens = plannerSetting.safetyTokens || 0;
  const hasManualBudget = Boolean(initialContextWindow || initialResponseReserve || initialPromptBudget || initialCompressionTrigger || initialSafetyTokens);
  const currentProfile = resolvePlannerContextProfileClient(activeNovel, providers);
  const formKey = [
    activeNovel.id,
    initialProviderId,
    initialModel,
    initialContextWindow,
    initialResponseReserve,
    initialPromptBudget,
    initialCompressionTrigger,
    initialSafetyTokens
  ].join("-");

  const buildBudgetDraft = (values) => {
    const manual = values?.contextMode === "manual";
    return {
      providerId: values?.providerId,
      model: values?.model,
      contextWindowTokens: manual ? normalizeTokenBudgetOverrideClient(values?.contextWindowTokens) : 0,
      responseReserveTokens: manual ? normalizeTokenBudgetOverrideClient(values?.responseReserveTokens) : 0,
      promptBudgetTokens: manual ? normalizeTokenBudgetOverrideClient(values?.promptBudgetTokens) : 0,
      compressionTriggerTokens: manual ? normalizeTokenBudgetOverrideClient(values?.compressionTriggerTokens) : 0,
      safetyTokens: manual ? normalizeTokenBudgetOverrideClient(values?.safetyTokens) : 0
    };
  };

  const buildDerivedBudgetPatch = (values = {}) => {
    const baseProfile = resolvePlannerContextProfileClient(activeNovel, providers, {
      providerId: values.providerId,
      model: values.model,
      contextWindowTokens: 0,
      responseReserveTokens: 0,
      promptBudgetTokens: 0,
      compressionTriggerTokens: 0,
      safetyTokens: 0
    });
    const windowTokens = normalizeTokenBudgetOverrideClient(values.contextWindowTokens) || baseProfile.contextWindowTokens;
    return deriveClientContextBudgetValues(windowTokens, baseProfile.compactionPressureRatio);
  };

  const applyDerivedBudgetToForm = (values = {}, options = {}) => {
    const derived = buildDerivedBudgetPatch(values);
    if (!derived.contextWindowTokens) return;
    const patch = {
      responseReserveTokens: derived.responseReserveTokens,
      promptBudgetTokens: derived.promptBudgetTokens,
      compressionTriggerTokens: derived.compressionTriggerTokens,
      safetyTokens: derived.safetyTokens
    };
    if (!options.preserveContextInput) {
      patch.contextWindowTokens = derived.contextWindowTokens;
    }
    autoFillBudgetRef.current = true;
    form.setFieldsValue(patch);
    Promise.resolve().then(() => {
      autoFillBudgetRef.current = false;
    });
  };

  const handleValuesChange = (changedValues, values) => {
    if (autoFillBudgetRef.current || values?.contextMode !== "manual") return;
    const changedKeys = Object.keys(changedValues || {});
    if (changedKeys.includes("contextWindowTokens")) {
      const rawWindow = String(changedValues.contextWindowTokens ?? "").trim();
      const normalizedWindow = normalizeTokenBudgetOverrideClient(rawWindow);
      if (!rawWindow) return;
      if (normalizedWindow < 8000 && !/[kKmM万千]/.test(rawWindow)) return;
      applyDerivedBudgetToForm(values, { preserveContextInput: true });
      return;
    }
    const shouldRecalculate = changedKeys.some((key) => ["contextMode", "providerId", "model"].includes(key));
    if (shouldRecalculate) applyDerivedBudgetToForm(values);
  };

  const submitModel = (values) => {
    const manual = values.contextMode === "manual";
    const windowTokens = normalizeTokenBudgetOverrideClient(values.contextWindowTokens);
    const promptTokens = normalizeTokenBudgetOverrideClient(values.promptBudgetTokens);
    const triggerTokens = normalizeTokenBudgetOverrideClient(values.compressionTriggerTokens);
    const reserveTokens = normalizeTokenBudgetOverrideClient(values.responseReserveTokens);
    const safety = normalizeTokenBudgetOverrideClient(values.safetyTokens);
    if (manual) {
      if (!windowTokens || !promptTokens || !triggerTokens || !reserveTokens) {
        notify("error", "手动预算至少需要填写窗口、prompt、压缩触发和输出保留");
        return;
      }
      if (promptTokens + reserveTokens + safety > windowTokens) {
        notify("error", "prompt 预算 + 输出保留 + 安全余量不能超过上下文窗口");
        return;
      }
      if (triggerTokens > promptTokens) {
        notify("error", "压缩触发不能大于 prompt 预算");
        return;
      }
    }
    onSubmit({
      providerId: values.providerId,
      model: values.model,
      resetBudget: !manual,
      contextWindowTokens: manual ? windowTokens : 0,
      responseReserveTokens: manual ? reserveTokens : 0,
      promptBudgetTokens: manual ? promptTokens : 0,
      compressionTriggerTokens: manual ? triggerTokens : 0,
      safetyTokens: manual ? safety : 0,
      compactionPressureRatio: 0
    });
  };

  return (
    <WorkspaceDrawerShell
      className="planner-model-drawer-shell"
      footer={(
        <Button type="primary" icon={<IconSave />} loading={busy === "planner-model-switch"} onClick={() => form.submit()}>
          应用模型
        </Button>
      )}
    >
      <Form
        className="workspace-drawer-form planner-model-form"
        form={form}
        key={`planner-model-${formKey}`}
        layout="vertical"
        initialValues={{
          providerId: initialProviderId,
          model: initialModel,
          contextMode: hasManualBudget ? "manual" : "auto",
          contextWindowTokens: initialContextWindow || currentProfile.contextWindowTokens,
          responseReserveTokens: initialResponseReserve || currentProfile.responseReserveTokens,
          promptBudgetTokens: initialPromptBudget || currentProfile.promptBudgetTokens,
          compressionTriggerTokens: initialCompressionTrigger || currentProfile.compressionTriggerTokens,
          safetyTokens: initialSafetyTokens || currentProfile.safetyTokens
        }}
        onValuesChange={handleValuesChange}
        onSubmit={submitModel}
      >
      <FormItem field="providerId" label="提供商" rules={[{ required: true, message: "请选择提供商" }]}>
        <Select placeholder="选择提供商" showSearch getPopupContainer={popupToBody}>
          {providers.map((provider) => (
            <Option key={provider.id} value={provider.id}>{provider.name}</Option>
          ))}
        </Select>
      </FormItem>
      <FormItem shouldUpdate noStyle>
        {(values) => (
          <FormItem field="model" label="模型" rules={[{ required: true, message: "请选择模型" }]}>
            <Select allowCreate allowClear showSearch placeholder="选择或输入模型" getPopupContainer={popupToBody}>
              {modelOptions(providers, values?.providerId).map((model) => (
                <Option key={model} value={model}>
                  {model}
                </Option>
              ))}
            </Select>
          </FormItem>
        )}
      </FormItem>
      <FormItem field="contextMode" label="上下文预算">
        <Select getPopupContainer={popupToBody}>
          <Option value="auto">自动匹配模型上下文</Option>
          <Option value="manual">手动覆盖窗口和预算</Option>
        </Select>
      </FormItem>
      <FormItem shouldUpdate noStyle>
        {(values) => {
          const profile = resolvePlannerContextProfileClient(activeNovel, providers, buildBudgetDraft(values));
          const manual = values?.contextMode === "manual";
          const totalReserved = Number(profile.promptBudgetTokens || 0) + Number(profile.responseReserveTokens || 0) + Number(profile.safetyTokens || 0);
          const budgetInvalid = manual && (totalReserved > profile.contextWindowTokens || profile.compressionTriggerTokens > profile.promptBudgetTokens);
          return (
            <div className="model-budget-panel">
              <div className="agent-kpi-strip compact">
                <div><Text type="secondary">窗口</Text><strong>{formatTokenCount(profile.contextWindowTokens)}</strong></div>
                <div><Text type="secondary">prompt</Text><strong>{formatTokenCount(profile.promptBudgetTokens)}</strong></div>
                <div><Text type="secondary">压缩触发</Text><strong>{formatTokenCount(profile.compressionTriggerTokens)}</strong></div>
                <div><Text type="secondary">输出保留</Text><strong>{formatTokenCount(profile.responseReserveTokens)}</strong></div>
                <div><Text type="secondary">安全余量</Text><strong>{formatTokenCount(profile.safetyTokens)}</strong></div>
              </div>
              <Alert
                type={budgetInvalid ? "warning" : "info"}
                content={manual
                  ? budgetInvalid
                    ? "当前手动预算不成立：总占用不能超过窗口，压缩触发不能大于 prompt。"
                    : "当前会保存为策划 Agent 的手动预算；这些数值不会追加到模型名，只影响上下文组装和压缩。"
                  : `自动来源：${contextProfileSourceLabel(profile.source)}。窗口可按模型名乐观推断，真实超限后后端会调小并重试；prompt、压缩触发、输出保留可切到手动后逐项覆盖。`}
              />
            </div>
          );
        }}
      </FormItem>
      <FormItem shouldUpdate noStyle>
        {(values) => values?.contextMode === "manual" ? (
          <div className="model-budget-editor">
            <div className="model-budget-actions">
              <Text type="secondary">改上下文窗口会自动推导其它预算；需要细调时直接覆盖对应字段。</Text>
              <Button size="mini" icon={<IconRefresh />} onClick={() => applyDerivedBudgetToForm(values)}>按窗口重算</Button>
            </div>
            <div className="form-grid two">
              <FormItem field="contextWindowTokens" label="上下文窗口 tokens" rules={[{ required: true, message: "请输入上下文窗口" }]}>
                <Input placeholder="例如 1M、128K、1000000" />
              </FormItem>
              <FormItem field="promptBudgetTokens" label="prompt 预算 tokens" rules={[{ required: true, message: "请输入 prompt 预算" }]}>
                <Input placeholder="例如 860K" />
              </FormItem>
              <FormItem field="compressionTriggerTokens" label="压缩触发 tokens" rules={[{ required: true, message: "请输入压缩触发值" }]}>
                <Input placeholder="例如 619K" />
              </FormItem>
              <FormItem field="responseReserveTokens" label="输出保留 tokens" rules={[{ required: true, message: "请输入输出保留" }]}>
                <Input placeholder="例如 24K" />
              </FormItem>
              <FormItem field="safetyTokens" label="安全余量 tokens">
                <Input placeholder="例如 40K，可留空自动" />
              </FormItem>
            </div>
          </div>
        ) : null}
      </FormItem>
        <Alert type="info" content="这里只切换策划 Agent 本身的模型。导演、角色、改写模型仍在“扮演配置”页维护；自动上下文不会写死到槽位，换模型后会重新匹配。" />
      </Form>
    </WorkspaceDrawerShell>
  );
}

function PlannerModelInlineSwitch({ activeNovel, providers, busy, onSubmit }) {
  const currentProviderId = activeNovel.aiRoles?.planner?.providerId || "";
  const currentModel = activeNovel.aiRoles?.planner?.model || "";
  const options = providers.flatMap((provider) => modelOptions(providers, provider.id).map((model) => ({
    value: `${provider.id}::${model}`,
    label: `${provider.name} / ${model}`,
    contextLabel: formatTokenCount(resolvePlannerContextProfileClient(activeNovel, providers, {
      providerId: provider.id,
      model,
      contextWindowTokens: 0,
      responseReserveTokens: 0,
      promptBudgetTokens: 0,
      compressionTriggerTokens: 0,
      safetyTokens: 0
    }).contextWindowTokens),
    providerId: provider.id,
    model
  })));
  const currentValue = currentProviderId && currentModel ? `${currentProviderId}::${currentModel}` : "";
  const currentProfile = resolvePlannerContextProfileClient(activeNovel, providers);

  const changeModel = (value) => {
    const option = options.find((item) => item.value === value);
    if (!option) return;
    onSubmit({
      providerId: option.providerId,
      model: option.model
    });
  };

  return (
    <Select
      className="planner-inline-model"
      size="small"
      value={currentValue}
      placeholder="选择策划模型"
      showSearch
      loading={busy === "planner-model-switch"}
      getPopupContainer={popupToBody}
      onChange={changeModel}
      aria-label="切换策划模型"
    >
      {options.map((item) => (
        <Option key={item.value} value={item.value}>{item.label}</Option>
      ))}
    </Select>
  );
}

function LocalFileSearchPanel({ activeNovel, busy, commit }) {
  const [rootPath, setRootPath] = useState("");
  const [query, setQuery] = useState("");
  const [retrievalMode, setRetrievalMode] = useState("hybrid");
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [results, setResults] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const pickerAbortRef = useRef(null);
  const defaultAgentFolder = activeNovel?.planning?.defaultAgentFolder || "";
  const sources = safeArray(activeNovel?.planning?.localFileSources);
  const enabledCount = sources.filter((source) => source.enabled !== false).length + (defaultAgentFolder ? 1 : 0);
  const pickingRoot = busy === "local-file-pick-root";
  useEffect(() => {
    setRootPath(activeNovel?.planning?.defaultAgentFolder || "");
  }, [activeNovel?.id, activeNovel?.planning?.defaultAgentFolder]);
  useEffect(() => () => {
    pickerAbortRef.current?.abort();
  }, []);
  const searchFiles = async () => {
    const effectiveRoot = rootPath || defaultAgentFolder;
    if (!effectiveRoot) {
      notify("warning", "当前小说的 Agent 工作区异常，请刷新小说状态后再试");
      return;
    }
    const result = await commit("local-file-search", () => api.searchLocalFiles({ rootPath: effectiveRoot, query, includeSubfolders, retrievalMode }), "本地文件检索完成");
    if (result?.items) setResults(result.items);
  };
  const readFile = async (file) => {
    const result = await commit("local-file-read", () => api.readLocalFile({ path: file.path, rootPath: file.rootPath || rootPath || defaultAgentFolder }), "");
    if (result?.file) setActiveFile(result.file);
  };
  const openFile = (file) => commit("local-file-open", () => api.openLocalFile({ path: file.path, rootPath: file.rootPath || rootPath || defaultAgentFolder }), "已调用系统打开文件");
  const pickRoot = async () => {
    if (pickerAbortRef.current) {
      pickerAbortRef.current.abort();
      return;
    }
    const controller = new AbortController();
    pickerAbortRef.current = controller;
    notify("info", "已打开系统文件夹选择器；如果窗口没有出现在前台，可以直接粘贴路径，或点击停止等待。");
    const result = await commit("local-file-pick-root", async () => {
      try {
        return await api.pickLocalFileRoot(rootPath, { signal: controller.signal });
      } catch (error) {
        if (error?.name === "AbortError") {
          notify("info", "已停止等待文件夹选择");
          return null;
        }
        throw error;
      }
    }, "");
    if (pickerAbortRef.current === controller) pickerAbortRef.current = null;
    if (result?.rootPath) {
      setRootPath(result.rootPath);
      notify("success", "已填入新的 Agent 工作区路径");
    } else if (result) {
      notify("info", "没有选择文件夹");
    }
  };
  const stopPickRoot = () => {
    pickerAbortRef.current?.abort();
  };
  const saveDefaultFolder = () => {
    if (!rootPath.trim()) {
      notify("warning", "请先填写或选择新的 Agent 工作区");
      return null;
    }
    return commit("local-file-default-save", () => api.patchNovel(activeNovel.id, { planning: { defaultAgentFolder: rootPath } }), "当前小说 Agent 工作区已更换");
  };
  const saveSources = (nextSources) => {
    return commit("local-file-sources-save", () => api.patchNovel(activeNovel.id, { planning: { localFileSources: nextSources } }), "额外资料文件夹已保存，策划 Agent 可作为补充来源检索");
  };
  const addSource = async () => {
    if (!rootPath.trim()) {
      notify("warning", "请先填写或选择额外资料文件夹");
      return;
    }
    const name = rootPath.split(/[\\/]/).filter(Boolean).pop() || "本地资料";
    await saveSources([
      ...sources,
      {
        id: makeRunId().replace("run_", "local_source_"),
        name,
        rootPath,
        includeSubfolders,
        enabled: true
      }
    ]);
  };
  const toggleSource = (source, enabled) => {
    return saveSources(sources.map((item) => item.id === source.id ? { ...item, enabled } : item));
  };
  const removeSource = (source) => {
    return saveSources(sources.filter((item) => item.id !== source.id));
  };

  return (
    <div className="local-file-drawer-shell">
      <div className="drawer-quiet-note">
        <IconFolder />
        <div>
          <Text bold>当前书的 Agent 工作区</Text>
          <Text type="secondary">Agent 默认在这里读写资料；工作区外的电脑文件仍需要单独授权。人工检索只用于预览，Agent 运行时会自己调用文件工具。</Text>
        </div>
        <Tag color="arcoblue">{enabledCount} 个来源</Tag>
      </div>

      <section className="local-file-workspace-card">
        <div className="local-file-card-head">
          <div>
            <Text className="field-label">默认文件夹</Text>
            <Text type="secondary">相当于 Codex 打开的项目目录。</Text>
          </div>
          <Checkbox checked={includeSubfolders} onChange={setIncludeSubfolders}>包含子文件夹</Checkbox>
        </div>
        <div className="local-file-path-editor">
          <Input
            value={rootPath}
            onChange={setRootPath}
            placeholder="系统默认路径，例如 E:\\扮演法写小说\\novels\\小说名-novel_xxx"
          />
          <Button
            icon={pickingRoot ? <IconRecordStop /> : <IconFolder />}
            status={pickingRoot ? "warning" : undefined}
            onClick={pickingRoot ? stopPickRoot : pickRoot}
          >
            {pickingRoot ? "停止" : "选择"}
          </Button>
          <Button type="primary" icon={<IconSave />} loading={busy === "local-file-default-save"} onClick={saveDefaultFolder}>保存</Button>
        </div>
        {defaultAgentFolder && (
          <div className="local-source-row active">
            <div>
              <Text bold>Agent 工作区</Text>
              <Text type="secondary" className="path-hint">{defaultAgentFolder}</Text>
            </div>
            <Tag color="green">默认</Tag>
          </div>
        )}
      </section>

      <Collapse className="agent-inline-collapse codex-disclosure-collapse local-file-source-collapse" bordered={false} defaultActiveKey={[]}>
        <Collapse.Item name="sources" header={<PlanningDisclosureHeader label="额外资料文件夹" meta={sources.length ? `${sources.length} 个` : "未配置"} />}>
          <div className="local-file-extra-source-editor">
            <Button icon={<IconPlus />} loading={busy === "local-file-sources-save"} onClick={addSource}>把上方路径加入额外来源</Button>
            <Text type="secondary">额外来源只作为补充资料，默认不会覆盖当前书工作区。</Text>
          </div>
          <div className="local-source-list">
            {sources.length ? sources.map((source) => (
              <div key={source.id || source.rootPath} className="local-source-row">
                <div>
                  <Text bold>{source.name || "额外资料"}</Text>
                  <Text type="secondary" className="path-hint">{source.rootPath}</Text>
                  <Text type="secondary">{source.includeSubfolders === false ? "仅当前文件夹" : "包含子文件夹"}</Text>
                </div>
                <Space size={6}>
                  <Switch size="small" checked={source.enabled !== false} loading={busy === "local-file-sources-save"} onChange={(checked) => toggleSource(source, checked)} />
                  <Button size="mini" status="danger" icon={<IconDelete />} loading={busy === "local-file-sources-save"} onClick={() => removeSource(source)}>移除</Button>
                </Space>
              </div>
            )) : <div className="local-file-empty-inline">没有额外资料文件夹。</div>}
          </div>
        </Collapse.Item>
      </Collapse>

      <section className="local-file-search-card">
        <div className="local-file-card-head">
          <div>
            <Text className="field-label">人工预览</Text>
            <Text type="secondary">用于确认文件是否能被检索和读取。</Text>
          </div>
          <Space size={6}>
            <Select value={retrievalMode} onChange={setRetrievalMode} style={{ width: 126 }}>
              <Option value="hybrid">混合</Option>
              <Option value="keyword">关键词</Option>
              <Option value="semantic">语义</Option>
            </Select>
            <Button type="primary" icon={<IconSearch />} loading={busy === "local-file-search"} onClick={searchFiles}>检索</Button>
          </Space>
        </div>
        <Input value={query} onChange={setQuery} placeholder="关键词，可留空列出最近文本文件" />
        <div className="local-file-panel">
          <div className="local-file-results">
            {results.length ? results.map((file) => (
              <button key={file.path} type="button" className="local-file-row" onClick={() => readFile(file)}>
                <Text bold>{file.name}</Text>
                <Text type="secondary">{file.relativePath}</Text>
                <Text type="secondary">{Math.round((file.size || 0) / 1024)} KB · {formatDate(file.updatedAt)}</Text>
              </button>
            )) : <div className="local-file-empty-inline">还没有结果。输入关键词或直接点“检索”。</div>}
          </div>
          <div className="local-file-preview">
            {activeFile ? (
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Space className="between">
                  <Text bold>{activeFile.name}</Text>
                  <Button size="small" icon={<IconFolder />} onClick={() => openFile(activeFile)}>打开</Button>
                </Space>
                <Tooltip content={activeFile.path || activeFile.relativePath || ""}>
                  <Text className="local-file-path-chip" type="secondary">
                    {shortText(activeFile.relativePath || activeFile.path || "", 110)}
                  </Text>
                </Tooltip>
                <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
                  <Collapse.Item name="path" header={<PlanningDisclosureHeader label="完整路径" />}>
                    <TextArea value={activeFile.path || ""} autoSize={{ minRows: 1, maxRows: 3 }} readOnly />
                  </Collapse.Item>
                </Collapse>
                <TextArea value={activeFile.text || ""} autoSize={{ minRows: 14, maxRows: 28 }} readOnly />
              </Space>
            ) : <div className="local-file-preview-empty">选择左侧文件后，在这里预览内容。</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function PlanningRunHistoryCard({ runs, busy, canRestoreLast, onRestoreLast, onRevertCheckpoint, onOpenTranscript }) {
  return (
    <Card className="inspector-card agent-version-card" bordered={false}>
      <PanelTitle
        icon={<IconHistory />}
        title="会话记录"
        extra={(
          <Space size={6}>
            <Tooltip content="回退当前会话最近一轮；有快照恢复资料，没有快照只撤回消息。">
              <Button size="mini" icon={<IconUndo />} onClick={onRestoreLast} loading={busy === "planning-revert"} disabled={!canRestoreLast}>回退上一轮</Button>
            </Tooltip>
          </Space>
        )}
      />
      {safeArray(runs).length ? (
        <Timeline className="agent-version-timeline">
          {safeArray(runs).slice(0, 10).map((run) => (
            <TimelineItem key={run.id} label={formatDate(run.createdAt)}>
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                <Space wrap>
                  <Tag color={run.status === "completed" ? "green" : run.status === "failed" ? "red" : run.status === "paused" ? "orange" : run.status === "cancelled" ? "gray" : "arcoblue"}>
                    {planningRunStatusLabel(run.status)}
                  </Tag>
                  <Tag>{planningRunCount(run, "checkpoints")} 个本轮细节</Tag>
                  {safeArray(run.taskGraph?.nodes).length > 0 && <Tag color="arcoblue">{safeArray(run.taskGraph?.nodes).length} 个步骤节点</Tag>}
                  {run.resumeState?.status === "available" && <Tag color="orange">未收束</Tag>}
                  {run.branchId && run.branchId !== "main" && <Tag color="purple" icon={<IconBranch />}>{shortText(run.branchId, 18)}</Tag>}
                  {run.selfReview && <Tag color={run.selfReview.status === "passed" ? "green" : "orange"}>自检 {planningReviewStatusLabel(run.selfReview.status)}</Tag>}
                  {run.completionVerifier && <Tag color={run.completionVerifier.status === "passed" ? "green" : "orange"}>完成判定 {planningReviewStatusLabel(run.completionVerifier.status)}</Tag>}
                </Space>
                <Paragraph className="trace-reply">{shortText(run.userMessagePreview || run.id, 110)}</Paragraph>
                {(planningRunCount(run, "items") > 0 || planningRunCount(run, "events") > 0) && (
                  <Space wrap size={6}>
                    <Button size="mini" icon={<IconFile />} onClick={() => onOpenTranscript?.(run.id)}>
                      过程详情
                    </Button>
                    <Text type="secondary">步骤 {planningRunCount(run, "items")} · 事件 {planningRunCount(run, "events")}</Text>
                  </Space>
                )}
                {safeArray(run.checkpoints).length > 0 && (
                  <div className="version-checkpoint-list">
                    {safeArray(run.checkpoints).slice(-3).reverse().map((checkpoint) => (
                      <div key={checkpoint.id} className="version-checkpoint-row">
                        <div>
                          <Text>{checkpoint.label || `运行片段 ${checkpoint.step}`}</Text>
                          <br />
                          <Text type="secondary">{formatDate(checkpoint.createdAt)}</Text>
                        </div>
                        {checkpoint.canRollbackToCheckpoint && isPlanningRunTerminal(run) && (
                          <Button size="mini" icon={<IconUndo />} loading={busy === "planning-checkpoint-revert"} onClick={() => onRevertCheckpoint(run.id, checkpoint.id)}>
                            回退
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Space>
            </TimelineItem>
          ))}
        </Timeline>
      ) : <Empty description="暂无会话记录。Agent 运行后会生成可审计版本链。" />}
    </Card>
  );
}

function ArchivesPage({ activeNovel, busy, commit }) {
  if (!activeNovel) return <EmptyNovel />;
  const initialValues = {
    scenario: activeNovel.scenario || {},
    archives: {
      premise: activeNovel.archives?.premise || "",
      background: activeNovel.archives?.background || "",
      outline: activeNovel.archives?.outline || "",
      style: activeNovel.archives?.style || "",
      charactersJson: prettyJson(activeNovel.archives?.characters || []),
      scenesJson: prettyJson(activeNovel.archives?.scenes || []),
      cluesJson: prettyJson(activeNovel.archives?.clues || [])
    }
  };

  const saveArchives = (values) => {
    const archives = {
      premise: values.archives?.premise || "",
      background: values.archives?.background || "",
      outline: values.archives?.outline || "",
      style: values.archives?.style || "",
      characters: parseJsonField(values.archives?.charactersJson, []),
      scenes: parseJsonField(values.archives?.scenesJson, []),
      clues: parseJsonField(values.archives?.cluesJson, [])
    };
    return commit("save-archives", () => api.patchNovel(activeNovel.id, { scenario: values.scenario, archives }), "档案已保存");
  };

  return (
    <div className="page-grid archive-layout">
      <section className="page-primary">
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconArchive />} title="核心设定与档案写入" />
          <Form key={activeNovel.id} layout="vertical" initialValues={initialValues} onSubmit={saveArchives}>
            <Tabs>
              <TabPane key="scenario" title="背景场景">
                <div className="form-grid two">
                  <FormItem field="scenario.background" label="背景">
                    <TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
                  </FormItem>
                  <FormItem field="scenario.plotDirection" label="剧情引导">
                    <TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
                  </FormItem>
                  <FormItem field="scenario.time" label="时间">
                    <Input />
                  </FormItem>
                  <FormItem field="scenario.place" label="地点">
                    <Input />
                  </FormItem>
                  <FormItem field="scenario.tone" label="基调">
                    <Input />
                  </FormItem>
                </div>
              </TabPane>
              <TabPane key="archives" title="文本档案">
                <div className="form-grid two">
                  <FormItem field="archives.premise" label="核心命题">
                    <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
                  </FormItem>
                  <FormItem field="archives.background" label="世界与背景">
                    <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
                  </FormItem>
                  <FormItem field="archives.outline" label="大纲">
                    <TextArea autoSize={{ minRows: 8, maxRows: 18 }} />
                  </FormItem>
                  <FormItem field="archives.style" label="文风约束">
                    <TextArea autoSize={{ minRows: 8, maxRows: 18 }} />
                  </FormItem>
                </div>
              </TabPane>
              <TabPane key="json" title="数组档案 JSON">
                <Alert type="warning" content="这里是高级编辑区。数组档案按主键浅合并，建议先由策划 Agent 检索和写入，再人工检查。" />
                <div className="form-grid three">
                  <FormItem field="archives.charactersJson" label="角色档案 JSON">
                    <TextArea autoSize={{ minRows: 12, maxRows: 28 }} />
                  </FormItem>
                  <FormItem field="archives.scenesJson" label="场景档案 JSON">
                    <TextArea autoSize={{ minRows: 12, maxRows: 28 }} />
                  </FormItem>
                  <FormItem field="archives.cluesJson" label="线索档案 JSON">
                    <TextArea autoSize={{ minRows: 12, maxRows: 28 }} />
                  </FormItem>
                </div>
              </TabPane>
            </Tabs>
            <Button type="primary" htmlType="submit" icon={<IconSave />} loading={busy === "save-archives"}>保存档案</Button>
          </Form>
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconList />} title="档案摘要" />
          <Descriptions column={1} data={[
            { label: "角色档案", value: safeArray(activeNovel.archives?.characters).length },
            { label: "场景档案", value: safeArray(activeNovel.archives?.scenes).length },
            { label: "线索档案", value: safeArray(activeNovel.archives?.clues).length },
            { label: "更新时间", value: formatDate(activeNovel.archives?.updatedAt) }
          ]} />
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconBug />} title="自检提醒" />
          <ul className="plain-list">
            <li>空值不会覆盖已有档案。</li>
            <li>角色、场景、线索建议保留稳定主键。</li>
            <li>冲突资料应先在策划页检索证据。</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function RoleplayPage({ activeNovel, providers, busy, commit }) {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [characterForm] = Form.useForm();

  if (!activeNovel) return <EmptyNovel />;

  const characters = safeArray(activeNovel.characters);
  const defaultRoleplayConfig = activeNovel.planning?.defaultRoleplayConfig || null;
  const openCharacterDrawer = (character = null) => {
    setEditingCharacter(character);
    setDrawerVisible(true);
  };

  const characterInitial = editingCharacter || {
    roleType: "major",
    name: "",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleDialog: "",
    systemPrompt: "",
    postHistoryInstructions: "",
    lorebook: "",
    tagsText: "",
    providerId: activeNovel.aiRoles?.planner?.providerId || "",
    model: activeNovel.aiRoles?.planner?.model || "",
    temperature: 0.8
  };

  const saveCharacter = (values) => {
    const payload = {
      ...values,
      tags: splitLines(values.tagsText || values.tags)
    };
    delete payload.tagsText;
    if (editingCharacter) {
      return commit(`character-save-${editingCharacter.id}`, () => api.updateCharacter(activeNovel.id, editingCharacter.id, payload), "角色卡已更新").then(() => setDrawerVisible(false));
    }
    return commit("character-create", () => api.createCharacter(activeNovel.id, payload), "角色卡已创建").then(() => setDrawerVisible(false));
  };

  const saveAiRoles = (values) => commit("save-ai-slots", () => api.patchNovel(activeNovel.id, { aiRoles: values.aiRoles }), "AI 槽位已保存");

  const importJsonCard = async (file) => {
    try {
      const text = await fileToText(file);
      const parsed = JSON.parse(text);
      await commit("import-card-json", () => api.importTavernCards(activeNovel.id, { cards: Array.isArray(parsed) ? parsed : [parsed], roleType: "major" }), "已导入酒馆角色卡 JSON");
    } catch (error) {
      showError(error);
    }
    return false;
  };

  const importPngCard = async (file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      await commit("import-card-png", () => api.importTavernCardPngs(activeNovel.id, { files: [{ name: file.name, dataUrl }], roleType: "major" }), "已导入酒馆角色卡 PNG 元数据");
    } catch (error) {
      showError(error);
    }
    return false;
  };

  const columns = [
    { title: "角色", dataIndex: "name", render: (_, record) => <Space><Tag color={record.roleType === "major" ? "green" : "orange"}>{record.roleType === "major" ? "主要" : "次要"}</Tag><Text bold>{record.name}</Text></Space> },
    { title: "模型", render: (_, record) => record.roleType === "minor" ? "由次要角色群 AI 接管" : `${providerName(providers, record.providerId)} / ${record.model || "未配置"}` },
    { title: "标签", dataIndex: "tags", render: (tags) => safeArray(tags).slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: "描述", dataIndex: "description", render: (value) => shortText(value, 80) },
    {
      title: "操作",
      render: (_, record) => (
        <Space>
          <Button icon={<IconEdit />} size="small" onClick={() => openCharacterDrawer(record)}>编辑</Button>
          <Popconfirm title="确认删除这个角色卡？" onOk={() => commit(`character-delete-${record.id}`, () => api.deleteCharacter(activeNovel.id, record.id), "角色卡已删除")}>
            <Button icon={<IconDelete />} size="small" status="danger" />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="page-grid roleplay-layout">
      <section className="page-primary">
        <Card className="work-card" bordered={false}>
          <PanelTitle
            icon={<IconUserGroup />}
            title="角色卡与 AI 扮演槽位"
            extra={(
              <Space>
                <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importJsonCard}>
                  <Button icon={<IconImport />}>导入 V2 JSON</Button>
                </Upload>
                <Upload accept=".png,image/png" showUploadList={false} beforeUpload={importPngCard}>
                  <Button icon={<IconUpload />}>导入 PNG 角色卡</Button>
                </Upload>
                <Button type="primary" icon={<IconPlus />} onClick={() => openCharacterDrawer()}>新增角色</Button>
              </Space>
            )}
          />
          <Table rowKey="id" columns={columns} data={characters} pagination={{ pageSize: 8 }} />
        </Card>
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconRobot />} title="策划、审查、导演、群演、改写 AI 槽位" />
          <Form key={`ai-${activeNovel.id}`} layout="vertical" initialValues={{ aiRoles: activeNovel.aiRoles }} onSubmit={saveAiRoles}>
            <AiSettingFields providers={providers} prefix="aiRoles" />
            <Button type="primary" htmlType="submit" icon={<IconSave />} loading={busy === "save-ai-slots"}>保存槽位</Button>
          </Form>
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconExperiment />} title="扮演配置草案" />
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Button icon={<IconThunderbolt />} loading={busy === "generate-roleplay-config"} onClick={() => commit("generate-roleplay-config", () => api.generateRoleplayConfig(activeNovel.id), "已生成扮演配置草案")} long>
              由 AI 生成配置
            </Button>
            {defaultRoleplayConfig?.config && (
              <Card className="compact-card roleplay-default-card" bordered={false}>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space wrap>
                    <Tag color="green">默认配置</Tag>
                    <Text type="secondary">{roleplayConfigSourceLabel(defaultRoleplayConfig.source)} · {formatDate(defaultRoleplayConfig.updatedAt)}</Text>
                  </Space>
                  <Paragraph>{shortText(prettyJson(defaultRoleplayConfig.config), 180)}</Paragraph>
                </Space>
              </Card>
            )}
            {safeArray(activeNovel.planning?.roleplayDrafts).slice(0, 3).map((draft) => (
              <Card key={draft.id} className="compact-card" bordered={false}>
                <Space wrap>
                  <Text type="secondary">{formatDate(draft.createdAt)}</Text>
                  {defaultRoleplayConfig?.sourceDraftId === draft.id && <Tag color="green">当前默认</Tag>}
                </Space>
                <Paragraph>{shortText(prettyJson(draft.config), 180)}</Paragraph>
                <Space>
                  <Button size="small" type="primary" onClick={() => commit(`apply-draft-${draft.id}`, () => api.applyRoleplayConfig(activeNovel.id, { draftId: draft.id, runAfter: false }), "配置已保存为默认")}>保存配置</Button>
                  <Button size="small" icon={<IconPlayArrow />} onClick={() => commit(`apply-run-${draft.id}`, () => api.applyRoleplayConfig(activeNovel.id, { draftId: draft.id, runAfter: true }), "配置已保存并启动一轮扮演")}>保存并运行</Button>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      </aside>
      <Drawer
        width={620}
        title={editingCharacter ? "编辑角色卡" : "新增角色卡"}
        visible={drawerVisible}
        footer={null}
        onCancel={() => setDrawerVisible(false)}
      >
        <WorkspaceDrawerShell
          footer={(
            <>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" icon={<IconSave />} loading={String(busy || "").startsWith("character-")} onClick={() => characterForm.submit()}>
                保存角色卡
              </Button>
            </>
          )}
        >
        <Form
          key={editingCharacter?.id || "new-character"}
          className="workspace-drawer-form"
          form={characterForm}
          layout="vertical"
          initialValues={{ ...characterInitial, tagsText: joinLines(characterInitial.tags) }}
          onSubmit={saveCharacter}
        >
          <div className="form-grid two">
            <FormItem field="name" label="角色名" rules={[{ required: true, message: "请输入角色名" }]}>
              <Input />
            </FormItem>
            <FormItem field="roleType" label="角色类型">
              <Select>
                <Option value="major">主要角色，单独 AI 扮演</Option>
                <Option value="minor">次要角色，群演 AI 扮演</Option>
              </Select>
            </FormItem>
            <FormItem field="providerId" label="主要角色提供商">
              <Select allowClear showSearch>
                {providers.map((provider) => <Option key={provider.id} value={provider.id}>{provider.name}</Option>)}
              </Select>
            </FormItem>
            <FormItem shouldUpdate noStyle>
              {(values) => (
                <FormItem field="model" label="主要角色模型">
                  <Select allowCreate allowClear showSearch>
                    {modelOptions(providers, values?.providerId).map((model) => <Option key={model} value={model}>{model}</Option>)}
                  </Select>
                </FormItem>
              )}
            </FormItem>
            <FormItem field="temperature" label="温度">
              <InputNumber min={0} max={2} step={0.05} />
            </FormItem>
            <FormItem field="tagsText" label="标签">
              <TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="一行一个标签" />
            </FormItem>
          </div>
          <FormItem field="description" label="描述">
            <TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </FormItem>
          <FormItem field="personality" label="性格">
            <TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </FormItem>
          <FormItem field="scenario" label="角色场景">
            <TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
          </FormItem>
          <FormItem field="firstMessage" label="首条消息">
            <TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
          </FormItem>
          <FormItem field="exampleDialog" label="示例对话">
            <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
          </FormItem>
          <FormItem field="systemPrompt" label="角色系统提示">
            <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
          </FormItem>
          <FormItem field="postHistoryInstructions" label="后置历史指令">
            <TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
          </FormItem>
          <FormItem field="lorebook" label="角色私有世界书文本">
            <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
          </FormItem>
        </Form>
        </WorkspaceDrawerShell>
      </Drawer>
    </div>
  );
}

function MemoryPage({ activeNovel, busy, commit }) {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingMemory, setEditingMemory] = useState(null);
  const [memoryForm] = Form.useForm();

  if (!activeNovel) return <EmptyNovel />;

  const items = safeArray(activeNovel.memory?.items);
  const memoryStats = {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    tentative: items.filter((item) => item.status === "tentative").length,
    outdated: items.filter((item) => item.status === "outdated").length,
    contradicted: items.filter((item) => item.status === "contradicted").length,
    layers: memoryLayers.map((layer) => ({ layer, count: items.filter((item) => item.layer === layer).length }))
  };

  const openMemoryDrawer = (item = null) => {
    setEditingMemory(item);
    setDrawerVisible(true);
  };

  const saveMemory = (values) => {
    const payload = {
      ...values,
      visibility: splitLines(values.visibilityText),
      evidence: splitLines(values.evidenceText)
    };
    delete payload.visibilityText;
    delete payload.evidenceText;
    if (editingMemory) {
      return commit(`memory-save-${editingMemory.id}`, () => api.updateMemory(activeNovel.id, editingMemory.id, payload), "记忆条目已更新").then(() => setDrawerVisible(false));
    }
    return commit("memory-create", () => api.createMemory(activeNovel.id, payload), "记忆条目已创建").then(() => setDrawerVisible(false));
  };

  const columns = [
    { title: "层级", dataIndex: "layer", width: 120, render: (value) => <Tag color={memoryLayerColor(value)}>{memoryLayerLabels[value] || value || "稳定事实"}</Tag> },
    { title: "范围", dataIndex: "scope", width: 110, render: (value) => <Tag color="arcoblue">{value}</Tag> },
    { title: "类别", dataIndex: "category", width: 160, render: (value) => <Tag>{value}</Tag> },
    { title: "主体", dataIndex: "subject", render: (value, record) => <Text bold>{value || record.field || "未命名"}</Text> },
    { title: "内容", dataIndex: "value", render: (value) => shortText(value, 120) },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <Badge status={value === "active" ? "success" : "warning"} text={value} /> },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<IconEdit />} onClick={() => openMemoryDrawer(record)}>编辑</Button>
          <Popconfirm title="确认删除这条记忆？" onOk={() => commit(`memory-delete-${record.id}`, () => api.deleteMemory(activeNovel.id, record.id), "记忆已删除")}>
            <Button size="small" status="danger" icon={<IconDelete />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="page-grid memory-layout">
      <section className="page-primary">
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconStorage />} title="长期记忆条目" extra={<Button type="primary" icon={<IconPlus />} onClick={() => openMemoryDrawer()}>新增记忆</Button>} />
          <Alert
            type="info"
            content="这里只维护稳定的长期记忆事实。RAG 检索配置和 Agent 权限在“Agent 设置”页；上下文包预览和资料读取记录在策划 Agent 的过程抽屉。"
          />
          <Table rowKey="id" columns={columns} data={items} pagination={{ pageSize: 10 }} />
        </Card>
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconExperiment />} title="长期记忆整理" />
          <Space direction="vertical" style={{ width: "100%" }}>
            <Button icon={<IconRefresh />} onClick={() => commit("memory-rebuild", () => api.rebuildMemory(activeNovel.id), "旧版投影记忆已清理")} long>清理投影记忆</Button>
            <Button icon={<IconExperiment />} onClick={() => commit("memory-consolidate", () => api.consolidateMemory(activeNovel.id), "记忆已合并整理")} long>AI 合并记忆</Button>
          </Space>
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconList />} title="记忆统计" />
          <Descriptions column={1} data={[
            { label: "全部", value: memoryStats.total },
            { label: "有效", value: memoryStats.active },
            { label: "暂定", value: memoryStats.tentative },
            { label: "过期", value: memoryStats.outdated },
            { label: "冲突", value: memoryStats.contradicted }
          ]} />
          <Divider />
          <Space wrap>
            {memoryStats.layers.map((item) => <Tag key={item.layer} color={memoryLayerColor(item.layer)}>{memoryLayerLabels[item.layer]} {item.count}</Tag>)}
          </Space>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSafe />} title="写入边界" />
          <ul className="plain-list">
            <li>只保存会持续影响后续行为的单条事实。</li>
            <li>整段角色卡、世界书、正文和工具输出不写进长期记忆。</li>
            <li>检索配置在“Agent 设置”页；上下文包预览只用于运行记录。</li>
          </ul>
        </Card>
      </aside>
      <Drawer width={560} title={editingMemory ? "编辑记忆" : "新增记忆"} visible={drawerVisible} footer={null} onCancel={() => setDrawerVisible(false)}>
        <WorkspaceDrawerShell
          footer={(
            <>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" icon={<IconSave />} loading={String(busy || "").startsWith("memory-")} onClick={() => memoryForm.submit()}>
                保存记忆
              </Button>
            </>
          )}
        >
        <Form
          key={editingMemory?.id || "new-memory"}
          className="workspace-drawer-form"
          form={memoryForm}
          layout="vertical"
          initialValues={{
            scope: editingMemory?.scope || "global",
            layer: editingMemory?.layer || "stable_fact",
            ownerId: editingMemory?.ownerId || "",
            category: editingMemory?.category || "scene_fact",
            subject: editingMemory?.subject || "",
            field: editingMemory?.field || "",
            value: editingMemory?.value || "",
            status: editingMemory?.status || "active",
            visibilityText: joinLines(editingMemory?.visibility || ["planner", "director", "adapter"]),
            evidenceText: joinLines(editingMemory?.evidence || [])
          }}
          onSubmit={saveMemory}
        >
          <div className="form-grid two">
            <FormItem field="layer" label="记忆层级"><Select>{memoryLayers.map((item) => <Option key={item} value={item}>{memoryLayerLabels[item]}</Option>)}</Select></FormItem>
            <FormItem field="scope" label="范围"><Select>{memoryScopes.map((item) => <Option key={item} value={item}>{item}</Option>)}</Select></FormItem>
            <FormItem field="category" label="类别"><Select>{memoryCategories.map((item) => <Option key={item} value={item}>{item}</Option>)}</Select></FormItem>
            <FormItem field="ownerId" label="归属 ID"><Input /></FormItem>
            <FormItem field="status" label="状态"><Select>{memoryStatuses.map((item) => <Option key={item} value={item}>{item}</Option>)}</Select></FormItem>
          </div>
          <FormItem field="subject" label="主体"><Input /></FormItem>
          <FormItem field="field" label="字段"><Input /></FormItem>
          <FormItem field="value" label="内容"><TextArea autoSize={{ minRows: 5, maxRows: 16 }} /></FormItem>
          <FormItem field="visibilityText" label="可见范围"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></FormItem>
          <FormItem field="evidenceText" label="证据"><TextArea autoSize={{ minRows: 3, maxRows: 8 }} /></FormItem>
        </Form>
        </WorkspaceDrawerShell>
      </Drawer>
    </div>
  );
}

function LorebookPage({ activeNovel, busy, commit }) {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [importMode, setImportMode] = useState("append");
  const [loreForm] = Form.useForm();

  if (!activeNovel) return <EmptyNovel />;

  const entries = safeArray(activeNovel.lorebook?.entries);
  const settings = activeNovel.lorebook?.settings || {};
  const triggerLogs = safeArray(activeNovel.lorebook?.triggerLogs);

  const openDrawer = (entry = null) => {
    setEditingEntry(entry);
    setDrawerVisible(true);
  };

  const saveEntry = (values) => {
    const payload = {
      ...values,
      keys: splitLines(values.keysText),
      secondaryKeys: splitLines(values.secondaryKeysText),
      overrides: splitLines(values.overridesText),
      visibility: splitLines(values.visibilityText)
    };
    delete payload.keysText;
    delete payload.secondaryKeysText;
    delete payload.overridesText;
    delete payload.visibilityText;
    if (editingEntry) {
      return commit(`lore-save-${editingEntry.id}`, () => api.updateLorebookEntry(activeNovel.id, editingEntry.id, payload), "世界书条目已更新").then(() => setDrawerVisible(false));
    }
    return commit("lore-create", () => api.createLorebookEntry(activeNovel.id, payload), "世界书条目已创建").then(() => setDrawerVisible(false));
  };

  const importLorebook = async (file) => {
    try {
      const text = await fileToText(file);
      const lorebook = JSON.parse(text);
      await commit("lore-import", () => api.importLorebook(activeNovel.id, { lorebook, mode: importMode }), "世界书已导入");
    } catch (error) {
      showError(error);
    }
    return false;
  };

  const exportLorebook = async () => {
    const result = await commit("lore-export", () => api.exportLorebook(activeNovel.id), "");
    if (result?.lorebook) {
      downloadJson(`${activeNovel.title}-SillyTavern-世界书.json`, result.lorebook);
      notify("success", "已导出世界书 JSON");
    }
  };

  const columns = [
    { title: "启用", dataIndex: "enabled", width: 80, render: (value) => <Badge status={value ? "success" : "default"} text={value ? "启用" : "停用"} /> },
    { title: "条目", dataIndex: "name", render: (value, record) => <Space direction="vertical" size={2}><Text bold>{value || "未命名条目"}</Text><Text type="secondary">{shortText(record.content, 90)}</Text></Space> },
    { title: "触发词", dataIndex: "keys", render: (keys) => safeArray(keys).slice(0, 5).map((key) => <Tag key={key}>{key}</Tag>) },
    { title: "位置", dataIndex: "position", width: 130, render: (value) => <Tag color="arcoblue">{value}</Tag> },
    { title: "优先级", dataIndex: "priority", width: 90 },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<IconEdit />} onClick={() => openDrawer(record)}>编辑</Button>
          <Popconfirm title="确认删除这条世界书？" onOk={() => commit(`lore-delete-${record.id}`, () => api.deleteLorebookEntry(activeNovel.id, record.id), "世界书条目已删除")}>
            <Button size="small" status="danger" icon={<IconDelete />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="page-grid lore-layout">
      <section className="page-primary">
        <Card className="work-card" bordered={false}>
          <PanelTitle
            icon={<IconBook />}
            title="World Info / Lorebook 独立编辑器"
            extra={(
              <Space wrap>
                <Select size="small" value={importMode} onChange={setImportMode} style={{ width: 120 }}>
                  <Option value="append">追加导入</Option>
                  <Option value="replace">替换导入</Option>
                </Select>
                <Upload accept=".json,application/json" showUploadList={false} beforeUpload={importLorebook}>
                  <Button icon={<IconImport />}>导入世界书</Button>
                </Upload>
                <Button icon={<IconUpload />} onClick={exportLorebook} loading={busy === "lore-export"}>导出</Button>
                <Button type="primary" icon={<IconPlus />} onClick={() => openDrawer()}>新增条目</Button>
              </Space>
            )}
          />
          <Table rowKey="id" columns={columns} data={entries} pagination={{ pageSize: 12 }} />
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSearch />} title="触发设置" />
          <Form key={`lore-settings-${activeNovel.id}`} layout="vertical" initialValues={settings} onSubmit={(values) => commit("lore-settings", () => api.updateLorebookSettings(activeNovel.id, values), "世界书设置已保存")}>
            <FormItem field="scanDepth" label="扫描深度"><InputNumber min={1} max={20} /></FormItem>
            <FormItem field="maxTriggeredEntries" label="最大触发条目"><InputNumber min={1} max={30} /></FormItem>
            <FormItem field="maxCharsPerEntry" label="单条字符预算"><InputNumber min={80} max={4000} step={100} /></FormItem>
            <FormItem field="triggerLogLimit" label="触发日志保留"><InputNumber min={10} max={500} /></FormItem>
            <FormItem field="recursiveScanning" label="递归扫描" triggerPropName="checked"><Switch /></FormItem>
            <Button type="primary" htmlType="submit" icon={<IconSave />} loading={busy === "lore-settings"} long>保存设置</Button>
          </Form>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSafe />} title="酒馆式上下文" />
          <Paragraph type="secondary">角色扮演阶段会优先按触发词、角色可见范围、位置和预算注入世界书；这和策划 AI 的项目级 RAG 检索是两套不同入口。</Paragraph>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconHistory />} title="最近触发日志" />
          {triggerLogs.length ? (
            <Timeline>
              {triggerLogs.slice(-8).reverse().map((log) => (
                <TimelineItem key={log.id} label={`第 ${log.turnIndex || "-"} 轮`}>
                  <Text bold>{log.name || log.entryId}</Text>
                  <Space wrap size={4}>
                    <Tag color="arcoblue">{log.task || "task"}</Tag>
                    {safeArray(log.matchDetail?.primary?.matches).slice(0, 3).map((item) => <Tag key={`${log.id}-${item.key}-${item.index}`}>{item.key}@{item.index}</Tag>)}
                    {safeArray(log.diagnostics).filter((item) => item.severity !== "low").slice(0, 2).map((item) => <Tag key={`${log.id}-${item.code}`} color="orange">{item.code}</Tag>)}
                  </Space>
                  <Paragraph type="secondary">{shortText(log.reason || safeArray(log.matchedKeys).join("、"), 90)}</Paragraph>
                </TimelineItem>
              ))}
            </Timeline>
          ) : <Empty description="暂无触发日志" />}
        </Card>
      </aside>
      <Drawer width={640} title={editingEntry ? "编辑世界书条目" : "新增世界书条目"} visible={drawerVisible} footer={null} onCancel={() => setDrawerVisible(false)}>
        <WorkspaceDrawerShell
          footer={(
            <>
              <Button onClick={() => setDrawerVisible(false)}>取消</Button>
              <Button type="primary" icon={<IconSave />} loading={String(busy || "").startsWith("lore-")} onClick={() => loreForm.submit()}>
                保存条目
              </Button>
            </>
          )}
        >
        <Form
          key={editingEntry?.id || "new-lore"}
          className="workspace-drawer-form"
          form={loreForm}
          layout="vertical"
          initialValues={{
            name: editingEntry?.name || "",
            enabled: editingEntry?.enabled ?? true,
            scope: editingEntry?.scope || "global",
            ownerId: editingEntry?.ownerId || "",
            keysText: joinLines(editingEntry?.keys || []),
            secondaryKeysText: joinLines(editingEntry?.secondaryKeys || []),
            content: editingEntry?.content || "",
            position: editingEntry?.position || "after_character",
            priority: editingEntry?.priority || 0,
            tokenBudget: editingEntry?.tokenBudget || 600,
            cooldownTurns: editingEntry?.cooldownTurns || 0,
            exclusiveGroup: editingEntry?.exclusiveGroup || "",
            overridesText: joinLines(editingEntry?.overrides || []),
            expiresAt: editingEntry?.expiresAt || "",
            matchMode: editingEntry?.matchMode || "any",
            caseSensitive: editingEntry?.caseSensitive || false,
            visibilityText: joinLines(editingEntry?.visibility || ["planner", "director", "adapter", "minor", "character:*"])
          }}
          onSubmit={saveEntry}
        >
          <div className="form-grid two">
            <FormItem field="name" label="条目名" rules={[{ required: true, message: "请输入条目名" }]}><Input /></FormItem>
            <FormItem field="enabled" label="启用" triggerPropName="checked"><Switch /></FormItem>
            <FormItem field="scope" label="范围"><Select><Option value="global">global</Option><Option value="character">character</Option><Option value="scene">scene</Option><Option value="private">private</Option></Select></FormItem>
            <FormItem field="ownerId" label="归属 ID"><Input /></FormItem>
            <FormItem field="position" label="注入位置"><Select><Option value="before_character">before_character</Option><Option value="after_character">after_character</Option><Option value="before_memory">before_memory</Option><Option value="after_memory">after_memory</Option></Select></FormItem>
            <FormItem field="matchMode" label="匹配模式"><Select><Option value="any">any</Option><Option value="all">all</Option><Option value="regex">regex</Option><Option value="always">always</Option></Select></FormItem>
            <FormItem field="priority" label="优先级"><InputNumber min={-1000} max={1000} /></FormItem>
            <FormItem field="tokenBudget" label="预算"><InputNumber min={80} max={4000} /></FormItem>
            <FormItem field="cooldownTurns" label="冷却轮次"><InputNumber min={0} max={100} /></FormItem>
            <FormItem field="caseSensitive" label="区分大小写" triggerPropName="checked"><Switch /></FormItem>
            <FormItem field="exclusiveGroup" label="互斥组"><Input /></FormItem>
            <FormItem field="expiresAt" label="过期时间"><Input placeholder="ISO 时间，可留空" /></FormItem>
          </div>
          <FormItem field="keysText" label="主触发词"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></FormItem>
          <FormItem field="secondaryKeysText" label="次触发词"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></FormItem>
          <FormItem field="overridesText" label="覆盖条目 ID"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></FormItem>
          <FormItem field="visibilityText" label="可见范围"><TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></FormItem>
          <FormItem field="content" label="正文"><TextArea autoSize={{ minRows: 8, maxRows: 24 }} /></FormItem>
        </Form>
        </WorkspaceDrawerShell>
      </Drawer>
    </div>
  );
}

function WritingPage({ activeNovel, busy, commit }) {
  const [intent, setIntent] = useState("");
  const [editingProse, setEditingProse] = useState(null);
  const [proseTree, setProseTree] = useState(null);
  const [proseDiff, setProseDiff] = useState(null);
  const [qualityGate, setQualityGate] = useState(null);
  const [qualityExecutor, setQualityExecutor] = useState(null);
  const [ragQuality, setRagQuality] = useState(null);
  const [ragBenchmark, setRagBenchmark] = useState(null);
  const [proseRevertTarget, setProseRevertTarget] = useState(null);
  const [qualityFixConfirmVisible, setQualityFixConfirmVisible] = useState(false);
  const [proseForm] = Form.useForm();

  if (!activeNovel) return <EmptyNovel />;

  const turns = safeArray(activeNovel.session?.turns);
  const proseParts = safeArray(activeNovel.session?.proseParts);
  const reviews = safeArray(activeNovel.session?.reviews);
  const lastTurn = turns[turns.length - 1];
  const workflows = safeArray(activeNovel.session?.chapterWorkflows);
  const workflow = workflows.find((item) => item.id === activeNovel.session?.prewritePlan?.workflowId) || workflows[workflows.length - 1] || null;
  const workflowTurns = workflow?.mode === "normal_prose"
    ? turns.filter((turn) => workflow?.turnIds?.includes(turn.id))
    : workflow?.turnIds?.length ? turns.filter((turn) => workflow.turnIds.includes(turn.id)) : turns.slice(-3);
  const workflowProse = workflow?.proseIds?.length ? proseParts.filter((part) => workflow.proseIds.includes(part.id)) : proseParts.slice(-4);
  const workflowReviews = workflow?.reviewIds?.length ? reviews.filter((review) => workflow.reviewIds.includes(review.id)) : reviews.slice(0, 8);
  const latestContextAudit = workflow?.contextAudits?.[workflow.contextAudits.length - 1] || [...turns].reverse().find((turn) => turn.contextAudit)?.contextAudit || null;
  const prewritePlan = activeNovel.session?.prewritePlan || null;
  const modelStrategy = buildClientModelStrategy(activeNovel);
  const revisionLearnings = safeArray(activeNovel.planning?.revisionLearnings);
  const currentStep = chapterWorkflowCurrentStep(workflow, prewritePlan, workflowTurns, workflowProse);
  const acceptedDraft = [...workflowProse, ...proseParts].reverse().find((part, index, list) => part.status === "accepted" && list.findIndex((item) => item.id === part.id) === index);

  const saveProse = (values) => commit(`prose-save-${editingProse.id}`, () => api.updateProse(activeNovel.id, editingProse.id, values.text), "正文已保存").then(() => setEditingProse(null));
  const loadProseTree = () => commit("prose-version-tree", () => api.proseVersionTree(activeNovel.id), "正文版本树已刷新").then((result) => {
    if (result?.tree) setProseTree(result.tree);
  });
  const inspectProseDiff = (record) => commit(`prose-diff-${record.id}`, () => api.proseDiff(activeNovel.id, record.id, { from: record.baseProseId || "" }), "正文 diff 已生成").then((result) => {
    if (result?.diff) setProseDiff(result.diff);
  });
  const revertProseVersion = (record) => {
    setProseRevertTarget(record || null);
  };
  const submitProseRevert = async () => {
    if (!proseRevertTarget?.id) return false;
    const latest = safeArray(proseRevertTarget.versionHistory).slice(-1)[0];
    const result = await commit(`prose-revert-${proseRevertTarget.id}`, () => api.revertProse(activeNovel.id, proseRevertTarget.id, { targetVersionId: latest?.parentVersionId || "" }), "正文已回滚为新草稿");
    if (!result) return false;
    setProseRevertTarget(null);
    loadProseTree();
    return true;
  };
  const runQualityGate = () => commit("quality-gate", () => api.qualityGate(activeNovel.id, { scope: "all" }), "小说验收链已运行").then((result) => {
    if (result?.gate) setQualityGate(result.gate);
    if (result?.executor) setQualityExecutor(result.executor);
  });
  const previewQualityFixes = () => commit("quality-gate-preview", () => api.qualityGate(activeNovel.id, { scope: "all", mode: "preview_fix" }), "验收链修复预览已生成").then((result) => {
    if (result?.gate) setQualityGate(result.gate);
    if (result?.executor) setQualityExecutor(result.executor);
  });
  const applyQualitySafeFixes = () => {
    setQualityFixConfirmVisible(true);
  };
  const submitQualitySafeFixes = async () => {
    const result = await commit("quality-gate-apply", () => api.qualityGate(activeNovel.id, { scope: "all", mode: "apply_safe_fixes" }), "低风险修复已应用并复检");
    if (!result) return false;
    if (result?.gate) setQualityGate(result.gate);
    if (result?.executor) setQualityExecutor(result.executor);
    setQualityFixConfirmVisible(false);
    return true;
  };
  const loadRagQuality = () => commit("rag-quality", () => api.ragQuality(activeNovel.id), "RAG 质量指标已刷新").then((result) => {
    if (result?.quality) setRagQuality(result.quality);
    if (result?.benchmark) setRagBenchmark(result.benchmark);
  });
  const runRagBenchmark = () => commit("rag-benchmark", () => api.ragBenchmark(activeNovel.id, { limit: 80 }), "小说域 RAG 测试集已运行").then((result) => {
    if (result?.benchmark) setRagBenchmark(result.benchmark);
  });
  const runRoleplayWorkflow = () => commit("chapter-workflow-run", () => api.runChapterWorkflow(activeNovel.id, {
    intent,
    chapterLabel: prewritePlan?.chapterLabel || workflow?.chapterLabel || "当前章节",
    workflowId: workflow?.id || "",
    steps: ["prewrite", "roleplay", "review", "adapt"],
    forceNew: !workflow
  }), "扮演行文已运行到正文草稿");
  const runNormalWorkflow = () => commit("normal-writing-workflow-run", () => api.runNormalWritingWorkflow(activeNovel.id, {
    intent,
    chapterLabel: prewritePlan?.chapterLabel || workflow?.chapterLabel || "当前章节",
    workflowId: workflow?.mode === "normal_prose" ? workflow.id : "",
    steps: ["prewrite", "draft", "review"],
    forceNew: workflow?.mode !== "normal_prose"
  }), "正常行文已生成正文草稿并完成审查");
  const postwrite = (record) => commit(`postwrite-${record.id}`, () => api.postwriteProse(activeNovel.id, record.id, { reason: "人工触发写后回写" }), "写后回写已完成");

  const turnColumns = [
    { title: "轮次", dataIndex: "index", width: 90, render: (value) => <Tag color="green">第 {value} 轮</Tag> },
    { title: "导演", render: (_, record) => shortText(record.guide?.parsed?.scene_goal || record.guide?.parsed?.director_note || record.guide?.text || "", 120) },
    { title: "上下文", width: 150, render: (_, record) => <ContextAuditMini audit={record.contextAudit} /> },
    { title: "导演控制", width: 130, render: (_, record) => <DirectorAuditTag audit={record.directorControlAudit} /> },
    { title: "Transcript", width: 150, render: (_, record) => <Tag color={record.transcript?.actors?.length ? "green" : "gray"}>{record.transcript?.actors?.length || 0} 角色审计</Tag> },
    { title: "角色输出", width: 110, render: (_, record) => `${safeArray(record.performances).length} 条` },
    {
      title: "单角色重跑",
      width: 190,
      render: (_, record) => (
        <Select size="small" placeholder="选择角色" onChange={(characterId) => commit(`rerun-${record.id}-${characterId}`, () => api.rerunTurnCharacter(activeNovel.id, record.id, characterId), "已重跑单角色")}>
          {activeNovel.characters.filter((character) => character.roleType === "major").map((character) => <Option key={character.id} value={character.id}>{character.name}</Option>)}
        </Select>
      )
    }
  ];

  const proseColumns = [
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <Tag color={value === "accepted" ? "green" : value === "discarded" ? "red" : "orange"}>{value}</Tag> },
    { title: "版本", width: 120, render: (_, record) => <Space size={4} wrap><Tag color="purple">{record.versionType || "draft"}</Tag>{record.baseProseId && <Tag color="arcoblue">分支</Tag>}</Space> },
    { title: "来源", width: 120, render: (_, record) => <Tag color={proseSourceTone(record)}>{proseSourceLabel(record)}</Tag> },
    { title: "回写", width: 110, render: (_, record) => <Tag color={record.postwriteBack?.status === "completed" ? "green" : record.postwriteBack?.status === "failed" ? "red" : "gray"}>{record.postwriteBack?.status || "pending"}</Tag> },
    { title: "轮次范围", dataIndex: "turnRange", width: 120, render: (value) => safeArray(value).join(" - ") },
    { title: "段落组", width: 100, render: (_, record) => <Tag color={safeArray(record.paragraphGroups).length ? "green" : "gray"}>{safeArray(record.paragraphGroups).length}</Tag> },
    { title: "正文", dataIndex: "text", render: (value) => shortText(value, 140) },
    {
      title: "操作",
      width: 430,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<IconEdit />} onClick={() => setEditingProse(record)}>编辑</Button>
          <Button size="small" icon={<IconBranch />} loading={busy === `prose-diff-${record.id}`} onClick={() => inspectProseDiff(record)}>diff</Button>
          <Button size="small" icon={<IconUndo />} disabled={safeArray(record.versionHistory).length <= 1} loading={busy === `prose-revert-${record.id}`} onClick={() => revertProseVersion(record)}>回滚</Button>
          <Button size="small" type="primary" onClick={() => commit(`accept-${record.id}`, () => api.acceptProse(activeNovel.id, record.id), "正文已采纳")}>采纳</Button>
          <Button size="small" disabled={record.status !== "accepted"} loading={busy === `postwrite-${record.id}`} onClick={() => postwrite(record)}>回写</Button>
          <Button size="small" status="danger" onClick={() => commit(`discard-${record.id}`, () => api.discardProse(activeNovel.id, record.id), "正文已废弃")}>废弃</Button>
        </Space>
      )
    }
  ];

  return (
    <div className="page-grid writing-layout">
      <section className="page-primary">
        <Card className="work-card chapter-workflow-card" bordered={false}>
          <PanelTitle
            icon={<IconPen />}
            title="章节工作流"
            extra={workflow ? <Space size={6}><Tag color={chapterWorkflowModeColor(workflow.mode)}>{chapterWorkflowModeLabel(workflow.mode)}</Tag><Tag color={workflow.status === "completed" ? "green" : "arcoblue"}>{workflow.status}</Tag></Space> : <Tag>未建立</Tag>}
          />
          <div className="pipeline-strip">
            <MetricCard title="当前轮次" value={activeNovel.session?.turnIndex || 0} icon={<IconThunderbolt />} tone="green" />
            <MetricCard title="正文草稿" value={proseParts.length} icon={<IconFile />} tone="blue" />
            <MetricCard title="审查记录" value={reviews.length} icon={<IconBug />} tone="amber" />
          </div>
          <div className="chapter-stepper">
            {workflow?.mode === "normal_prose" ? (
              <Steps current={currentStep} size="small">
                <Steps.Step title="写前定位" description={workflow?.steps?.prewrite?.status || "pending"} />
                <Steps.Step title="上下文" description={workflow?.steps?.context?.status || "pending"} />
                <Steps.Step title="正文草稿" description={workflow?.steps?.adapt?.status || "pending"} />
                <Steps.Step title="正文审查" description={workflow?.steps?.review?.status || "pending"} />
                <Steps.Step title="回写" description={workflow?.steps?.postwrite?.status || "pending"} />
              </Steps>
            ) : (
              <Steps current={currentStep} size="small">
                <Steps.Step title="写前定位" description={workflow?.steps?.prewrite?.status || "pending"} />
                <Steps.Step title="上下文" description={workflow?.steps?.context?.status || "pending"} />
                <Steps.Step title="扮演" description={workflow?.steps?.roleplay?.status || "pending"} />
                <Steps.Step title="审查" description={workflow?.steps?.review?.status || "pending"} />
                <Steps.Step title="正文草稿" description={workflow?.steps?.adapt?.status || "pending"} />
                <Steps.Step title="回写" description={workflow?.steps?.postwrite?.status || "pending"} />
              </Steps>
            )}
          </div>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Input value={intent} onChange={setIntent} placeholder="写前定位意图，例如：为第一章开场生成导演定位" />
            <Space wrap>
              <Button type="primary" icon={<IconPlayArrow />} loading={busy === "normal-writing-workflow-run"} onClick={runNormalWorkflow}>正常行文生成草稿</Button>
              <Button icon={<IconPlayArrow />} loading={busy === "chapter-workflow-run"} onClick={runRoleplayWorkflow}>扮演行文生成草稿</Button>
              <Button icon={<IconMindMapping />} loading={busy === "prewrite"} onClick={() => commit("prewrite", () => api.prewritePlan(activeNovel.id, { intent, workflowId: workflow?.id || "", mode: workflow?.mode || "roleplay_prose" }), "写前定位已生成")}>生成写前定位</Button>
              <Button type="primary" icon={<IconPlayArrow />} loading={busy === "run-turn"} onClick={() => commit("run-turn", () => api.runTurn(activeNovel.id), "已完成一轮扮演")}>启动一轮扮演</Button>
              <Button icon={<IconPen />} loading={busy === "adapt"} onClick={() => commit("adapt", () => api.adapt(activeNovel.id), "已改写为正文草稿")}>改写最近扮演</Button>
              <Button icon={<IconBug />} disabled={!lastTurn} loading={busy === "review"} onClick={() => commit("review", () => api.review(activeNovel.id, { targetType: "turn", targetId: lastTurn?.id, reason: "人工触发一致性审查" }), "审查链已完成")}>审查最近轮次</Button>
              <Button icon={<IconStorage />} disabled={!acceptedDraft} loading={acceptedDraft ? busy === `postwrite-${acceptedDraft.id}` : false} onClick={() => acceptedDraft && postwrite(acceptedDraft)}>回写已采纳正文</Button>
              <Popconfirm title="确认清空当前扮演会话？正文草稿、轮次和审查会被重置。" onOk={() => commit("reset-session", () => api.resetSession(activeNovel.id), "会话已重置")}>
                <Button status="danger" icon={<IconDelete />}>重置会话</Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>
        <Card className="work-card" bordered={false}>
          <PanelTitle icon={<IconMindMapping />} title="写前定位执行稿" />
          {prewritePlan ? <PrewritePlanPanel plan={prewritePlan} /> : <Empty description="暂无写前定位" />}
        </Card>
        <Card className="work-card" bordered={false}>
          <Tabs>
            <TabPane key="turns" title="扮演记录">
              <Table rowKey="id" columns={turnColumns} data={workflowTurns} pagination={{ pageSize: 6 }} />
            </TabPane>
            <TabPane key="prose" title="正文版本">
              <Space wrap style={{ marginBottom: 10 }}>
                <Button size="small" icon={<IconBranch />} loading={busy === "prose-version-tree"} onClick={loadProseTree}>刷新版本树</Button>
                <Button size="small" icon={<IconBug />} loading={busy === "quality-gate"} onClick={runQualityGate}>运行验收链</Button>
                <Button size="small" icon={<IconExperiment />} loading={busy === "quality-gate-preview"} onClick={previewQualityFixes}>修复预览</Button>
                <Button size="small" icon={<IconSafe />} loading={busy === "quality-gate-apply"} onClick={applyQualitySafeFixes}>应用低风险修复</Button>
                <Button size="small" icon={<IconSearch />} loading={busy === "rag-quality"} onClick={loadRagQuality}>RAG 质量</Button>
                <Button size="small" icon={<IconExperiment />} loading={busy === "rag-benchmark"} onClick={runRagBenchmark}>RAG 测试集</Button>
              </Space>
              <Table rowKey="id" columns={proseColumns} data={workflowProse} pagination={{ pageSize: 6 }} />
              <ProseVersionTreePanel tree={proseTree} diff={proseDiff} qualityGate={qualityGate || activeNovel.session?.qualityGate} qualityExecutor={qualityExecutor || activeNovel.session?.qualityGate?.executor} ragQuality={ragQuality} ragBenchmark={ragBenchmark || activeNovel.session?.ragBenchmark} />
            </TabPane>
            <TabPane key="audit" title="上下文审计">
              <ContextAuditPanel audit={latestContextAudit} />
            </TabPane>
            <TabPane key="transcript" title="Transcript">
              <TranscriptPanel turns={workflowTurns} />
            </TabPane>
            <TabPane key="paragraphs" title="段落组改写">
              <ParagraphGroupsPanel proseParts={workflowProse} />
            </TabPane>
            <TabPane key="models" title="模型策略">
              <ModelStrategyPanel strategy={modelStrategy} />
            </TabPane>
            <TabPane key="revision" title="改稿学习">
              <RevisionLearningPanel learnings={revisionLearnings} activeNovel={activeNovel} commit={commit} />
            </TabPane>
          </Tabs>
        </Card>
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconDashboard />} title="章节状态" />
          {workflow ? (
            <Descriptions column={1} data={[
              { label: "行文方式", value: chapterWorkflowModeLabel(workflow.mode) },
              { label: "章节", value: workflow.chapterLabel },
              { label: "意图", value: shortText(workflow.intent || prewritePlan?.sourceIntent, 140) },
              { label: "写前定位", value: workflow.prewritePlanId || "未生成" },
              { label: "扮演轮次", value: workflow.turnIds?.length || 0 },
              { label: "正文版本", value: workflow.proseIds?.length || 0 },
              { label: "写后回写", value: workflow.writeBack?.summary || workflow.writeBack?.status || "pending" }
            ]} />
          ) : <Empty description="暂无章节工作流" />}
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSearch />} title="角色上下文" />
          <ContextAuditSummary audit={latestContextAudit} />
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconBug />} title="最近检查" />
          {workflowReviews.length ? (
            <div className="codex-review-list">
              {workflowReviews.slice(0, 6).map((review) => (
                <div key={review.id} className="codex-review-row">
                  <Tag color={review.severity === "ok" ? "green" : "orange"}>{review.severity}</Tag>
                  <Text>{shortText(review.summary, 120)}</Text>
                  <Text type="secondary">{formatDate(review.createdAt)}</Text>
                </div>
              ))}
            </div>
          ) : <Empty description="暂无审查记录" />}
        </Card>
      </aside>
      <Drawer width={720} visible={Boolean(editingProse)} title="编辑正文版本" footer={null} onCancel={() => setEditingProse(null)}>
        <WorkspaceDrawerShell
          footer={(
            <>
              <Button onClick={() => setEditingProse(null)}>取消</Button>
              <Button
                type="primary"
                icon={<IconSave />}
                disabled={!editingProse}
                loading={editingProse ? busy === `prose-save-${editingProse.id}` : false}
                onClick={() => proseForm.submit()}
              >
                保存正文
              </Button>
            </>
          )}
        >
          {editingProse && (
            <Form
              key={editingProse.id}
              className="workspace-drawer-form"
              form={proseForm}
              layout="vertical"
              initialValues={{ text: editingProse.text }}
              onSubmit={saveProse}
            >
              <FormItem field="text" label="正文">
                <TextArea autoSize={{ minRows: 18, maxRows: 36 }} />
              </FormItem>
            </Form>
          )}
        </WorkspaceDrawerShell>
      </Drawer>
      <Modal
        title="回滚正文版本"
        visible={Boolean(proseRevertTarget)}
        okText="回滚"
        cancelText="取消"
        confirmLoading={proseRevertTarget ? busy === `prose-revert-${proseRevertTarget.id}` : false}
        okButtonProps={{ status: "warning" }}
        onOk={submitProseRevert}
        onCancel={() => setProseRevertTarget(null)}
      >
        <Alert type="warning" content="这会把该正文恢复为草稿并新增一个回滚版本事件，不会删除旧记录。" />
      </Modal>
      <Modal
        title="应用低风险修复"
        visible={qualityFixConfirmVisible}
        okText="应用并复检"
        cancelText="取消"
        confirmLoading={busy === "quality-gate-apply"}
        onOk={submitQualitySafeFixes}
        onCancel={() => setQualityFixConfirmVisible(false)}
      >
        <Alert type="warning" content="只会应用验收链标记为低风险的机械修复；高风险问题仍会保留给 Agent 或人工确认。" />
      </Modal>
    </div>
  );
}

function chapterWorkflowModeLabel(mode) {
  return String(mode || "") === "normal_prose" ? "正常行文" : "扮演行文";
}

function chapterWorkflowModeColor(mode) {
  return String(mode || "") === "normal_prose" ? "arcoblue" : "purple";
}

function proseSourceLabel(record) {
  const source = String(record?.raw?.source || "");
  const mode = String(record?.adaptationPlan?.mode || "");
  if (source === "normal_writing_workflow" || mode.startsWith("normal_prose")) return "正常行文";
  if (safeArray(record?.adaptationPlan?.sourceTurnIds).length || safeArray(record?.turnRange).length) return "扮演改写";
  if (record?.raw?.source === "planning_skill") return "策划写入";
  return "正文草稿";
}

function proseSourceTone(record) {
  const label = proseSourceLabel(record);
  if (label === "正常行文") return "arcoblue";
  if (label === "扮演改写") return "purple";
  if (label === "策划写入") return "green";
  return "gray";
}

function chapterWorkflowCurrentStep(workflow, prewritePlan, turns, proseParts) {
  if (!workflow && !prewritePlan) return 0;
  const steps = workflow?.steps || {};
  const isNormalWriting = workflow?.mode === "normal_prose";
  const order = isNormalWriting ? ["prewrite", "context", "adapt", "review", "postwrite"] : ["prewrite", "context", "roleplay", "review", "adapt", "postwrite"];
  const firstPending = order.findIndex((key) => !["completed", "warning"].includes(steps[key]?.status));
  if (firstPending >= 0) return firstPending;
  if (safeArray(proseParts).some((part) => part.status === "accepted" && part.postwriteBack?.status !== "completed")) return isNormalWriting ? 4 : 5;
  if (safeArray(proseParts).length > 0) return isNormalWriting ? 2 : 4;
  if (safeArray(turns).length > 0) return 3;
  return prewritePlan ? 1 : 0;
}

function ProseVersionTreePanel({ tree, diff, qualityGate, qualityExecutor, ragQuality, ragBenchmark }) {
  const nodes = safeArray(tree?.nodes);
  const gate = qualityGate || null;
  const executor = qualityExecutor || gate?.executor || null;
  const rag = ragQuality || null;
  const benchmark = ragBenchmark || rag?.benchmark || null;
  if (!nodes.length && !diff && !gate && !rag && !benchmark) return null;
  const status = gate?.status || rag?.status || benchmark?.status || (diff?.changed ? "changed" : nodes.length ? "ready" : "idle");
  const statusColor = status === "passed" || status === "ready" ? "green" : status === "blocked" || status === "failed" ? "red" : "orange";
  const summary = gate?.summary
    || benchmark?.summary
    || (rag ? `RAG 质量 ${rag.score ?? "-"}，触发准确率 ${Math.round((rag.metrics?.lorebookTriggerPrecision || 0) * 100)}%` : "")
    || (diff ? (diff.changed ? "正文版本存在差异" : "正文版本没有变化") : "")
    || `已记录 ${nodes.length} 个正文版本节点`;
  return (
    <div className="prose-quality-grid codex-review-panel">
      <div className="codex-review-strip">
        <Tag color={statusColor}>{status}</Tag>
        <Text>{shortText(summary, 180)}</Text>
        <Space size={4} wrap>
          {gate && <Tag color={gate.blockingCount ? "red" : "green"}>验收 {gate.blockingCount || 0} 阻断</Tag>}
          {nodes.length > 0 && <Tag color="purple">版本 {tree.stats?.total || nodes.length}</Tag>}
          {rag && <Tag color="arcoblue">RAG {rag.score ?? "-"}</Tag>}
          {benchmark && <Tag color="orange">测试集 {benchmark.score ?? "-"}</Tag>}
        </Space>
      </div>
      <Collapse className="agent-inline-collapse codex-disclosure-collapse" bordered={false} defaultActiveKey={[]}>
        <Collapse.Item name="writing-checks" header={<PlanningDisclosureHeader label="查看检查详情" meta="版本 / 验收链 / RAG" />}>
          <div className="prose-quality-detail">
            {nodes.length > 0 && (
              <section className="prose-quality-section">
                <Space wrap>
                  <Tag color="purple">版本 {tree.stats?.total || nodes.length}</Tag>
                  <Tag color="green">采纳 {tree.stats?.accepted || 0}</Tag>
                  <Tag color="orange">草稿 {tree.stats?.drafts || 0}</Tag>
                  <Tag color="arcoblue">分支 {tree.stats?.branched || 0}</Tag>
                </Space>
                <div className="prose-version-node-list">
                  {nodes.slice(0, 8).map((node) => (
                    <div key={node.id} className="prose-version-node">
                      <Space wrap size={6}>
                        <Tag color={node.status === "accepted" ? "green" : node.status === "discarded" ? "red" : "orange"}>{node.status}</Tag>
                        <Tag color="purple">{node.versionType}</Tag>
                        {node.parentId && <Tag color="arcoblue">基于 {shortText(node.parentId, 18)}</Tag>}
                      </Space>
                      <Paragraph>{node.preview}</Paragraph>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {diff && (
              <section className="prose-quality-section">
                <Space wrap><Tag color={diff.changed ? "orange" : "green"}>{diff.changed ? "有变化" : "无变化"}</Tag><Text type="secondary">{diff.fromLabel}{" -> "}{diff.toLabel}</Text></Space>
                <pre className="agent-diff-block">{diff.diff}</pre>
              </section>
            )}
            {gate && (
              <section className="prose-quality-section">
                <Space wrap>
                  <Tag color={gate.status === "passed" ? "green" : gate.status === "blocked" ? "red" : "orange"}>{gate.status}</Tag>
                  <Tag color="red">阻断 {gate.blockingCount || 0}</Tag>
                  <Tag color="orange">警告 {gate.warningCount || 0}</Tag>
                </Space>
                <Paragraph>{gate.summary}</Paragraph>
                {gate.acceptanceChain && (
                  <div className="quality-chain-strip">
                    {safeArray(gate.acceptanceChain.steps).map((step) => (
                      <Tag key={step.id} color={step.status === "completed" || step.status === "ready" ? "green" : step.status === "manual_required" ? "orange" : "gray"}>
                        {step.label} {step.fixCount || step.issueCount || ""}
                      </Tag>
                    ))}
                  </div>
                )}
                {executor && (
                  <Alert
                    className="quality-executor-alert"
                    type={executor.status === "passed" ? "success" : executor.status === "preview_ready" ? "info" : "warning"}
                    content={`${executor.summary || ""} 低风险 ${executor.plan?.safeFixes?.length ?? executor.safeFixCount ?? 0}，需确认 ${executor.plan?.manualFixes?.length ?? executor.manualFixCount ?? 0}。`}
                  />
                )}
                {safeArray(gate.issues).slice(0, 6).map((issue) => (
                  <div key={issue.id} className="codex-review-row">
                    <Tag color={issue.blocking ? "red" : "orange"}>{issue.scope}</Tag>
                    <Text>{shortText(issue.title || issue.message, 120)}</Text>
                    <Text type="secondary">{issue.repairToolHint || ""}</Text>
                  </div>
                ))}
              </section>
            )}
            {rag && (
              <section className="prose-quality-section">
          <Space wrap>
            <Tag color={rag.status === "passed" ? "green" : rag.status === "blocked" ? "red" : "orange"}>RAG {rag.score}</Tag>
            <Tag color="arcoblue">触发 {Math.round((rag.metrics?.lorebookTriggerPrecision || 0) * 100)}%</Tag>
            <Tag color="red">泄漏 {Math.round((rag.metrics?.roleVisibilityLeakRate || 0) * 100)}%</Tag>
          </Space>
          {safeArray(rag.findings).slice(0, 6).map((finding, index) => (
            <div key={`${finding.type}-${index}`} className="codex-review-row">
              <Tag color={finding.severity === "high" ? "red" : "orange"}>{finding.type}</Tag>
              <Text>{shortText(finding.title, 120)}</Text>
              <Text type="secondary">{shortText(finding.suggestion, 120)}</Text>
            </div>
          ))}
              </section>
            )}
            {benchmark && (
              <section className="prose-quality-section">
          <Space wrap>
            <Tag color={benchmark.status === "passed" ? "green" : benchmark.status === "blocked" ? "red" : "orange"}>测试集 {benchmark.score}</Tag>
            <Tag color="green">通过 {benchmark.counts?.passed || 0}</Tag>
            <Tag color="red">失败 {benchmark.counts?.failed || 0}</Tag>
          </Space>
          <Paragraph>{benchmark.summary}</Paragraph>
          {Object.entries(benchmark.metrics || {}).slice(0, 5).map(([key, value]) => (
            <div key={key} className="codex-review-row">
              <Tag color={value.rate >= 0.9 ? "green" : value.rate >= 0.72 ? "orange" : "red"}>{key}</Tag>
              <Text>{value.passed}/{value.total}</Text>
              <Text type="secondary">{Math.round((value.rate || 0) * 100)}%</Text>
            </div>
          ))}
              </section>
            )}
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
}

function buildClientModelStrategy(novel) {
  const roleRows = ["planner", "guide", "minor", "adapter", "verifier"].map((key) => {
    const setting = novel.aiRoles?.[key] || {};
    return {
      key,
      label: roleLabels[key] || key,
      providerId: setting.providerId || "",
      model: setting.model || "",
      temperature: setting.temperature ?? 0,
      contextWindowTokens: setting.contextWindowTokens || 0,
      warnings: [
        !setting.providerId ? "缺少提供商" : "",
        !setting.model ? "缺少模型" : "",
        (key === "planner" || key === "guide") && !setting.contextWindowTokens ? "未配置上下文窗口" : ""
      ].filter(Boolean)
    };
  });
  const characterRows = safeArray(novel.characters).filter((item) => item.roleType === "major").map((character) => ({
    key: character.id,
    label: character.name,
    providerId: character.providerId || "",
    model: character.model || "",
    temperature: character.temperature ?? 0,
    contextWindowTokens: character.contextWindowTokens || 0,
    warnings: [!character.providerId ? "缺少提供商" : "", !character.model ? "缺少模型" : ""].filter(Boolean)
  }));
  return { rows: [...roleRows, ...characterRows] };
}

function TranscriptPanel({ turns }) {
  const list = safeArray(turns);
  if (!list.length) return <Empty description="暂无扮演 transcript" />;
  return (
    <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
      {list.slice().reverse().map((turn) => (
        <Collapse.Item key={turn.id} name={turn.id} header={`第 ${turn.index} 轮 · ${safeArray(turn.transcript?.actors).length} 个角色`}>
          <Descriptions column={1} data={[
            { label: "工作流", value: turn.workflowId || "-" },
            { label: "导演模型", value: turn.transcript?.director?.model || turn.modelTrace?.director?.model || "-" },
            { label: "审查", value: `${turn.transcript?.review?.severity || turn.review?.severity || "未审查"} ${turn.transcript?.review?.summary || turn.review?.summary || ""}` }
          ]} />
          <Divider />
          <MiniList title="导演输入摘要" items={[turn.transcript?.director?.inputSummary || "无"]} />
          <div className="chapter-two-cols">
            {safeArray(turn.transcript?.actors).map((actor) => (
              <div className="mini-list-block" key={`${turn.id}-${actor.characterId || actor.name}`}>
                <Text bold>{actor.name}</Text>
                <Space wrap>
                  <Tag>{actor.model || "未记录模型"}</Tag>
                  <Tag color={actor.rerunCount ? "orange" : "green"}>重跑 {actor.rerunCount || 0}</Tag>
                </Space>
                <MiniList title="当前目标" items={[actor.runtimeDirective?.currentGoal || ""]} />
                <MiniList title="禁知" items={actor.runtimeDirective?.forbiddenKnowledge || []} />
                <Paragraph>{shortText(actor.outputSummary, 240)}</Paragraph>
              </div>
            ))}
          </div>
        </Collapse.Item>
      ))}
    </Collapse>
  );
}

function ParagraphGroupsPanel({ proseParts }) {
  const list = safeArray(proseParts).filter((part) => safeArray(part.paragraphGroups).length);
  if (!list.length) return <Empty description="暂无段落组改写记录" />;
  return (
    <Collapse className="agent-inline-collapse" bordered={false} defaultActiveKey={[]}>
      {list.map((prose) => (
        <Collapse.Item key={prose.id} name={prose.id} header={`${prose.status} · ${safeArray(prose.paragraphGroups).length} 个段落组`}>
          <Descriptions column={1} data={[
            { label: "改写模式", value: prose.adaptationPlan?.mode || "-" },
            { label: "修复状态", value: <Space wrap><Tag color={repairStatusColor(prose.adaptationPlan?.repairStatus)}>{prose.adaptationPlan?.repairStatus || "not_needed"}</Tag><Text type="secondary">{prose.adaptationPlan?.repairSummary || "-"}</Text></Space> },
            { label: "保留", value: safeArray(prose.adaptationPlan?.preserve).join("；") || "-" },
            { label: "删改", value: safeArray(prose.adaptationPlan?.delete).join("；") || "-" },
            { label: "自检", value: prose.adaptationPlan?.selfCheckSummary || "-" }
          ]} />
          <Divider />
          {safeArray(prose.paragraphGroups).map((group) => (
            <Card key={group.id} className="nested-lite-card" bordered={false}>
              <Space wrap>
                <Text bold>{group.index}. {group.purpose || "段落组"}</Text>
                <Tag color={paragraphGroupStatusColor(group)}>{paragraphGroupStatusLabel(group)}</Tag>
                {group.rewriteCount ? <Tag color="purple">重写 {group.rewriteCount}</Tag> : null}
              </Space>
              <Paragraph>{shortText(group.text, 420)}</Paragraph>
              <Space wrap>
                {Object.entries(group.checks || {}).map(([key, check]) => <Tag key={key} color={check?.status === "passed" ? "green" : check?.status === "failed" ? "red" : "orange"}>{key}:{check?.status || "skipped"}</Tag>)}
              </Space>
              {group.notes ? <Paragraph type="secondary">{shortText(group.notes, 160)}</Paragraph> : null}
            </Card>
          ))}
        </Collapse.Item>
      ))}
    </Collapse>
  );
}

function repairStatusColor(status) {
  if (status === "completed") return "green";
  if (status === "partial") return "orange";
  if (status === "failed") return "red";
  return "gray";
}

function paragraphGroupStatusLabel(group) {
  const statuses = Object.values(group?.checks || {}).map((check) => check?.status || "skipped");
  if (statuses.includes("failed")) return "需重写";
  if (statuses.includes("warning")) return "需复核";
  if (statuses.length && statuses.every((item) => item === "passed")) return "通过";
  return "未检查";
}

function paragraphGroupStatusColor(group) {
  const label = paragraphGroupStatusLabel(group);
  if (label === "通过") return "green";
  if (label === "需重写") return "red";
  if (label === "需复核") return "orange";
  return "gray";
}

function ModelStrategyPanel({ strategy }) {
  const rows = safeArray(strategy?.rows);
  const columns = [
    { title: "槽位", dataIndex: "label", width: 150 },
    { title: "模型", dataIndex: "model", render: (value) => value || <Text type="secondary">未配置</Text> },
    { title: "温度", dataIndex: "temperature", width: 90 },
    { title: "上下文", dataIndex: "contextWindowTokens", width: 120, render: (value) => value ? `${value}` : <Text type="secondary">未配置</Text> },
    { title: "诊断", dataIndex: "warnings", render: (value) => safeArray(value).length ? safeArray(value).map((item) => <Tag key={item} color="orange">{item}</Tag>) : <Tag color="green">正常</Tag> }
  ];
  return <Table rowKey="key" columns={columns} data={rows} pagination={false} />;
}

function RevisionLearningPanel({ learnings, activeNovel, commit }) {
  const list = safeArray(learnings).slice().reverse();
  if (!list.length) return <Empty description="暂无改稿学习。编辑正文后会生成候选偏好。" />;
  return (
    <Table
      rowKey="id"
      data={list}
      pagination={{ pageSize: 6 }}
      columns={[
        { title: "状态", dataIndex: "status", width: 100, render: (value) => <Tag color={value === "confirmed" ? "green" : value === "discarded" ? "red" : "orange"}>{value}</Tag> },
        { title: "摘要", dataIndex: "summary", render: (value, record) => <Space direction="vertical" size={2}><Text>{shortText(value, 120)}</Text><Text type="secondary">{shortText(record.transferablePreference, 120)}</Text></Space> },
        {
          title: "操作",
          width: 170,
          render: (_, record) => (
            <Space>
              <Button size="small" type="primary" disabled={record.status === "confirmed"} onClick={() => commit(`rev-confirm-${record.id}`, () => api.updateRevisionLearning(activeNovel.id, record.id, { status: "confirmed" }), "改稿偏好已确认")}>确认</Button>
              <Button size="small" status="danger" disabled={record.status === "discarded"} onClick={() => commit(`rev-drop-${record.id}`, () => api.updateRevisionLearning(activeNovel.id, record.id, { status: "discarded" }), "改稿偏好已废弃")}>废弃</Button>
            </Space>
          )
        }
      ]}
    />
  );
}

function PrewritePlanPanel({ plan }) {
  const descriptions = [
    { label: "章节", value: plan.chapterLabel },
    { label: "本章职责", value: plan.summary },
    { label: "导演提醒", value: plan.directorNote }
  ];
  return (
    <div className="prewrite-panel">
      <Descriptions column={1} data={descriptions.map((item) => ({ ...item, value: shortText(item.value, 240) }))} />
      <Collapse className="agent-inline-collapse chapter-collapse" bordered={false} defaultActiveKey={[]}>
        <Collapse.Item name="callouts" header="档案调用摘录 / 前台锚点 / 后台信息">
          <div className="chapter-three-cols">
            <MiniList title="档案调用" items={plan.archiveCallouts} />
            <MiniList title="前台锚点" items={plan.foregroundAnchors || plan.sceneFocus} />
            <MiniList title="后台不出句" items={plan.backgroundOnly} />
          </div>
        </Collapse.Item>
        <Collapse.Item name="beats" header="角色节拍与段落组计划">
          <div className="chapter-two-cols">
            <MiniList title="角色节拍" items={safeArray(plan.characterBeats).map((beat) => `${beat.name || beat.characterId}：${beat.attention || ""}${beat.avoidForcing ? `；避免 ${beat.avoidForcing}` : ""}`)} />
            <MiniList title="段落组计划" items={safeArray(plan.paragraphPlan).map((item, index) => `${index + 1}. ${item.purpose || item.summary || item.text || ""}`)} />
          </div>
        </Collapse.Item>
        <Collapse.Item name="runtime" header="角色运行时指令">
          <div className="chapter-two-cols">
            {Object.values(plan.runtimeDirectives || {}).map((directive) => (
              <div className="mini-list-block" key={directive.characterId || directive.name}>
                <Text bold>{directive.name || directive.characterId}</Text>
                <MiniList title="当前目标" items={[directive.currentGoal]} />
                <MiniList title="可见事实" items={directive.visibleFacts} />
                <MiniList title="禁知" items={directive.forbiddenKnowledge} />
              </div>
            ))}
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
}

function MiniList({ title, items }) {
  const list = safeArray(items).map((item) => String(item || "").trim()).filter(Boolean);
  return (
    <div className="mini-list-block">
      <Text bold>{title}</Text>
      {list.length ? (
        <ul className="plain-list compact">
          {list.slice(0, 8).map((item, index) => <li key={`${title}-${index}`}>{shortText(item, 140)}</li>)}
        </ul>
      ) : <Text type="secondary">暂无</Text>}
    </div>
  );
}

function ContextAuditMini({ audit }) {
  const normalized = audit || {};
  const characterCount = Object.keys(normalized.characters || {}).length;
  const loreCount = Object.values(normalized.characters || {}).reduce((sum, item) => sum + Number(item?.triggeredLoreCount || 0), Number(normalized.director?.triggeredLoreCount || 0));
  return (
    <Space size={4} wrap>
      <Tag color="arcoblue">角色 {characterCount}</Tag>
      <Tag color={loreCount > 0 ? "green" : "gray"}>世界书 {loreCount}</Tag>
    </Space>
  );
}

function DirectorAuditTag({ audit }) {
  const status = audit?.status || "ok";
  const color = status === "overcontrolled" ? "red" : status === "warning" ? "orange" : "green";
  return <Tag color={color}>{status}</Tag>;
}

function memoryLayerColor(layer) {
  return ({
    stable_fact: "green",
    tentative_judgment: "orange",
    character_visible: "arcoblue",
    author_memory: "purple",
    run_audit: "gray",
    roleplay_state: "magenta"
  })[layer] || "green";
}

function ContextAuditSummary({ audit }) {
  if (!audit) return <Empty description="暂无上下文审计" />;
  const characterAudits = Object.values(audit.characters || {});
  const loreCount = characterAudits.reduce((sum, item) => sum + Number(item.triggeredLoreCount || 0), Number(audit.director?.triggeredLoreCount || 0));
  const memoryCount = characterAudits.reduce((sum, item) => sum + Number(item.structuredMemoryCount || 0), Number(audit.director?.structuredMemoryCount || 0));
  const evidenceCount = characterAudits.reduce((sum, item) => sum + Number(item.retrievedEvidenceCount || 0), Number(audit.director?.retrievedEvidenceCount || 0));
  return (
    <div className="context-audit-summary">
      <Space wrap>
        <Tag color="arcoblue">角色包 {characterAudits.length}</Tag>
        <Tag color={loreCount ? "green" : "gray"}>世界书 {loreCount}</Tag>
        <Tag color={memoryCount ? "purple" : "gray"}>记忆 {memoryCount}</Tag>
        <Tag color={evidenceCount ? "orange" : "gray"}>证据 {evidenceCount}</Tag>
      </Space>
      {audit.director?.warnings?.length ? <Alert type="warning" content={shortText(audit.director.warnings.join("；"), 120)} /> : null}
    </div>
  );
}

function ContextAuditPanel({ audit }) {
  if (!audit) return <Empty description="暂无上下文审计" />;
  const characterEntries = Object.entries(audit.characters || {});
  return (
    <div className="context-audit-panel">
      <ContextAuditSummary audit={audit} />
      <Collapse className="agent-inline-collapse chapter-collapse" bordered={false} defaultActiveKey={[]}>
        {audit.director && (
          <Collapse.Item name="director" header="导演上下文包">
            <ContextAuditDetail audit={audit.director} />
          </Collapse.Item>
        )}
        {characterEntries.map(([characterId, item]) => (
          <Collapse.Item key={characterId} name={characterId} header={`角色上下文：${item.characterId || characterId}`}>
            <ContextAuditDetail audit={item} />
          </Collapse.Item>
        ))}
        {audit.minor && (
          <Collapse.Item name="minor" header="次要角色群上下文包">
            <ContextAuditDetail audit={audit.minor} />
          </Collapse.Item>
        )}
        {audit.adapter && (
          <Collapse.Item name="adapter" header="改写 AI 上下文包">
            <ContextAuditDetail audit={audit.adapter} />
          </Collapse.Item>
        )}
      </Collapse>
    </div>
  );
}

function ContextAuditDetail({ audit }) {
  const rows = [
    { label: "策略", value: audit.strategy },
    { label: "固定层", value: audit.fixedContextCount },
    { label: "世界书", value: audit.triggeredLoreCount },
    { label: "长期记忆", value: audit.structuredMemoryCount },
    { label: "RAG 证据", value: audit.retrievedEvidenceCount },
    { label: "近场历史", value: audit.recentContextCount }
  ];
  return (
    <div className="context-audit-detail">
      <Descriptions column={3} data={rows} />
      <div className="chapter-three-cols">
        <MiniList title="触发世界书" items={safeArray(audit.triggeredLore).map((item) => `${item.name || item.id}：${safeArray(item.matchedKeys).join("、") || "触发"}`)} />
        <MiniList title="结构化记忆" items={safeArray(audit.structuredMemory).map((item) => `${item.subject || item.id}/${item.field || ""}`)} />
        <MiniList title="检索证据" items={safeArray(audit.retrievedEvidence).map((item) => `${item.title || item.id} ${item.score ? `(${item.score})` : ""}`)} />
      </div>
      {audit.runtimeDirective && (
        <div className="chapter-three-cols">
          <MiniList title="当前目标" items={[audit.runtimeDirective.currentGoal]} />
          <MiniList title="可见事实" items={audit.runtimeDirective.visibleFacts} />
          <MiniList title="禁知 / 禁行" items={[...safeArray(audit.runtimeDirective.forbiddenKnowledge), ...safeArray(audit.runtimeDirective.forbiddenMoves)]} />
        </div>
      )}
    </div>
  );
}

function ProvidersPage({ state, providers, busy, commit }) {
  const [providerForm] = Form.useForm();
  const [editingProvider, setEditingProvider] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [queryPanel, setQueryPanel] = useState({ provider: null, models: [], selected: [] });
  const [drawerModelCandidates, setDrawerModelCandidates] = useState([]);
  const [drawerSelectedModels, setDrawerSelectedModels] = useState([]);
  const [manualModel, setManualModel] = useState("");
  const providerAdapterIdForEndpoint = (endpointKind) => (
    endpointKind === "responses" ? "openai_responses" : "openai_chat_completions"
  );

  const openProviderDrawer = (provider = null) => {
    setEditingProvider(provider);
    setDrawerModelCandidates([]);
    setDrawerSelectedModels([]);
    providerForm.setFieldsValue({
      name: provider?.name || "",
      baseUrl: provider?.baseUrl || "",
      endpointKind: provider?.endpointKind || "chat_completions",
      modelQueryPath: provider?.modelQueryPath || "/models",
      apiKey: "",
      modelsText: joinLines(provider?.models || [])
    });
    setDrawerVisible(true);
  };

  const saveProvider = (values) => {
    const endpointKind = values.endpointKind || "chat_completions";
    const payload = {
      ...values,
      id: editingProvider?.id,
      endpointKind,
      adapterId: providerAdapterIdForEndpoint(endpointKind),
      models: splitLines(values.modelsText)
    };
    delete payload.modelsText;
    return commit("provider-save", () => api.upsertProvider(payload), "提供商已保存").then(() => setDrawerVisible(false));
  };

  const queryModels = async (provider) => {
    const result = await commit(`query-models-${provider.id}`, () => api.queryModels(provider.id), "已查询模型候选，请选择后再添加");
    if (result?.models) setQueryPanel({ provider, models: result.models, selected: [] });
  };

  const queryDrawerModels = async () => {
    const values = providerForm.getFieldsValue();
    const baseUrl = String(values.baseUrl || "").trim();
    const apiKey = String(values.apiKey || "").trim();
    if (!baseUrl) {
      notify("warning", "请先填写 Base URL");
      return;
    }
    if (!editingProvider?.hasKey && !apiKey && baseUrl !== "mock://local") {
      notify("warning", "新建提供商需要先填写 API Key，才能查询远端模型");
      return;
    }
    const payload = {
      id: editingProvider?.id,
      name: values.name || editingProvider?.name || "模型查询草稿",
      baseUrl,
      endpointKind: values.endpointKind || "chat_completions",
      adapterId: providerAdapterIdForEndpoint(values.endpointKind || "chat_completions"),
      modelQueryPath: values.modelQueryPath || "/models",
      apiKey,
      models: splitLines(values.modelsText)
    };
    const result = await commit("provider-draft-model-query", () => api.queryProviderDraftModels(payload), "已查询模型候选");
    if (result?.models) {
      const existingModels = new Set(splitLines(values.modelsText));
      setDrawerModelCandidates(result.models.filter((model) => !existingModels.has(model)));
      setDrawerSelectedModels([]);
    }
  };

  const addDrawerSelectedModels = () => {
    const current = providerForm.getFieldsValue();
    const nextModels = uniqueStrings([...splitLines(current.modelsText), ...drawerSelectedModels]);
    providerForm.setFieldsValue({ modelsText: joinLines(nextModels) });
    setDrawerModelCandidates((models) => models.filter((model) => !drawerSelectedModels.includes(model)));
    setDrawerSelectedModels([]);
    notify("success", "已加入当前表单模型列表，保存提供商后生效");
  };

  const addSelectedModels = async () => {
    const provider = queryPanel.provider;
    for (const model of queryPanel.selected) {
      await commit(`add-model-${model}`, () => api.addProviderModel(provider.id, model), "");
    }
    notify("success", "已添加选择的模型");
    setQueryPanel({ provider: null, models: [], selected: [] });
  };

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      width: 180,
      render: (value, record) => (
        <div className="provider-name-cell">
          <Text bold>{value}</Text>
          {record.builtin && <Tag color="green">内置</Tag>}
        </div>
      )
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      width: 280,
      render: (value) => <Text className="provider-url-cell" title={value}>{value || "-"}</Text>
    },
    {
      title: "接口",
      dataIndex: "endpointKind",
      width: 160,
      render: (value) => <Tag color={value === "responses" ? "purple" : "arcoblue"}>{value}</Tag>
    },
    {
      title: "Key",
      dataIndex: "maskedKey",
      width: 140,
      render: (value, record) => record.hasKey ? <Text className="provider-key-cell">{value}</Text> : <Tag color="red">未配置</Tag>
    },
    {
      title: "模型",
      dataIndex: "models",
      width: 330,
      render: (models, record) => (
        <div className="provider-model-cell">
          {safeArray(models).slice(0, 5).map((model) => (
            <Tag
              key={model}
              closable={!record.builtin}
              onClose={(event) => {
                event.stopPropagation();
                commit(`remove-model-${model}`, () => api.removeProviderModel(record.id, model), "模型已移除");
              }}
            >
              {model}
            </Tag>
          ))}
          {safeArray(models).length > 5 && <Tag color="gray">+{safeArray(models).length - 5}</Tag>}
        </div>
      )
    },
    {
      title: "操作",
      width: 248,
      fixed: "right",
      render: (_, record) => (
        <div className={`provider-action-cell ${record.builtin ? "is-builtin" : ""}`}>
          <Button className="provider-query-button" size="small" icon={<IconSearch />} loading={busy === `query-models-${record.id}`} onClick={() => queryModels(record)}>查询模型</Button>
          <Button className="provider-edit-button" size="small" icon={<IconEdit />} onClick={() => openProviderDrawer(record)}>编辑</Button>
          {!record.builtin && (
            <Popconfirm title="确认删除提供商？已被槽位使用时后端会阻止或解绑。" onOk={() => commit(`provider-delete-${record.id}`, () => api.deleteProvider(record.id), "提供商已删除")}>
              <Button className="provider-delete-button" size="small" status="danger" icon={<IconDelete />} iconOnly />
            </Popconfirm>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="page-grid providers-layout">
      <section className="page-primary">
        <Card className="work-card provider-table-card" bordered={false}>
          <PanelTitle icon={<IconSettings />} title="AI 提供商与模型" extra={<Button type="primary" icon={<IconPlus />} onClick={() => openProviderDrawer()}>添加提供商</Button>} />
          <Table className="provider-table" rowKey="id" columns={columns} data={providers} pagination={false} scroll={{ x: 1338 }} />
        </Card>
        {queryPanel.provider && (
          <Card className="work-card candidate-card" bordered={false}>
            <PanelTitle
              icon={<IconSearch />}
              title={`模型候选：${queryPanel.provider.name}`}
              extra={<Button icon={<IconClose />} onClick={() => setQueryPanel({ provider: null, models: [], selected: [] })}>关闭</Button>}
            />
            <Alert type="info" content="查询模型只展示候选，不会自动写入。勾选需要的模型后点击添加。" />
            <Checkbox.Group value={queryPanel.selected} onChange={(selected) => setQueryPanel((current) => ({ ...current, selected }))}>
              <div className="model-candidate-grid">
                {queryPanel.models.map((model) => (
                  <Checkbox key={model} value={model}>{model}</Checkbox>
                ))}
              </div>
            </Checkbox.Group>
            <Button type="primary" icon={<IconPlus />} disabled={queryPanel.selected.length === 0} onClick={addSelectedModels}>添加所选模型</Button>
          </Card>
        )}
      </section>
      <aside className="page-aside">
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconCode />} title="模型快速添加" />
          <Select placeholder="选择提供商" value={queryPanel.provider?.id} onChange={(id) => setQueryPanel((current) => ({ ...current, provider: providers.find((item) => item.id === id) || null }))} getPopupContainer={popupToBody}>
            {providers.map((provider) => <Option key={provider.id} value={provider.id}>{provider.name}</Option>)}
          </Select>
          <Input value={manualModel} onChange={setManualModel} placeholder="手动输入模型 ID" />
          <Button
            type="primary"
            icon={<IconPlus />}
            disabled={!queryPanel.provider || !manualModel.trim()}
            onClick={() => commit("manual-model-add", () => api.addProviderModel(queryPanel.provider.id, manualModel.trim()), "模型已添加").then(() => setManualModel(""))}
            long
          >
            添加模型
          </Button>
        </Card>
        <Card className="command-card" bordered={false}>
          <PanelTitle icon={<IconSafe />} title="安全提示" />
          <ul className="plain-list">
            <li>前端只显示脱敏 Key，不回显完整密钥。</li>
            <li>查询模型不会自动保存，避免污染模型列表。</li>
            <li>策划、审查、导演、角色和改写槽位可各自选模型。</li>
          </ul>
        </Card>
      </aside>
      <Drawer
        className="provider-config-drawer"
        width={560}
        title={editingProvider ? "编辑提供商" : "添加提供商"}
        visible={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        footer={null}
        bodyStyle={{
          height: "100%",
          maxHeight: "calc(100vh - 56px)",
          flex: "1 1 0",
          width: "100%",
          margin: 0,
          overflow: "hidden",
          padding: 0
        }}
      >
        <div className="provider-drawer-shell agent-drawer-shell">
          <Form
            key={`${editingProvider?.id || "new-provider"}:${drawerVisible ? "open" : "closed"}`}
            className="provider-drawer-form"
            form={providerForm}
            layout="vertical"
            initialValues={{
              name: editingProvider?.name || "",
              baseUrl: editingProvider?.baseUrl || "",
              endpointKind: editingProvider?.endpointKind || "chat_completions",
              modelQueryPath: editingProvider?.modelQueryPath || "/models",
              apiKey: "",
              modelsText: joinLines(editingProvider?.models || [])
            }}
            onSubmit={saveProvider}
          >
            <FormItem field="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></FormItem>
            <FormItem field="baseUrl" label="Base URL" rules={[{ required: true, message: "请输入 Base URL" }]}><Input placeholder="https://api.example.com/v1" /></FormItem>
            <FormItem field="endpointKind" label="接口类型">
              <Radio.Group type="button" className="provider-endpoint-toggle">
                <Radio value="chat_completions">chat/completions</Radio>
                <Radio value="responses">responses</Radio>
              </Radio.Group>
            </FormItem>
            <FormItem field="modelQueryPath" label="模型查询路径"><Input placeholder="/models" /></FormItem>
            <FormItem field="apiKey" label="API Key">
              <Input.Password placeholder={editingProvider ? "留空则保留原 Key" : "请输入 Key"} />
            </FormItem>
            <div className="provider-drawer-tools">
              <Button htmlType="button" icon={<IconSearch />} loading={busy === "provider-draft-model-query"} onClick={queryDrawerModels}>查询模型候选</Button>
              <Text type="secondary">使用当前 Base URL、接口类型、查询路径和 Key 发起查询，不会自动保存。</Text>
            </div>
            {drawerModelCandidates.length > 0 && (
              <div className="provider-drawer-candidates">
                <div className="folder-path-line">
                  <Text bold>可添加模型</Text>
                  <Button htmlType="button" size="mini" disabled={drawerSelectedModels.length === 0} onClick={addDrawerSelectedModels}>加入列表</Button>
                </div>
                <Checkbox.Group value={drawerSelectedModels} onChange={setDrawerSelectedModels}>
                  <div className="model-candidate-grid compact">
                    {drawerModelCandidates.map((model) => (
                      <Checkbox key={model} value={model}>{model}</Checkbox>
                    ))}
                  </div>
                </Checkbox.Group>
              </div>
            )}
            <FormItem field="modelsText" label="已保存模型">
              <TextArea autoSize={{ minRows: 6, maxRows: 14 }} placeholder="一行一个模型 ID" />
            </FormItem>
          </Form>
          <div className="provider-drawer-footer">
            <Button htmlType="button" onClick={() => setDrawerVisible(false)}>取消</Button>
            <Button type="primary" htmlType="button" icon={<IconSave />} loading={busy === "provider-save"} onClick={() => providerForm.submit()}>
              保存提供商
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

export default App;

