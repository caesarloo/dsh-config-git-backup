# @caesarloo/dsh-config-git-backup

[English](#english) | [中文](#中文)

---

## English

A DeepSeek Harness tool plugin that versions DSH **sources** — config, custom skills and plugin sources — in a local git repository, and restores them onto a fresh or repaired host. The agent calls it as the `dsh_config_git_backup` tool.

### What it does

Registers one tool with two modes:

- **`backup`** — copy live sources (your `~/.dsh` config + skills, plus the local plugin source dir) into the configured git repo, then `git add -A && git commit`;
- **`restore`** — copy the repo content back onto the live sources (reinstall / new machine / multi-host sync). **Destructive**: it overwrites live files, so it is fail-closed — see Safety below.

The plugin is a thin driver: **the actual sync logic lives in the `sync.ps1` you point it at** (contract: `-Mode backup | restore`, plus the optional `-DryRun` / `-Force` switches; a typical implementation uses `robocopy` with `node_modules` excluded). Paths are never hard-coded in the source — everything comes from config or environment.

The intended workflow: keep plugin / skill / config **sources** versioned in a git repo (optionally mirrored to a NAS or cloud drive) so any host can reproduce the exact environment. Sensitive data (`.credentials.yaml`, `sessions/`, `storages/`, `.env`) is deliberately **not** synced.

### Safety (since 0.2.0)

`restore` overwrites the live sources, so it is protected in three layers:

1. **Tool-level confirmation gate (fail-closed)** — a `restore` without `confirm: true` writes **nothing**: it first takes a `-DryRun` diff, then fails with the list of items that would be added / overwritten plus the confirmation requirement.
2. **Script-level gate** — `sync.ps1 -Mode restore` refuses to run without `-Force`; `-DryRun` only previews. Directory sync uses `robocopy /E` rather than `/MIR`, so it **never purges** — files unique to the live sources survive.
3. **Pre-overwrite snapshot** — before a `-Force` restore, the live sources are snapshotted to `<DSH_HOME>/vet/restore-snapshots/<timestamp>/` (with a `manifest.txt` recording what will be overwritten / kept); the last 10 snapshots are retained.

`backup` adds a **landed-content check**: after syncing it compares every file by SHA256 and **errors out** if anything did not land, so a silent `robocopy` skip (same size + same mtime) can no longer be reported as success.

### Install

```sh
dsh plugin --profile web add @caesarloo/dsh-config-git-backup
```

Restart dsh afterwards (bundle-level change, not hot-reloaded). Verify:

```powershell
dsh --profile web --dump-config | Select-String tool-dsh-config-git-backup
```

### Dependencies (since 0.2.1)

The plugin declares **no runtime `dependencies`**. The host (DSH itself) provides `@deepseek-ai/dsh-tools` (`defineTool`) and `@deepseek-ai/dsh-subprocess` (`ctx.subprocess`); both are declared only as `optional: true` peerDependencies.

- **Why**: `dsh-tools` registers its tool runtime with `Symbol('@deepseek-ai/dsh-tools.scheduler')`, and a `Symbol` is **locally unique** (not `Symbol.for`). If the package manager installs a second real copy inside the profile, plugins and the host resolve **two module instances / two symbols** → tool registration no longer matches and every tool call in that turn fails. Declaring them as non-optional peers would reintroduce that second copy, hence `optional: true`.
- The `devDependencies` copies exist only in a development clone for `tsc` type-checking and the smoke test; they are not part of the published artifact.
- If a profile was polluted by an older version, upgrade the plugin and move the leftover real directories away; pinning the host instance through `overrides` in `pnpm-workspace.yaml` prevents a repeat.

### Configuration

Provide via the profile patch layer (`cordis.patch.yml`) or environment variables. With neither set, the tool runs **fail-closed** (every call errors).

| Config key | Env var | Meaning |
|---|---|---|
| `repoDir` | `DSH_CONFIG_GIT_BACKUP_REPO_DIR` | Target git repository directory |
| `syncScript` | `DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT` | Full path of your `sync.ps1` (defaults to `sync.ps1` inside `repoDir`) |
| `powershell` | — | PowerShell executable (Windows PowerShell on win32, `pwsh` elsewhere) |

Example patch:

```yaml
- id: tool-dsh-config-git-backup
  config:
    repoDir: '<backup repo path>'
    syncScript: '<backup repo path>\sync.ps1'
```

### Usage

```
dsh_config_git_backup({ mode: 'backup', message: 'update skill my-skill' })         # sync + git commit
dsh_config_git_backup({ mode: 'backup', dryRun: true })                            # preview what would be written
dsh_config_git_backup({ mode: 'restore', dryRun: true })                           # preview what would be overwritten
dsh_config_git_backup({ mode: 'restore', confirm: true })                          # confirm: snapshot, then overwrite
```

`dryRun` and `confirm` cannot both be `true`. `message` is normalized: control characters flattened, whitespace collapsed to single spaces, truncated to 200 characters; the default is `backup: <timestamp>`.

### Notes & limits

- **`sync.ps1` contract** — implement `-Mode backup` / `-Mode restore` copying between the live sources and the repo, excluding `node_modules/` and anything else you do not want versioned. To get the 0.2.0 protections from a custom script, also accept `-DryRun` (preview, no writes) and `-Force` (acknowledge a destructive restore; snapshot first). The plugin performs the git commit for `backup`, and for `restore` refuses without `confirm` and reports the snapshot path.
- **Never sync host-private secrets.** The reference `sync.ps1` keeps `profiles/web/cordis.patch.yml` out of its item list (it holds a local relay token and machine-specific absolute paths); only a sanitized `cordis.patch.yml.example` is versioned. A repo-side `.gitignore` additionally excludes `.credentials.yaml`, `sessions/`, `storages/`, `.env`, `node_modules/`, `dist/`.
- **Platform** — the reference `sync.ps1` uses `robocopy` + Windows PowerShell (and reports UTF-8 output; its SHA256 check uses .NET rather than `Get-FileHash`). On non-Windows you supply your own sync script; the plugin itself is cross-platform (`ctx.subprocess`, `node:path`).
- **Not a session/memory backup tool** — it versions *sources* (config / skills / plugins), not runtime state.
- Runs through `ctx.subprocess` (host layer, outside sandbox restrictions).
- **Tests** — `npm test` drives the built tool against a throwaway sandbox (fake Cordis ctx, real subprocess, path-rewritten `sync.ps1`) and asserts the confirm gate, dry-run, snapshot, message normalization and fail-closed behavior; the suite never reads or overwrites the real `~/.dsh`. The companion `test/sync-protection-tests.ps1` exercises the sync-script contract (preview / refusal / snapshot / landed-content verify) and needs no plugin install.

### License

MIT

---

## 中文

一个 DeepSeek Harness 工具插件：把 DSH 的**源文件**（配置、自定义技能、插件源码）版本化到一个本地 git 仓库，并能把它们还原到新机器或修复后的机器上。Agent 通过 `dsh_config_git_backup` 工具调用它。

### 功能

注册一个工具，两种模式：

- **`backup`** —— 把活跃源（`~/.dsh` 的配置与技能，以及本地插件源码目录）复制进配置的 git 仓库，然后 `git add -A && git commit`；
- **`restore`** —— 把仓库内容复制回活跃源（重装 / 新机器 / 多机同步）。**破坏性**：会覆盖活跃源文件，因此是 fail-closed（见「安全约定」）。

插件本身只是薄驱动：**真正的同步逻辑在你指定的 `sync.ps1` 里**（契约：`-Mode backup | restore`，外加可选的 `-DryRun` / `-Force`；典型实现用 `robocopy` 并排除 `node_modules`）。源码中不硬编码任何路径——一切都来自配置或环境变量。

适用场景：把插件 / 技能 / 配置的**源文件**放进 git 仓库版本化（可选再镜像到 NAS 或云盘），这样任何一台机器都能复现同样的环境。敏感数据（`.credentials.yaml`、`sessions/`、`storages/`、`.env`）**刻意不同步**。

### 安全约定（0.2.0 起）

`restore` 会用仓库版本覆盖活跃源，未提交的本地改动会丢，因此有三层保护：

1. **工具层确认门（fail-closed）** —— `restore` 不带 `confirm: true` 时**不写入任何东西**：它先以 `-DryRun` 取一份差异，然后把「会被新增 / 覆盖的清单」连同确认要求一起报错返回。
2. **脚本层闸门** —— `sync.ps1 -Mode restore` 没有 `-Force` 直接拒绝执行，`-DryRun` 只预览。目录同步用 `robocopy /E` 而非 `/MIR`，**不做 purge 删除**——活跃源独有的文件不会被删。
3. **覆盖前快照** —— `-Force` 执行还原前，先把活跃源快照到 `<DSH_HOME>/vet/restore-snapshots/<时间戳>/`（含 `manifest.txt`，记录将覆盖 / 保留的清单），只保留最近 10 份。

`backup` 另加**落库校验**：同步完成后逐文件比对 SHA256，仍有未落库项即**报错退出**，不再把「同步实际没生效」（如 robocopy 因同尺寸同时间戳静默跳过）记成成功。

### 安装

```sh
dsh plugin --profile web add @caesarloo/dsh-config-git-backup
```

装完**重启 dsh**（bundle 层变更，不随热重载生效）。验证：

```powershell
dsh --profile web --dump-config | Select-String tool-dsh-config-git-backup
```

### 依赖约定（0.2.1 起）

插件**不声明任何 runtime `dependencies`**。它用到的 `@deepseek-ai/dsh-tools`（`defineTool`）与 `@deepseek-ai/dsh-subprocess`（`ctx.subprocess`）**由宿主（DSH 主包）提供**，二者只以 `optional: true` 的 peerDependencies 声明。

- **原因**：`dsh-tools` 用 `Symbol('@deepseek-ai/dsh-tools.scheduler')` 注册工具运行时，而 `Symbol` 是**局部唯一**的（不是 `Symbol.for`）。若包管理器在 profile 里再装一份真实副本，插件与主包会解析到**两个模块实例、两个 Symbol** → 工具注册与读取不匹配，该轮所有工具调用全线失败。把这两个包写成非 optional 的 peer 会重新引入那份副本，所以必须是 `optional: true`。
- `devDependencies` 里的同版本包只存在于开发克隆，用于 `tsc` 类型检查与冒烟测试，不随发布产物分发。
- 若某个 profile 曾被旧版污染，升级本插件后还要把残留的真实目录移走；在 `pnpm-workspace.yaml` 里用 `overrides` 把宿主实例钉住可防复发。

### 配置

通过 profile 的 patch 层（`cordis.patch.yml`）或环境变量提供；两者都缺省时工具 **fail-closed**（每次调用都报错）。

| 配置键 | 环境变量 | 含义 |
|---|---|---|
| `repoDir` | `DSH_CONFIG_GIT_BACKUP_REPO_DIR` | 目标 git 仓库目录 |
| `syncScript` | `DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT` | 你的 `sync.ps1` 完整路径（缺省为 `repoDir` 下的 `sync.ps1`） |
| `powershell` | — | PowerShell 可执行文件（win32 缺省 Windows PowerShell，其它平台 `pwsh`） |

配置示例：

```yaml
- id: tool-dsh-config-git-backup
  config:
    repoDir: '<备份仓库路径>'
    syncScript: '<备份仓库路径>\sync.ps1'
```

### 用法示例

```
dsh_config_git_backup({ mode: 'backup', message: '更新技能 my-skill' })          # 同步 + git commit
dsh_config_git_backup({ mode: 'backup', dryRun: true })                        # 预览将写入仓库的差异
dsh_config_git_backup({ mode: 'restore', dryRun: true })                       # 预览将被覆盖的活跃源项
dsh_config_git_backup({ mode: 'restore', confirm: true })                      # 确认还原（先快照，再覆盖）
```

`dryRun` 与 `confirm` 不能同时为 `true`。`message` 会被规范化：控制字符压平、空白折叠成单空格、截断到 200 字符，缺省为 `备份: <时间戳>`。

### 说明与限制

- **`sync.ps1` 契约** —— 实现 `-Mode backup` / `-Mode restore`，在活跃源与仓库之间复制，排除 `node_modules/` 以及任何你不想版本化的内容。要用上 0.2.0 的保护，自定义脚本还需接受 `-DryRun`（只预览、不写入）与 `-Force`（确认破坏性还原，先做快照）。`backup` 的 git 提交由插件完成；`restore` 缺 `confirm` 时插件直接拒绝，并报告快照路径。
- **绝不同步含主机私密信息的文件。** 参考实现的 `sync.ps1` 刻意把 `profiles/web/cordis.patch.yml` 排除在同步项之外（它含本地转发口令与机器专属绝对路径），仓库里只放脱敏模板 `cordis.patch.yml.example`。仓库侧 `.gitignore` 另排除 `.credentials.yaml`、`sessions/`、`storages/`、`.env`、`node_modules/`、`dist/`。
- **平台** —— 参考实现的 `sync.ps1` 使用 `robocopy` + Windows PowerShell（并输出 UTF-8，其 SHA256 校验用 .NET 而非 `Get-FileHash`）。在非 Windows 上请自备同步脚本；插件本身跨平台（`ctx.subprocess`、`node:path`）。
- **不是会话 / 记忆备份工具** —— 它版本化的是**源文件**（配置 / 技能 / 插件），不是运行时状态。
- 通过 `ctx.subprocess`（host 层）执行，不受沙箱限制。
- **测试** —— `npm test` 用一次性沙箱驱动构建产物（假 Cordis ctx、真实 subprocess、路径重写后的 `sync.ps1`），断言确认门、dry-run、快照、消息规范化与 fail-closed 行为；测试套件绝不读写真实的 `~/.dsh`。配套的 `test/sync-protection-tests.ps1` 覆盖同步脚本契约（预览 / 拒绝 / 快照 / 落库校验），无需安装插件即可运行。

### License

MIT
