# 源码研究下载记录

本文件只记录为了研究 Agent 交互、工具调用展示和消息流结构而下载到本项目的外部源码。它们不参与项目运行，不是生产依赖。

## Codex

- 位置：`.research/openai-codex`
- 来源：OpenAI Codex 开源仓库
- 用途：研究 `ThreadItem`、流式 assistant 文本、命令 / 工具 cell 生命周期，以及工具开始、输出、完成如何归并为同一个可更新展示单元。
- 重点参考：
  - `codex-rs/tui/src/chatwidget/streaming.rs`
  - `codex-rs/tui/src/chatwidget/command_lifecycle.rs`
  - `codex-rs/tui/src/chatwidget/protocol.rs`
- 删除方式：删除 `.research/openai-codex` 目录即可，不影响本项目运行。

## opencode

- 位置：`.research/opencode`
- 来源：opencode 开源仓库
- 用途：研究 `Message.Parts`、`TextContent`、`ToolCall`、`ToolResult` 的统一消息部件结构，以及 TUI 如何把工具调用与工具结果合并渲染。
- 重点参考：
  - `internal/message/content.go`
  - `internal/tui/components/chat/message.go`
- 删除方式：删除 `.research/opencode` 目录即可，不影响本项目运行。

## Claude Agent SDK Python

- 位置：`.research/claude-agent-sdk-python`
- 来源：Claude Agent SDK Python 开源仓库
- 用途：研究 `AssistantMessage.content` 的 block 化结构，以及 `TextBlock`、`ThinkingBlock`、`ToolUseBlock`、`ToolResultBlock` 的标准消息分块思路。
- 重点参考：
  - `src/claude_agent_sdk/types.py`
- 删除方式：删除 `.research/claude-agent-sdk-python` 目录即可，不影响本项目运行。

## Pi

- 位置：`.research/pi`
- 来源：Pi 开源 Agent 项目
- 用途：研究 `message_start / message_update / message_end`、`tool_execution_start / tool_execution_end` 这类事件协议，以及 provider stream 如何转成统一 Agent 事件流。
- 重点参考：
  - `packages/agent/src/types.ts`
  - `packages/agent/src/harness/agent-harness.ts`
  - `packages/ai/src/providers/openai-responses-shared.ts`
- 删除方式：删除 `.research/pi` 目录即可，不影响本项目运行。

## CodexDesktop-Rebuild

- 位置：`.research/CodexDesktop-Rebuild`
- 来源：Codex 桌面复刻项目
- 用途：辅助对照桌面 Agent 的线程、会话和展示结构，但当前实现优先参考 Codex、opencode、Claude Agent SDK 与 Pi 的一手源码。
- 删除方式：删除 `.research/CodexDesktop-Rebuild` 目录即可，不影响本项目运行。
