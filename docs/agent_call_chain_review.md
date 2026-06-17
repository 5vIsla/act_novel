# Agent 调用链对照记录

## 结论

当前项目不能只把策划 Agent 做成“聊天框 + 后端 JSON 解析”。Codex / opencode 这类工具的关键结构是：

- 用户消息先成为会话线程里的持久 message / part。
- Agent run 关联这条用户消息，并在同一线程里追加模型输出、工具调用、工具结果、审批、checkpoint 和最终回复。
- 模型调用不是只拼一段聊天文本，而是由 instructions / developer 权限说明 / 当前会话历史 / 上下文资产引用 / 工具 schema / 当前用户 turn 共同组成。
- 模型如果返回 tool call，后端执行工具，把 observation 作为同一轮输入追加回模型，循环到模型停止调用工具并输出 assistant message。
- 长历史不能全部塞进 prompt；需要保留最近尾部、压缩旧内容、把大工具输出资产化，并按需读取证据。

## 本轮已修正

- `/planning-chat/start` 现在会立即写入当前会话的用户消息，并让 run 记录 `userMessageId`。
- `runPlanningChat` 不再等 Agent 成功结束后才创建用户消息，成功时只追加 assistant 消息。
- 取消或失败会回滚本轮业务资料，但不删除用户刚发送的会话消息。
- 策划 prompt 的 `historyTail` 改为只读取当前会话分支，避免 AI 实际读到其它会话尾部。
- 前端收到 start 结果后立即同步真实消息页，乐观消息只作为短暂兜底。

## 对照来源

- OpenAI Codex agent loop：Codex 的循环是用户输入 -> 模型推理 -> 工具调用 -> 工具结果回填 -> 继续推理，直到 assistant message 结束一轮。
  https://openai.com/index/unrolling-the-codex-agent-loop/
- OpenAI Codex prompt 结构：Responses 请求核心由 `instructions`、`tools`、`input` 构成；工具是 schema 化定义，权限和工作区等由 developer/context item 注入。
  https://openai.com/index/unrolling-the-codex-agent-loop/
- Codex 上下文管理：长线程需要 prompt caching、自动 compaction 和稳定前缀；不能把全部历史和大工具输出一直塞进 prompt。
  https://openai.com/index/unrolling-the-codex-agent-loop/
- opencode `session/prompt.ts`：opencode 的会话层有 SessionPrompt、SessionProcessor、ToolRegistry、Permission、MCP、LSP、Compaction、Revert 等服务；用户消息创建时记录 session、agent、model、tools、parts，工具 part 按运行状态更新。
  https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/prompt.ts

## 仍需继续校准

- Pi 具体指哪个项目还不明确；如果是 Inflection Pi，它不是 Codex/opencode 这种本地工具 Agent，不能直接作为工具调用架构参照。如果用户指的是某个开源 Agent，需要补仓库地址再对照。
- 本项目已经有原生 tools 兼容层，但会话 item 还没有完全像 Codex/opencode 那样把每个 tool call / observation / approval 都作为一等消息 part 渲染。
- 上下文压缩已有基础，但还没到 Codex `/responses/compact` 那种模型原生压缩 item；目前仍是项目侧摘要和资产引用。
- UI 还需要继续把“当前会话消息流”作为第一主体，把历史、审计、工具过程做成消息内可展开事件，而不是抽屉里堆调试信息。
