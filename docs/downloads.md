# 下载与外部依赖记录

当前项目的 npm 依赖记录在 `package.json` 和 `package-lock.json`，安装位置为 `node_modules/`。项目内也保存了用户手动下载并提供的世界书 JSON 数据文件，记录见下方“v2.4 原始文件与原始对齐导入版”。

项目使用本机已安装的 Node.js 运行；首次运行或删除过 `node_modules/` 后需要执行 `npm install`。

## 绝区零融合中文重写世界书

- 生成内容：`resources/lorebooks/绝区零-融合中文重写世界书.json`
- 生成脚本：`scripts/build-zzz-cn-lorebook.js`
- 用途：作为本项目“世界书”页可导入的 World Info / Lorebook，用于《绝区零》同人项目的角色扮演、导演写前定位和小说改写。
- 来源参考：
  - 中文公开入口：`https://t.me/s/qiqinsfw?before=106`，页面显示 `绝区零设定集[v2.4].json`，约 237.5 KB，说明称已更新至绝区零 2.4。已在本机代理 `127.0.0.1:7897` 下重试，Telegram 页面与嵌入页可以访问，但公开 HTML 只暴露文件名、大小和消息链接，不暴露真实附件下载 URL；Discord 同步发布入口未登录 API 返回 `401 Unauthorized`。后续用户通过已登录环境手动下载并提供了原始中文 JSON。
  - 英文公开入口：`https://chub.ai/lorebooks/Gedachtnis/zenless-zone-zero-relevant-to-2-7-6987c483a083`，Chub API 可读取 V2 Lorebook 结构，公开元数据显示约 45381 tokens、211 条条目；原始 LoreBary 页面为 `https://lorebary.com/lorebook-library?view=9ABE9D60`。
- 处理方式：只参考条目覆盖范围、版本信息和酒馆世界书组织方式，生成内容全部中文重写和摘要化，不保存两个外部世界书的原文副本。
- 删除方式：删除 `resources/lorebooks/绝区零-融合中文重写世界书.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-cn-lorebook.js` 中这项专用脚本。

### 扩展版

- 生成内容：`resources/lorebooks/绝区零-融合中文重写世界书-扩展版.json`
- 生成脚本：`scripts/build-zzz-cn-lorebook-expanded.js`
- 用途：保留 Chub / LoreBary 英文世界书的 211 条粒度，另加 3 条全局控制条目，总计 214 条，适合需要更完整角色、地点、组织触发的项目。
- 使用模型：`硅基流动 / deepseek-ai/DeepSeek-V4-Flash`，不是 Pro 模型。脚本默认模型已改成这个非 Pro 模型。
- 处理方式：逐批用 AI 对来源条目做中文重写；不使用本地规则矫正补写，不复制外部世界书原文。
- 删除方式：删除 `resources/lorebooks/绝区零-融合中文重写世界书-扩展版.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-cn-lorebook-expanded.js`。

### v2.4 已知差异补全版

- 生成内容：`resources/lorebooks/绝区零-融合中文重写世界书-v2.4已知差异补全版.json`
- 生成脚本：`scripts/build-zzz-cn-lorebook-v24-camel.js`
- 用途：在扩展版 214 条基础上，补入中文 v2.4 公开页面可确认的已知差异条目，总计 221 条。
- 使用模型：`CaMeL / deepseek-v4-flash`，不是 Pro 模型。
- 已知补充：`v2.4已知差异说明`、`坎卜斯黑枝`、`照`、`琉音`、`般岳`、`叶瞬光`、`叶释渊`。
- 限制：这是拿到原始 JSON 前的历史补全产物，不是 `绝区零设定集[v2.4].json` 原始文件的逐条复刻。现在已经有原始文件，应优先使用下方“原始对齐导入版”。
- 2026-05-21 重试记录：开启代理后可访问 `https://t.me/qiqinsfw/105?embed=1&single` 与转发页 `https://t.me/qiqihome/1560?embed=1&single`，但两者的 document 链接仍指回消息页本身；Telegram 小组件内部 API 尝试读取消息返回 `Invalid method`，Discord 未登录消息 API 返回 `401 Unauthorized`。后续应优先通过 Telegram 客户端或浏览器登录态手动下载原文件，再放入项目做条目级转换。
- 删除方式：删除 `resources/lorebooks/绝区零-融合中文重写世界书-v2.4已知差异补全版.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-cn-lorebook-v24-camel.js`。

