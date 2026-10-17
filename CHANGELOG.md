# Changelog

All notable changes to this package are documented in this file.
本文件记录本包的重要变更。

## [0.2.7] - 2026-10-17

**DSH 0.2.1 compatibility declaration / DSH 0.2.1 兼容声明**

- Declare `engines.dsh` (`>=0.2.0-rc.2 <0.3.0`) and `dsh.manifestVersion: 1`. Since DSH 0.2.1 the
  host decides plugin compatibility by `engines.dsh` **first** and ignores `peerDependencies` when
  it is declared; the plugin manager reads the same fields before installing and refuses an
  unsatisfied package with `incompatible-version`. `manifestVersion: 1` declares the
  package-metadata format.
- No source changes were required for DSH 0.2.1-rc.2 (verified on the 0.2.1-rc.2 desktop host):
  `defineTool`, `ctx.tools.register`, `ctx.subprocess.spawn`, `handle.done` and
  `handle.collected.*.readFrom(0).text` are unchanged, and `dsh_config_git_backup` in
  `backup` + `dryRun` mode completed normally.
- 声明 `engines.dsh`（`>=0.2.0-rc.2 <0.3.0`）与 `dsh.manifestVersion: 1`。DSH 0.2.1 起宿主**优先按
  `engines.dsh` 判定**插件兼容性，声明了该字段就忽略 `peerDependencies`；插件管理器在安装前也读
  这两个字段，不满足时报 `incompatible-version`；`manifestVersion: 1` 声明包元数据格式。
- 0.2.1-rc.2 下**无需改动代码**（已在桌面端 0.2.1-rc.2 实测）：`defineTool`、`ctx.tools.register`、
  `ctx.subprocess.spawn`、`handle.done`、`handle.collected.*.readFrom(0).text` 均未变化，
  `dsh_config_git_backup` 的 `backup` + `dryRun` 模式正常完成。

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
