# @caesarloo/dsh-config-git-backup

> DSH 配置/技能/插件「git 仓库备份 + 还原」工具插件（model-callable）。
> A DeepSeek Harness tool plugin that backs up / restores DSH config, custom skills and plugin sources against a local git repository, callable by the agent as the `dsh_config_git_backup` tool.
>
> 发布名 `@caesarloo/dsh-config-git-backup`（裸名 `dsh-backup` 已被他人占用并 deprecated；本项目曾用名 `@caesarloo/dsh-git-backup`）。

## What it does / 功能

Registers one tool, `dsh_config_git_backup`, with two modes:

- `backup` — copy live sources (your `~/.dsh` config + skills + the local plugin source dir) into the configured git repo, then `git add -A && git commit`;
- `restore` — copy the repo content back to the live sources (reinstall / new machine / multi-host sync). **Destructive**: it overwrites live files, so it is fail-closed (see Safety below).

The plugin itself is a thin driver: **the actual sync logic lives in a `sync.ps1` you point it at** (interface contract: `-Mode backup | restore`, plus the optional `-DryRun` / `-Force` switches described below; typical implementation uses `robocopy` with `node_modules` excluded). Paths are never hard-coded in source — everything comes from config or environment (see below).

Designed for the workflow: keep plugin/skill/config **sources** versioned in a git repo (optionally mirrored to a NAS/cloud drive) so a fresh host can reproduce the exact environment; sensitive data (`.credentials.yaml`, `sessions/`, `storages/`, `.env`) is deliberately **not** synced.

## Safety / 安全约定（0.2.0 起）

`restore` 用仓库版本覆盖活跃源，未提交的本地改动会丢。三层保护（工具层 → 脚本层 → 快照）：

1. **工具层确认门（fail-closed）**：`restore` 不带 `confirm: true` 时**不写入任何东西** —— 它会先以 `-DryRun` 取一份差异，然后把"会被新增/覆盖的清单"连同确认要求一起报错返回。
2. **脚本层闸门**：`sync.ps1 -Mode restore` 没有 `-Force` 直接拒绝执行；`-DryRun` 只预览。目录同步用 `robocopy /E` 而非 `/MIR`，**不做 purge 删除**（活跃源独有的文件不会被删）。
3. **覆盖前快照**：`-Force` 执行还原前，先把活跃源快照到 `<DSH_HOME>/vet/restore-snapshots/<时间戳>/`（含 `manifest.txt`，记录将覆盖/保留的清单），只保留最近 10 份。

另有 **落库校验**：`backup` 同步完成后逐文件比对 SHA256，仍有未落库项即**报错退出**，不再把"同步实际没生效"（如 robocopy 因同尺寸同时间戳静默跳过）记成成功。

## Install / 安装

```sh
# 将 <package-name> 替换为实际发布包名（本项目曾用名 dsh-backup 已被他人占用并 deprecated）
dsh plugin --profile web add <package-name>
```

## Configuration / 配置

Provide via the profile patch layer (`cordis.patch.yml`) or environment variables; both unset → tool runs **fail-closed** (every call errors):

| Config key | Env var | Meaning |
|---|---|---|
| `repoDir` | `DSH_CONFIG_GIT_BACKUP_REPO_DIR` | Target git repo directory |
| `syncScript` | `DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT` | Full path to your `sync.ps1` (defaults to `sync.ps1` inside `repoDir`, joined with the platform separator) |
| `powershell` | — | PowerShell executable (defaults to Windows PowerShell on win32, `pwsh` elsewhere) |

Example patch:

```yaml
- id: tool-dsh-config-git-backup
  config:
    repoDir: 'C:\workspace\dsh'
    syncScript: 'C:\workspace\dsh\sync.ps1'
```

## Usage (agent view) / 用法示例

```
dsh_config_git_backup({ mode: 'backup', message: 'update skill weather-query' })   # sync + git commit
dsh_config_git_backup({ mode: 'backup', dryRun: true })                            # 预览将写入仓库的差异
dsh_config_git_backup({ mode: 'restore', dryRun: true })                           # 预览将被覆盖的活跃源项
dsh_config_git_backup({ mode: 'restore', confirm: true })                          # 确认还原（先快照，再覆盖）
```

`dryRun` 与 `confirm` 不能同时为 `true`。`message` 会规范化：控制字符压平、空白折叠成单空格、截断到 200 字符，缺省 `备份: <timestamp>`。

## Notes & limits / 说明与限制

- **sync.ps1 contract**: implement `-Mode backup` / `-Mode restore` copying between the live sources and the repo; exclude `node_modules/` (and anything you don't want versioned). To get the 0.2.0 protections from a custom script, also accept `-DryRun` (preview, no writes) and `-Force` (acknowledge a destructive restore, snapshot first); the plugin passes them, and a script that rejects unknown switches will simply make `dryRun`/`confirm` unusable while plain `backup` keeps working. The plugin handles git commit (backup) and, for restore, refuses without `confirm` and logs the snapshot path.
- **Do not sync files that carry host-private secrets.** The reference `sync.ps1` deliberately keeps `profiles/web/cordis.patch.yml` out of its item list (it holds a local relay token and machine-specific absolute paths); only a sanitized `cordis.patch.yml.example` is versioned. Repo-side `.gitignore` additionally excludes `.credentials.yaml`, `sessions/`, `storages/`, `.env`, `node_modules/`, `dist/`.
- **Platform**: the reference `sync.ps1` uses `robocopy` + Windows PowerShell (and reports UTF-8 output so Chinese text survives the pipe; its SHA256 check uses .NET instead of `Get-FileHash`, which Windows PowerShell 5.1 cannot autoload when a pwsh 7 `PSModulePath` is inherited). On non-Windows you supply your own sync script; the plugin itself is cross-platform (uses `ctx.subprocess`, `node:path`).
- **Not a session/memory backup tool**: it versions *sources* (config/skills/plugins), not runtime state.
- Runs through `ctx.subprocess` (host layer, outside sandbox restrictions).
- **Tests**: `npm test` runs `test/smoke.mjs`, which drives the built tool against a throwaway sandbox (fake Cordis ctx, real subprocess, path-rewritten `sync.ps1`) and asserts the confirm gate, dry-run, snapshot, message normalization and fail-closed behavior. `test/sync-protection-tests.ps1` is the companion harness for the **sync-script contract** on this machine (it copies `C:\workspace\dsh\sync.ps1` into a sandbox, rewrites its path variables and asserts both directions, the snapshot, and the SHA256 verify) — run it with either `powershell` or `pwsh`; it needs no plugin install and never touches live sources.

## License

MIT