### v2.4 原始文件与原始对齐导入版

- 用户提供原始文件：`E:\download\绝区零设定集[v2.4].json`
- 项目内保存位置：`resources/source/绝区零设定集[v2.4].json`
- SHA256：`816C5AFF884A05B18526A03AA36C6A0D43CBECE4AA1E49018D5C3B2E64B8B48A`
- 原始结构：SillyTavern World Info，根对象为 `entries`，条目容器是对象表。
- 原始条目数：79 条；其中 5 条禁用，1 条为禁用空内容分组分隔条目 `---热门NPC---`。
- 转换脚本：`scripts/convert-zzz-v24-source-lorebook.js`
- 生成内容：`resources/lorebooks/绝区零设定集-v2.4-原始对齐导入版.json`
- 用途：作为本项目世界书页面可导入的 79 条原始对齐版，用于严格对齐 `绝区零设定集[v2.4].json` 的条目粒度。
- 处理方式：只做结构映射和来源记录，不调用 AI，不新增条目，不使用规则矫正。原始启用但没有主关键词的条目会在生成报告中标出，不自动用条目名补关键词。
- 导入验证：已用临时小说通过 `/api/novels/:id/lorebook/import` 验证，`importedCount=79`、实际保存 `79` 条；验证后已删除临时小说并恢复原激活小说。
- 删除方式：如不再需要原始来源和导入版，可删除 `resources/source/绝区零设定集[v2.4].json`、`resources/lorebooks/绝区零设定集-v2.4-原始对齐导入版.json` 和 `scripts/convert-zzz-v24-source-lorebook.js`。

### v2.4 + 扩展资料全量融合版

- 生成内容：`resources/lorebooks/绝区零-全量融合世界书-v2.4+扩展版.json`
- 生成脚本：`scripts/build-zzz-full-lorebook.js`
- 用途：保留原始 v2.4 中文世界书，同时追加此前扩展版资料，避免因为“对齐原始文件”而丢掉其它真正属于绝区零的条目。
- 来源组成：
  - `resources/lorebooks/绝区零设定集-v2.4-原始对齐导入版.json`：79 条，来源为用户提供的中文 v2.4 原始世界书。
  - `resources/lorebooks/绝区零-融合中文重写世界书-扩展版.json`：214 条，其中 211 条为 Chub / LoreBary 覆盖范围的中文重写扩展资料，3 条为本项目世界书使用控制条目。
- 总条目数：293 条。
- 处理方式：全量保留，不调用 AI，不规则补写，不按名称或关键词去重删除；同名或近似条目同时保留，并用来源和优先级区分。原始 v2.4 条目优先级高于扩展资料。
- 导入验证：已用临时小说通过 `/api/novels/:id/lorebook/import` 验证，`importedCount=293`、实际保存 `293` 条；导入后来源标记保留为 `zzz_v24_original=79`、`zzz_chub_lorebary_expanded=211`、`project_lorebook_control=3`。验证后已删除临时小说并恢复原激活小说。
- 删除方式：删除 `resources/lorebooks/绝区零-全量融合世界书-v2.4+扩展版.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-full-lorebook.js`。

### 英文来源扩展世界书中文本地化版

- 生成内容：`resources/lorebooks/绝区零-扩展世界书-中文本地化版.json`
- 精校内容：`resources/lorebooks/绝区零-扩展世界书-中文本地化精校版.json`
- 生成脚本：`scripts/localize-zzz-expanded-lorebook.js`
- 精校脚本：`scripts/cleanup-zzz-localized-lorebook.js`
- 用途：保留英文 Chub / LoreBary 来源世界书的 214 条粒度，但将条目名、正文和触发词尽量改为《绝区零》简中官方或通行中文名，避免 `Ye Shunguang（暂译）`、`God Finger（暂译）` 这类半英文半暂译状态继续进入项目。
- 使用模型：`CaMeL / deepseek-v4-flash`，不是 Pro 模型。
- 参考资料：
  - 用户提供的 `resources/source/绝区零设定集[v2.4].json`，用于确认 v2.4 中文人物、组织和设定名称。
  - PlayStation 《Zenless Zone Zero》页面，用于确认英文官方世界观基础名词，如 Hollows、Ethereals、New Eridu、Proxy 等。
  - BWiki / Fandom 公开页面，用于校对 `金手指`、`瀑汤谷`、`汀曼大师` 等店铺或 NPC 名称。
