# @caesarloo/dsh-config-git-backup

> DSH 配置/技能/插件「git 仓库备份 + 还原」工具插件（model-callable）。
> A DeepSeek Harness tool plugin that backs up / restores DSH config, custom skills and plugin sources against a local git repository, callable by the agent as the `dsh_config_git_backup` tool.
>
> 发布名 `@caesarloo/dsh-config-git-backup`（裸名 `dsh-backup` 已被他人占用并 deprecated；本项目曾用名 `@caesarloo/dsh-git-backup`）。

## What it does / 功能

Registers one tool, `dsh_config_git_backup`, with two modes:

- `backup` — copy live sources (your `~/.dsh` config + skills + the local plugin source dir) into the configured git repo, then `git add -A && git commit`;
- `restore` — copy the repo content back to the live sources (reinstall / new machine / multi-host sync).

The plugin itself is a thin driver: **the actual sync logic lives in a `sync.ps1` you point it at** (interface contract: `-Mode backup | restore`; typical implementation uses `robocopy` with `node_modules` excluded). Paths are never hard-coded in source — everything comes from config or environment (see below).

Designed for the workflow: keep plugin/skill/config **sources** versioned in a git repo (optionally mirrored to a NAS/cloud drive) so a fresh host can reproduce the exact environment; sensitive data (`.credentials.yaml`, `sessions/`, `storages/`, `.env`) is deliberately **not** synced.

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
| `syncScript` | `DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT` | Full path to your `sync.ps1` (defaults to `<repoDir>\sync.ps1`) |
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
dsh_config_git_backup({ mode: 'restore' })                                          # repo → live sources
```

## Notes & limits / 说明与限制

- **sync.ps1 contract**: implement `-Mode backup` / `-Mode restore` copying between the live sources and the repo; exclude `node_modules/` (and anything you don't want versioned). The plugin calls it and then handles git commit (backup) or logs (restore).
- **Platform**: the reference `sync.ps1` uses `robocopy` (Windows). On non-Windows you supply your own sync script; the plugin itself is cross-platform (uses `ctx.subprocess`).
- **Not a session/memory backup tool**: it versions *sources* (config/skills/plugins), not runtime state.
- Runs through `ctx.subprocess` (host layer, outside sandbox restrictions).

## License

MIT
