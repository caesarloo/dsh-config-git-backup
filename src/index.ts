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
// 安全约定（2026-09-13 起，对应审核项 D2/D3/D4/D5）：
//   - restore 是破坏性操作：必须显式传 confirm: true；缺省会先跑一次 sync.ps1 -DryRun
//     取差异，然后把差异连同确认要求一起报错返回（fail-closed，绝不静默覆盖）。
//     sync.ps1 侧另有第二道闸：没有 -Force 就拒绝执行，且执行前先做覆盖前快照。
//   - dryRun: true 只预览、不改动（backup / restore 都支持）。
//   - commit message 规范化：控制字符压平、空白折叠、长度截断到 200 字符。
//   - 跨平台路径拼接用 node:path.join，不再硬编码 Windows 分隔符。
//
// 用法示例（模型视角）：
//   dsh_config_git_backup({ mode: 'backup', message: '更新技能 weather-query' })
//   dsh_config_git_backup({ mode: 'restore', dryRun: true })     # 预览将被覆盖的项
//   dsh_config_git_backup({ mode: 'restore', confirm: true })    # 确认还原（先快照后覆盖）

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
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
const MESSAGE_MAX_CHARS = 200

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

// commit message 规范化：控制字符压平、空白折叠成单空格、超长截断。
// 既是 git 提交信息的卫生要求，也避免多行/超长 message 让提交记录难以阅读。
function normalizeMessage(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  const flat = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length === 0) return `备份: ${currentStamp()}`
  return flat.length > MESSAGE_MAX_CHARS ? `${flat.slice(0, MESSAGE_MAX_CHARS)}…` : flat
}

// sync.ps1 调用参数。dryRun → -DryRun（只预览）；restore + confirm → -Force（真正写入，
// sync.ps1 侧会先做覆盖前快照）。backup 不需要 -Force（非破坏性）。
function syncArgv(
  powershell: string,
  syncScript: string,
  mode: string,
  dryRun: boolean,
  confirm: boolean,
): string[] {
  const argv = [
    powershell,
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    syncScript,
    '-Mode',
    mode,
  ]
  if (dryRun) argv.push('-DryRun')
  if (mode === 'restore' && confirm) argv.push('-Force')
  return argv
}