- 处理方式：AI 本地化，不用本地规则硬替换；不删条目、不合并条目、不新增条目。英文旧名和触发词放入 `extensions.localization.sourceAliases`，主体尽量中文化。游戏内简中实际保留的风格化英文或缩写，如 `Fairy`、`Random Play`、`COFF CAFE`、`HIA`、`HDD`、`TOPS`，保留但配中文功能词。
- 质量检查：精校版共 214 条；`暂译`、`待校`、`需项目确认`、`待项目确认` 残留计数为 0。
- 删除方式：删除 `resources/lorebooks/绝区零-扩展世界书-中文本地化版.json`、`resources/lorebooks/绝区零-扩展世界书-中文本地化精校版.json`；如果不再需要复生成能力，也可以删除两个本地化脚本。

### v2.4 + 中文本地化扩展资料全量融合版

- 生成内容：`resources/lorebooks/绝区零-全量融合世界书-v2.4+中文本地化扩展版.json`
- 生成脚本：`scripts/build-zzz-full-localized-lorebook.js`
- 用途：当前推荐使用的全量世界书。它保留中文 v2.4 原始世界书 79 条，同时追加英文来源世界书经中文本地化精校后的 214 条扩展资料。
- 总条目数：293 条。
- 来源组成：`zzz_v24_original=79`、`zzz_chub_lorebary_localized=211`、`project_lorebook_control=3`。
- 处理方式：全量保留，不按名称或关键词去重删除；原始 v2.4 条目优先级高于中文本地化扩展资料。
- 质量检查：`暂译`、`待校`、`需项目确认`、`待项目确认` 残留计数为 0。
- 导入验证：已用临时小说通过 `/api/novels/:id/lorebook/import` 验证，`importedCount=293`、实际保存 `293` 条；导入后来源标记保留为 `zzz_v24_original=79`、`zzz_chub_lorebary_localized=211`、`project_lorebook_control=3`。验证后已删除临时小说并恢复原激活小说。
- 删除方式：删除 `resources/lorebooks/绝区零-全量融合世界书-v2.4+中文本地化扩展版.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-full-localized-lorebook.js`。

### v2.5 原始文件与原始对齐导入版

- 用户提供原始文件：`E:\download\绝区零设定集[2.5].json`
- 项目内保存位置：`resources/source/绝区零设定集[2.5].json`
- SHA256：`8FE624526EE83678F65F7BE2556DC32744310E4CA2B701F2F7229C934767AD06`
- 原始结构：SillyTavern World Info，根对象为 `entries`，条目容器是对象表。
- 原始条目数：85 条；其中 4 条禁用，1 条为空内容分组分隔条目。
- 相对 v2.4 的变化：新增 6 条，未删除 v2.4 条目；`【设定】邦布`、`仪玄`、`叶释渊`、`---坎卜斯黑枝---`、`【开关】是否为“法厄同”`、`照`、`叶瞬光` 等条目存在启用状态、关键词或正文内容变化。
- 新增条目：`伊瑟尔德`、`达米安`、`---妄想天使---`、`南宫羽`、`爱芮`、`千夏`。
- 转换脚本：`scripts/convert-zzz-source-lorebook.js`
- 生成内容：`resources/lorebooks/绝区零设定集-v2.5-原始对齐导入版.json`
- 用途：作为本项目世界书页面可导入的 85 条原始对齐版，用于严格对齐 `绝区零设定集[2.5].json` 的条目粒度。
- 处理方式：只做结构映射和来源记录，不调用 AI，不新增条目，不使用规则矫正。原始启用但没有主关键词的条目会在生成报告中标出，不自动用条目名补关键词。
- 导入验证：已用临时小说通过 `/api/novels/:id/lorebook/import` 验证，`importedCount=85`、实际保存 `85` 条；验证后已删除临时小说并恢复验证前激活小说。
- 删除方式：如不再需要 v2.5 原始来源和导入版，可删除 `resources/source/绝区零设定集[2.5].json`、`resources/lorebooks/绝区零设定集-v2.5-原始对齐导入版.json` 和 `scripts/convert-zzz-source-lorebook.js`。注意该脚本是版本化通用转换脚本，后续其它版本也可复用。

### v2.5 + 中文本地化扩展资料全量融合版

