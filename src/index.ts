// dsh-config-git-backup — 把 DSH 配置备份/还原封装为模型可调用的工具插件。
//
// 活跃源（被 DSH 实际读取/加载）：
//   - ~/.dsh/AGENTS.md、settings.yaml、profiles/web/*      (配置)
//   - ~/.dsh/skills/                                        (技能)
//   - <plugins 源目录>                                       (插件)
// 备份目标：本机 dsh git 仓库（定期备份，非活跃源）。
//
// 路径全部由配置提供（config.repoDir / config.syncScript，或环境变量
// DSH_CONFIG_GIT_BACKUP_REPO_DIR / DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT），源码不含任何本机路径。
//
// 本工具复用仓库根部的 sync.ps1（robocopy 实现目录同步并排除 node_modules），
// 之后对仓库执行 git add/commit，一步完成"备份留档"。还原方向同样走
// sync.ps1 -Mode restore，把仓库内容拷回活跃源。
//
// 用法示例（模型视角）：
//   dsh_config_git_backup({ mode: 'backup', message: '更新技能 weather-query' })
//   dsh_config_git_backup({ mode: 'restore' })

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
// 类型侧引入 subprocess 服务声明（扩展 Context.subprocess 类型；编译时擦除）
import type {} from '@deepseek-ai/dsh-subprocess'

// Plugin display name, shown in loader diagnostics.
export const name = 'tool-dsh-config-git-backup'

export const inject = ['tools', 'subprocess']

// 本机路径不再硬编码于源码：由 cordis patch 的 config 注入
// （repoDir / syncScript），缺失时回落到环境变量 DSH_CONFIG_GIT_BACKUP_REPO_DIR
// / DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT，再无则工具执行时报错（fail-closed）。

const POWERSHELL =
  process.platform === 'win32'
    ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    : 'pwsh'

const RAW_OUTPUT_MAX_BYTES = 2 * 1024 * 1024 // 2 MiB
const STDERR_MAX_BYTES = 256 * 1024
const GRACE_MS = 3000
const TIMEOUT_MS = 120000

export interface DshConfigGitBackupConfig {
  /** dsh 备份仓库目录；缺省回落环境变量 DSH_CONFIG_GIT_BACKUP_REPO_DIR。 */
  repoDir?: string
  /** sync.ps1 完整路径；缺省回落环境变量 DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT。 */
  syncScript?: string
  /** 运行 sync.ps1 的 PowerShell 可执行文件路径。 */
  powershell?: string
}

interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises')
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

async function run(
  ctx: Context,
  argv: string[],
  signal: AbortSignal,
  cwd?: string,
): Promise<RunResult> {
  let handle
  try {
    handle = ctx.subprocess.spawn({
      argv,
      cwd: cwd ?? process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: RAW_OUTPUT_MAX_BYTES },
        stderr: { maxBytes: STDERR_MAX_BYTES },
      },
      graceMs: GRACE_MS,
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw new Error('dsh_config_git_backup was aborted before completion')
    throw new Error(`dsh_config_git_backup failed to start: ${String(error)}`)
  }

  let outcome
  try {
    outcome = await handle.done
  } catch (error) {
    throw new Error(`dsh_config_git_backup failed to start: ${String(error)}`)
  }
  if (signal.aborted) throw new Error('dsh_config_git_backup was aborted before completion')
  if (outcome.signal !== null || outcome.exitCode === null) {
    throw new Error(`dsh_config_git_backup was killed by signal ${outcome.signal ?? '(unknown)'}`)
  }

  const stdout = handle.collected.stdout?.readFrom(0)
  const stderr = handle.collected.stderr?.readFrom(0)
  return {
    exitCode: outcome.exitCode,
    stdout: stdout?.text ?? '',
    stderr: stderr?.text ?? '',
  }
}

function currentStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function apply(ctx: Context, config: DshConfigGitBackupConfig = {}) {
  const repoDir = config.repoDir ?? process.env.DSH_CONFIG_GIT_BACKUP_REPO_DIR
  const syncScript =
    config.syncScript ??
    process.env.DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT ??
    (repoDir ? `${repoDir}\\sync.ps1` : undefined)
  const powershell = config.powershell ?? POWERSHELL
  if (!repoDir || !syncScript) {
    ctx.logger.warn(
      '[tool-dsh-config-git-backup] 未配置备份仓库路径（config.repoDir/syncScript 或环境变量 ' +
        'DSH_CONFIG_GIT_BACKUP_REPO_DIR/DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT），工具将以 fail-closed 运行：调用即报错。',
    )
  }

  ctx.tools.register(defineTool({
    name: 'dsh_config_git_backup',
    description:
      'Back up or restore DSH configuration, custom skills and plugins against the local dsh git repository ' +
      '(configured via plugin config or the DSH_CONFIG_GIT_BACKUP_REPO_DIR / DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT environment variables). ' +
      'Mode "backup" copies live sources (~/.dsh config + skills, the local plugins source dir) into the repo and commits them; ' +
      'mode "restore" copies the repo content back to the live sources (for reinstall / new machine). ' +
      'Optionally pass a commit message.',

    parameters: {
      mode: {
        type: 'string',
        required: true,
        description: '"backup" (live sources → repo + git commit) or "restore" (repo → live sources).',
      },
      message: {
        type: 'string',
        description:
          'Optional commit message for backup mode. Defaults to "备份: <timestamp>" (repository history language).',
      },
    },

    output: {
      schema: {
        type: 'object',
        properties: {
          stdout: { type: 'string', required: true, description: 'Combined command output.' },
          stderr: { type: 'string', required: true, description: 'Combined stderr.' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            (value.stdout?.trim?.()?.length ?? 0) > 0
              ? value.stdout
              : value.stderr?.trim?.()?.length > 0
                ? `(no stdout) ${value.stderr}`
                : '(empty output)',
        },
      ],
    },

    timeoutMs: TIMEOUT_MS,

    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('dsh_config_git_backup was aborted before completion')
      const mode = String(args.mode ?? 'backup').toLowerCase()
      if (mode !== 'backup' && mode !== 'restore') {
        throw new Error(`dsh_config_git_backup: mode 必须是 "backup" 或 "restore"，收到 "${mode}"`)
      }
      if (!repoDir || !syncScript) {
        throw new Error(
          'dsh_config_git_backup: 未配置备份仓库。请通过插件 config（repoDir/syncScript）或环境变量 ' +
            'DSH_CONFIG_GIT_BACKUP_REPO_DIR / DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT 指定路径。',
        )
      }
      if (!exec.signal.aborted && !(await fileExists(syncScript))) {
        throw new Error(`dsh_config_git_backup: sync.ps1 不存在: ${syncScript}`)
      }

      const logs: string[] = []

      // 1) 同步（robocopy 排除 node_modules）
      const sync = await run(
        ctx,
        [powershell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', syncScript, '-Mode', mode],
        exec.signal,
        repoDir,
      )
      logs.push(`[sync.ps1 exit ${sync.exitCode}]`)
      if (sync.stdout.trim().length > 0) logs.push(sync.stdout.trim())
      if (sync.stderr.trim().length > 0) logs.push(`stderr: ${sync.stderr.trim()}`)
      if (sync.exitCode !== 0) {
        throw new Error(`dsh_config_git_backup ${mode} 同步失败 (exit ${sync.exitCode}):\n${logs.join('\n')}`)
      }

      // 2) backup 模式：git 留档
      if (mode === 'backup') {
        const add = await run(ctx, ['git', '-C', repoDir, 'add', '-A'], exec.signal, repoDir)
        if (add.exitCode !== 0) {
          throw new Error(`dsh_config_git_backup git add 失败 (exit ${add.exitCode}): ${add.stderr || add.stdout}`)
        }
        const message = String(args.message ?? `备份: ${currentStamp()}`)
        const commit = await run(
          ctx,
          ['git', '-C', repoDir, 'commit', '-m', message],
          exec.signal,
          repoDir,
        )
        if (commit.exitCode !== 0) {
          const combined = `${commit.stderr}\n${commit.stdout}`
          if (/nothing to commit|no changes added|无.*提交|nothing added/i.test(combined)) {
            logs.push('[git] 无变更可提交（内容已一致）')
          } else {
            throw new Error(`dsh_config_git_backup git commit 失败 (exit ${commit.exitCode}):\n${combined}`)
          }
        } else {
          logs.push(commit.stdout.trim() || `[git] 已提交: ${message}`)
        }
        const status = await run(ctx, ['git', '-C', repoDir, 'status', '-sb'], exec.signal, repoDir)
        if (status.exitCode === 0 && status.stdout.trim().length > 0) {
          logs.push(`[git status] ${status.stdout.trim()}`)
        }
      } else {
        logs.push('[restore] 已还原到活跃源；如涉及 profiles/bundle 变更需重启 DSH 生效')
      }

      return { stdout: logs.join('\n'), stderr: '' }
    },
  }))

  console.log(`[tool-dsh-config-git-backup] registered "dsh_config_git_backup" — repo=${repoDir}`)
}
