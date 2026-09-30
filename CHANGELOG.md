# Changelog

All notable changes to this package are documented in this file.
本文件记录本包的重要变更。

## [0.2.6] - 2026-09-30

**DSH 0.2.0 compatibility / DSH 0.2.0 兼容**

- Peer range moved to the 0.2.0 host line: `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-subprocess`
  are now declared as `^0.2.0-rc.2` (previously `^0.1.5-rc.2`).
- devDependencies aligned with the same line, and `@deepseek-ai/cordis` pinned to `~4.0.4`
  (the range the 0.2.0 host itself requires).
- 适配 DSH 0.2.0：宿主自 0.2.0 起会拒绝装配 peer 不兼容的插件（启动时报 `skipping profile bundle`）。
  本次把 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-subprocess` 的 peer 范围收敛到 `^0.2.0-rc.2`，
  devDependencies 同步到 0.2.0 线，`@deepseek-ai/cordis` 对齐 `~4.0.4`。
- No source changes were required: `defineTool`, `ctx.tools.register`, `ctx.subprocess.spawn`,
  `handle.done` and `handle.collected.*.readFrom(0).text` are unchanged in the 0.2.0 host.
- 代码无需改动：`defineTool`、`ctx.tools.register`、`ctx.subprocess.spawn`、`handle.done`、
  `handle.collected.*.readFrom(0).text` 等宿主契约在 0.2.0 中均未变化。