- 生成内容：`resources/lorebooks/绝区零-全量融合世界书-v2.5+中文本地化扩展版.json`
- 生成脚本：`scripts/build-zzz-full-localized-lorebook-versioned.js`
- 用途：当前更推荐使用的全量世界书。它保留中文 v2.5 原始世界书 85 条，同时追加英文来源世界书经中文本地化精校后的 214 条扩展资料。
- 总条目数：299 条。
- 来源组成：`zzz_v2_5_original=85`、`zzz_chub_lorebary_localized=211`、`project_lorebook_control=3`。
- 处理方式：全量保留，不按名称或关键词去重删除；原始 v2.5 条目优先级高于中文本地化扩展资料。
- 质量检查：`暂译`、`待校`、`需项目确认`、`待项目确认` 残留计数为 0。
- 导入验证：已用临时小说通过 `/api/novels/:id/lorebook/import` 验证，`importedCount=299`、实际保存 `299` 条；导入后来源标记保留为 `zzz_v2_5_original=85`、`zzz_chub_lorebary_localized=211`、`project_lorebook_control=3`。验证后已删除临时小说并恢复验证前激活小说。
- 删除方式：删除 `resources/lorebooks/绝区零-全量融合世界书-v2.5+中文本地化扩展版.json`；如果不再需要复生成能力，也可以删除 `scripts/build-zzz-full-localized-lorebook-versioned.js`。

如果后续添加依赖，需要在这里记录：

## Agent 参考项目源码调研

- 下载内容：`Haleclipse/CodexDesktop-Rebuild`、`openai/codex`、`opencode-ai/opencode` 的浅克隆源码。
- 来源：
  - `https://github.com/Haleclipse/CodexDesktop-Rebuild.git`
  - `https://github.com/openai/codex.git`
  - `https://github.com/opencode-ai/opencode.git`
- 用途：对照 Codex Desktop 重建项目、OpenAI Codex CLI / App Server 和 opencode 的 Agent runtime、工具协议、权限、上下文压缩、流式输出、MCP、LSP、补丁、会话与前端/TUI 交互，检查本项目策划 Agent 的完成度和缺口。
- 保存位置：`.research/CodexDesktop-Rebuild/`、`.research/openai-codex/`、`.research/opencode/`。
- 下载方式：使用 `git clone --depth 1 --filter=blob:none --sparse`，随后只展开 README、docs、Agent runtime、TUI、app-server、工具和脚本相关目录。
- 删除方式：如不再需要本轮调研资料，删除项目根目录下 `.research/` 文件夹即可；该目录不参与项目运行。

### 临时 opencode TypeScript runtime 对照源码

- 下载内容：`sst/opencode` / `opencode` 的 TypeScript runtime 源码浅克隆。
- 来源：`https://github.com/sst/opencode.git`
- 保存位置：`tmp/research/opencode/`
- 用途：对照较完整的 Agent session processor、原生 tool call 事件流、工具注册表、权限、上下文压缩、重试、回退和 shell 工具实现，辅助审计本项目策划 Agent 与 Codex / opencode 类 Agent 的差距。
- 当前版本：`3bf054c`
- 删除方式：如不再需要这份临时对照源码，删除 `tmp/research/opencode/` 即可；该目录不参与项目运行。

## React + Arco Design 前端依赖

- 下载内容：`react`、`react-dom`、`vite`、`@vitejs/plugin-react`、`@arco-design/web-react`。
- 用途：将旧原生前端重构为 React + Arco Design 工作台，真实调用 Arco 的 Layout、Menu、Form、Table、Drawer、Modal、Tabs、Upload、Message 等组件，并通过 Vite 构建到后端托管的 `web/` 目录。
- 安装位置：`node_modules/`；依赖声明在 `package.json`，精确版本锁定在 `package-lock.json`。
- 构建入口：`client/`；构建命令为 `npm run build:web`；产物位置为 `web/index.html` 和 `web/assets/`。
- 删除方式：如需回退这批依赖，先删除 `client/`、`web/assets/`、`node_modules/` 和 `package-lock.json`，再从 `package.json` 移除上述依赖与 `dev:web`、`build:web` 脚本，并恢复旧 `web/index.html` 对 `app.js/styles.css` 的引用。

## tsParticles 粒子引擎与本地粒子图源

