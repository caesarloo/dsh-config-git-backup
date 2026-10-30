# Changelog

All notable changes to this package are documented in this file.
本文件记录本包的重要变更。

## [0.2.9] - 2026-10-30

**Bundle entry now imports the scoped package name and a manifest gate is added /
bundle 入口改用包实名，并新增发布清单门禁**

- `cordis.patch.yml` 的 insert `name` 由裸名 `dsh-config-git-backup` 改为包实名
  `@caesarloo/dsh-config-git-backup`。宿主按该 specifier `import()` 解析插件：裸名在 npm 上并不存在，
  因此按 README 的 scoped 安装命令装到新机时 entry 解析失败、宿主只写一行日志后**静默跳过该插件**；
  本机此前是靠 profile 的 npm 别名依赖（`"dsh-config-git-backup": "npm:@caesarloo/…"`）才恰好对上。
- **升级注意**：使用该别名依赖的 profile，升级到 0.2.9 后必须把依赖键改为 scoped 名
  （`dsh plugin add @caesarloo/dsh-config-git-backup`，或把 package.json 的依赖键改成
  `"@caesarloo/dsh-config-git-backup": "0.2.9"` 后 `pnpm install`），再重启 DSH；否则 insert 名
  解析不到、插件同样静默不加载。
- 新增发布门禁 `scripts/check-manifest.mjs`（移植自 vision 插件）：校验入口存在、patch 被 `files`
  包含、`insert.name` 必须等于包名、`engines.dsh` 非空；已并入 `npm test`。
- 新增 `pretest: npm run build`：`npm test` 现在测的是刚构建的 `dist/`。
- 已在 DSH **0.2.1-rc.5** 桌面端复验（2026-10-30）：`defineTool`、`ctx.tools.register`、
  `ctx.subprocess.spawn` 与 handle 链路均未变化；0.2.1-rc.3 → rc.5 之间插件契约面逐字节零变化。

- The insert `name` in `cordis.patch.yml` now uses the scoped package name
  (`@caesarloo/dsh-config-git-backup`) instead of the bare `dsh-config-git-backup`. The host
  `import()`s that specifier; the bare name is not an npm package, so a fresh install via the
  README's scoped command failed to resolve and the host skipped the entry with a single log line.
  This machine only worked because the profile used an npm alias dependency
  (`"dsh-config-git-backup": "npm:@caesarloo/…"`).
- **Upgrade note**: profiles installed through that alias must re-add the dependency under the
  scoped key (or change the dependency key to `"@caesarloo/dsh-config-git-backup": "0.2.9"` and run
  `pnpm install`) before restarting DSH, otherwise the insert name no longer resolves.
- Added the `scripts/check-manifest.mjs` release gate (ported from the vision plugin): entry points
  exist, the patch ships inside `files`, `insert.name` equals the package name, and `engines.dsh` is
  present. It is wired into `npm test`.
- Added `pretest: npm run build`, so `npm test` exercises the freshly built `dist/`.
- Re-verified on the DSH **0.2.1-rc.5** desktop host (2026-10-30): `defineTool`,
  `ctx.tools.register`, `ctx.subprocess.spawn` and the handle chain are unchanged; the plugin-facing
  contract surface is byte-identical between 0.2.1-rc.3 and rc.5.

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