export function apply(ctx: Context, config: DshConfigGitBackupConfig = {}) {
  const repoDir = config.repoDir ?? process.env.DSH_CONFIG_GIT_BACKUP_REPO_DIR
  const syncScript =
    config.syncScript ??
    process.env.DSH_CONFIG_GIT_BACKUP_SYNC_SCRIPT ??
    (repoDir ? join(repoDir, 'sync.ps1') : undefined)
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
      'restore is destructive and fail-closed: without confirm: true it changes nothing and instead returns a preview of what would be overwritten ' +
      '(the script also refuses to run without -Force, and snapshots the live sources to <DSH_HOME>/vet/restore-snapshots/<timestamp> before overwriting). ' +
      'Pass dryRun: true to preview either mode without changing anything. ' +
      'Optionally pass a commit message (flattened to a single line, max 200 chars).',

    parameters: {
      mode: {
        type: 'string',
        required: true,
        description: '"backup" (live sources → repo + git commit) or "restore" (repo → live sources).',
      },
      message: {
        type: 'string',
        description:
          'Optional commit message for backup mode. Control characters are flattened and the text is truncated to 200 chars. ' +
          'Defaults to "备份: <timestamp>" (repository history language).',
      },
      dryRun: {
        type: 'boolean',
        description:
          'Preview only: report which files would be added/overwritten, change nothing. Supported by both modes.',
      },
      confirm: {
        type: 'boolean',
        description:
          'restore only: acknowledges that restore overwrites live sources (uncommitted local edits are lost). ' +
          'Without it a restore is refused and returns a diff preview instead.',
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
      const dryRun = args.dryRun === true
      const confirm = args.confirm === true
      if (dryRun && confirm) {
        throw new Error(
          'dsh_config_git_backup: dryRun 与 confirm 不能同时为 true（dryRun 只预览，confirm 表示确认执行）',
        )
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

      // restore 是破坏性操作：未确认时先取一份 dry-run 差异，再带着差异报错 —— 既不写入任何东西，
      // 又让调用方（模型/用户）看得到"到底会被覆盖什么"，而不是只给一句"请确认"。
      if (mode === 'restore' && !confirm && !dryRun) {
        const preview = await run(
          ctx,
          syncArgv(powershell, syncScript, mode, true, false),
          exec.signal,
          repoDir,
        )
        const detail = [preview.stdout.trim(), preview.stderr.trim()]
          .filter((part) => part.length > 0)
          .join('\n')
        throw new Error(
          'dsh_config_git_backup restore 未确认：restore 会用仓库版本覆盖活跃源，未提交的本地改动会丢失。\n' +
            `预览（sync.ps1 -Mode restore -DryRun，exit ${preview.exitCode}）：\n${detail || '(无输出)'}\n` +
            '确认无误后请重新调用并传 confirm: true；执行前会自动把活跃源快照到 <DSH_HOME>/vet/restore-snapshots/<时间戳>/。',
        )
      }

      // 1) 同步（robocopy 排除 node_modules；restore 时脚本自己先快照、且自身要求 -Force）
      const sync = await run(
        ctx,
        syncArgv(powershell, syncScript, mode, dryRun, confirm),
        exec.signal,
        repoDir,
      )
      logs.push(`[sync.ps1 exit ${sync.exitCode}]`)
      if (sync.stdout.trim().length > 0) logs.push(sync.stdout.trim())
      if (sync.stderr.trim().length > 0) logs.push(`stderr: ${sync.stderr.trim()}`)
      if (sync.exitCode !== 0) {
        throw new Error(`dsh_config_git_backup ${mode} 同步失败 (exit ${sync.exitCode}):\n${logs.join('\n')}`)
      }

      // dry-run：到此为止，不做 git 操作、不改动任何文件
      if (dryRun) {
        logs.push('[dry-run] 未做任何改动')
        return { stdout: logs.join('\n'), stderr: '' }
      }

      // 2) backup 模式：git 留档
      if (mode === 'backup') {
        const add = await run(ctx, ['git', '-C', repoDir, 'add', '-A'], exec.signal, repoDir)
        if (add.exitCode !== 0) {
          throw new Error(`dsh_config_git_backup git add 失败 (exit ${add.exitCode}): ${add.stderr || add.stdout}`)
        }

        // 先看有没有真的暂存下东西：没有就明确记成"无变更"，不再让"没提交"看起来像"提交成功"
        const status = await run(ctx, ['git', '-C', repoDir, 'status', '--porcelain'], exec.signal, repoDir)
        if (status.exitCode !== 0) {
          logs.push(
            `[git] 无法读取工作区状态 (exit ${status.exitCode})：${status.stderr.trim() || status.stdout.trim()}`,
          )
        }
        const staged = status.exitCode === 0 ? status.stdout.trim() : ''

        if (staged.length === 0) {
          logs.push('[git] 无变更可提交：工作区内容与上次提交一致（sync.ps1 的落库校验已通过）')
        } else {
          const message = normalizeMessage(args.message)
          const commit = await run(
            ctx,
            ['git', '-C', repoDir, 'commit', '-m', message],
            exec.signal,
            repoDir,
          )
          if (commit.exitCode !== 0) {
            const combined = `${commit.stderr}\n${commit.stdout}`
            if (/nothing to commit|no changes added|nothing added|无.*提交/i.test(combined)) {
              logs.push('[git] 无变更可提交：git 报 nothing to commit（内容已一致或并发提交）')
            } else {
              throw new Error(`dsh_config_git_backup git commit 失败 (exit ${commit.exitCode}):\n${combined}`)
            }
          } else {
            logs.push(commit.stdout.trim() || `[git] 已提交: ${message}`)
          }
        }

        const finalStatus = await run(ctx, ['git', '-C', repoDir, 'status', '-sb'], exec.signal, repoDir)
        if (finalStatus.exitCode === 0 && finalStatus.stdout.trim().length > 0) {
          logs.push(`[git status] ${finalStatus.stdout.trim()}`)
        }
      } else {
        logs.push(
          '[restore] 已还原到活跃源（覆盖前快照路径见上方 sync.ps1 输出）；如涉及 profiles/bundle 变更需重启 DSH 生效',
        )
      }

      return { stdout: logs.join('\n'), stderr: '' }
    },
  }))

  ctx.logger.info(`[tool-dsh-config-git-backup] registered "dsh_config_git_backup" — repo=${repoDir}`)
}