- 下载内容：`@tsparticles/react@3.0.0`、`@tsparticles/slim@3.9.1`。
- 下载原因：`@tsparticles/react@4.0.5` 当前 npm 元数据包含 `workspace:^` 依赖协议，本机 npm 安装时报 `Unsupported URL Type "workspace:"`，因此改用稳定 v3 系列。
- 用途：替换手写 Canvas 粒子循环，由成熟粒子引擎负责持续生成、边界重生、图片形状、密度控制、移动方向、速度、透明度、旋转和暂停策略，避免粒子效果变成一阵一阵的批次播放。
- 安装位置：`node_modules/@tsparticles/`；依赖声明在 `package.json`，精确版本锁定在 `package-lock.json`。
- 本地图源：`client/public/particle-sprites/snowflake.svg`、`rain-drop.svg`、`maple-leaf.svg`、`cherry-blossom.svg`。
- 图源来源：雪花、雨滴、枫叶来自 Twemoji 14.0.2 SVG 资产，下载自 jsDelivr 的 `twitter/twemoji` 仓库镜像；樱花粒子已改为项目内手绘的单片花瓣多姿态 SVG，避免五瓣花形状不符合前景飘落花瓣需求。
- 运行位置：Vite 构建时会把 `client/public/particle-sprites/` 复制到 `web/particle-sprites/`，前端通过 `/particle-sprites/*.svg` 加载。
- 删除方式：如不再使用 tsParticles，删除 `client/public/particle-sprites/`，从 `package.json` 移除 `@tsparticles/react` 和 `@tsparticles/slim`，删除 `node_modules/` 后重新 `npm install`，再把前端粒子层实现改回其它渲染方式。

## Three.js 片状粒子三维渲染依赖

- 下载内容：`three@0.184.0`。
- 用途：为樱花、枫叶、蒲公英这类片状粒子提供真正的三维纹理平面渲染。旧 Canvas 2D 只能压缩或斜切贴图，无法让“整体随风摆动”和“表面 yaw/pitch/roll 翻转倾斜”同时成立；Three.js 用 `PlaneGeometry + InstancedMesh` 渲染大量独立粒子平面，每片粒子都能拥有自己的航向、翻面、倾斜和轻微颤动。
- 安装位置：`node_modules/three/`；依赖声明在 `package.json`，精确版本锁定在 `package-lock.json`。
- 相关设计文档：`docs/particle_3d_design.md`。
- 删除方式：如不再使用三维片状粒子，从 `package.json` 移除 `three`，删除 `node_modules/` 后重新 `npm install`，并把前端片状粒子层改回 tsParticles 或其它渲染方式。

## js-tiktoken 上下文预算依赖

- 下载内容：`js-tiktoken@1.0.21`。
- 用途：为策划 Agent 的上下文压缩和运行预算提供 tokenizer 级 token 估算，替代单纯字符数估算；当前用于预算统计、压缩触发、运行审计和前端 token 展示。后端会按模型族选择 `o200k_base` 或 `cl100k_base`，未知模型默认使用 `cl100k_base`。
- 安装位置：`node_modules/js-tiktoken/`；依赖声明在 `package.json`，精确版本锁定在 `package-lock.json`。
- 删除方式：如不再使用 tokenizer 预算，从 `package.json` 移除 `js-tiktoken`，删除 `node_modules/` 后重新 `npm install`，并把后端 `estimatePlanningTokens` 的 tokenizer 调用改回内部估算。

## Windows Job Object shell wrapper

- 生成内容：`data/shell-wrappers/windows_job_*.ps1`。
- 生成原因：Node.js 没有直接暴露 Windows Job Object API，后端在运行 `runShell` 或 `startShellJob` 时会生成临时 PowerShell wrapper，用 C# P/Invoke 创建 Job Object，并把当前 shell 进程加入 Job，随后执行 Agent 请求的命令。
- 用途：为策划 Agent 的 shell 工具提供准 OS 级本地沙箱能力，限制进程树、活动进程数、内存、CPU hard cap，并在 Job 关闭时清理子进程，避免后台资料处理或测试命令留下孤儿进程。
- 运行边界：持续交互式 shell session 暂不使用这个 wrapper，因为它需要长期 stdin/stdout 交互；一次性 `runShell` 和后台 `startShellJob` 会使用。工作区外路径、危险命令和 shell 权限仍由 Agent 权限策略控制，Job Object 只负责 OS 层进程资源边界。
- 删除方式：这些 wrapper 是可再生执行文件，停止后端后可删除 `data/shell-wrappers/`；下次运行 shell 工具会自动重新生成。
