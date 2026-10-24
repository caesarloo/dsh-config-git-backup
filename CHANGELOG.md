# Changelog

All notable changes to this package are documented in this file.
本文件记录本包的重要变更。

## [0.2.8] - 2026-10-24

**DSH 0.2.1-rc.3 re-verification, install docs corrected, 0.2.1 exemption file documented /
DSH 0.2.1-rc.3 复验、安装文档纠错、补充 0.2.1 豁免文件说明**

- Re-verified on the DSH 0.2.1-rc.3 desktop host: **no code changes were required**.
  `defineTool`, `ctx.tools.register`, `ctx.subprocess.spawn`, `handle.done` and
  `handle.collected.*.readFrom(0).text` are unchanged; `dsh_config_git_backup` in `backup` +
  `dryRun` mode completed normally.
- README install/verify commands no longer hardcode the retired CLI `web` profile: they show the
  profile-agnostic form, the desktop shape (Plugin page / bundled CLI) and the restart requirement.
- README documents the DSH 0.2.1 **exact-version exemption** file
  (`profiles/<profile>/compatibility.json`): if a restore or machine move should keep such a grant,
  add it to the `sync.ps1` item list — otherwise the out-of-range bundle is skipped again.
- README's machine-local `cordis.patch.yml` example still used the retired `web` path; it is now
  `profiles/<profile>/cordis.patch.yml`.
- `publishConfig.access: public` and a `prepublishOnly` gate (`build && test`) are declared, so a
  manual `npm publish` cannot ship an unbuilt or untested artifact.
- 已在 DSH 0.2.1-rc.3 桌面端复验：**无需改动代码**。`defineTool`、`ctx.tools.register`、
  `ctx.subprocess.spawn`、`handle.done`、`handle.collected.*.readFrom(0).text` 均未变化；
  `dsh_config_git_backup` 的 `backup` + `dryRun` 模式正常完成。
- README 安装/验证命令不再写死已退役的 CLI `web` profile：改为与 profile 无关的写法，并补充桌面端
  形态（插件页 / 桌面端自带 CLI）与「bundle 层改动需重启」。
- README 补充 DSH 0.2.1 的**精确版本豁免**文件 `profiles/<profile>/compatibility.json`：若希望在
  restore 或换机后保留该授权，应把它加入 `sync.ps1` 的同步项；否则超出范围的 bundle 会再次被跳过。
- README 中「机器专属 `cordis.patch.yml`」示例仍写着已退役的 `web` 路径，已改为
  `profiles/<profile>/cordis.patch.yml`。
- 声明 `publishConfig.access: public` 与 `prepublishOnly` 闸门（`build && test`），手工
  `npm publish` 不会发出未构建或未测过的产物。

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
