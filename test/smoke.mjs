// End-to-end smoke test for the built plugin (dist/index.js).
//
// It drives the real tool implementation against a throwaway sandbox: the repo
// gets sync.ps1 copied in with its three path variables rewritten, so the live
// DSH sources are never touched. ctx is faked — tools.register captures the tool
// definition, subprocess.spawn delegates to node:child_process.
//
// Run with:  node test/smoke.mjs   (or: npm test)

import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../dist/index.js'

const PS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const SOURCE_SYNC = 'C:\\workspace\\dsh\\sync.ps1'

let failures = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`)
  else {
    console.log(`FAIL  ${name}   ${detail}`)
    failures++
  }
}

// ---------- sandbox ----------
const root = join(tmpdir(), `dsh-plugin-smoke-${process.pid}`)
rmSync(root, { recursive: true, force: true })
const repo = join(root, 'repo')
const dshHome = join(root, 'dshhome')
const plugins = join(root, 'plugins')
for (const d of [repo, join(dshHome, 'profiles', 'web'), join(dshHome, 'skills', 'demo'), plugins]) {
  mkdirSync(d, { recursive: true })
}
writeFileSync(join(dshHome, 'AGENTS.md'), 'LIVE-AGENTS-v1')
writeFileSync(join(dshHome, 'settings.yaml'), 'live: 1')
writeFileSync(join(dshHome, 'skills', 'demo', 'SKILL.md'), 'skill v1')
writeFileSync(join(plugins, 'p.js'), 'plugin v1')

const patchedSync = join(root, 'sync.ps1')
const patched = readFileSync(SOURCE_SYNC, 'utf8')
  .replace("$Repo = 'C:\\workspace\\dsh'", `$Repo = '${repo}'`)
  .replace("$DshHome = 'C:\\Users\\qizhe\\.dsh'", `$DshHome = '${dshHome}'`)
  .replace("$PluginSrc = 'C:\\workspace\\plugins'", `$PluginSrc = '${plugins}'`)
writeFileSync(patchedSync, patched, 'utf8')

execFileSync('git', ['-C', repo, 'init', '-q'])
execFileSync('git', ['-C', repo, 'config', 'user.email', 't@example.com'])
execFileSync('git', ['-C', repo, 'config', 'user.name', 'tester'])

// ---------- fake cordis ctx ----------
let tool
const ctx = {
  tools: { register: (t) => { tool = t } },
  logger: { info: () => {}, warn: (m) => console.log(`[warn] ${m}`) },
  subprocess: {
    spawn({ argv, cwd }) {
      const child = spawn(argv[0], argv.slice(1), { cwd, windowsHide: true })
      const out = []
      const err = []
      child.stdout.on('data', (d) => out.push(d))
      child.stderr.on('data', (d) => err.push(d))
      const done = new Promise((resolve) => {
        child.on('close', (code, sig) => resolve({ exitCode: code, signal: sig }))
      })
      const collected = {
        stdout: { readFrom: () => ({ text: Buffer.concat(out).toString('utf8') }) },
        stderr: { readFrom: () => ({ text: Buffer.concat(err).toString('utf8') }) },
      }
      return { done, collected }
    },
  },
}

apply(ctx, { repoDir: repo, syncScript: patchedSync, powershell: PS })
const exec = { signal: new AbortController().signal }
const call = (args) => tool.execute(args, exec)
const liveAgents = () => readFileSync(join(dshHome, 'AGENTS.md'), 'utf8')

console.log('--- tool definition ---')
check('tool name registered', tool?.name === 'dsh_config_git_backup', String(tool?.name))
const props = tool?.parameters?.properties ?? {}
check('confirm parameter declared', props.confirm?.type === 'boolean', JSON.stringify(props.confirm))
check('dryRun parameter declared', props.dryRun?.type === 'boolean', JSON.stringify(props.dryRun))
check('mode is required', (tool?.parameters?.required ?? []).includes('mode'))

console.log('--- 1) mode validation ---')
let threw = null
try { await call({ mode: 'nonsense' }) } catch (e) { threw = e }
check('bad mode rejected', /mode/.test(threw?.message ?? ''), threw?.message)

console.log('--- 2) dryRun + confirm together is rejected ---')
threw = null
try { await call({ mode: 'restore', dryRun: true, confirm: true }) } catch (e) { threw = e }
check('dryRun+confirm rejected', /不能同时/.test(threw?.message ?? ''), threw?.message)

console.log('--- 3) initial backup commits live content ---')
let res = await call({ mode: 'backup', message: 'init backup' })
check('backup returns stdout', typeof res.stdout === 'string' && res.stdout.length > 0)
check('backup verify line present', /verify/.test(res.stdout), res.stdout)
check('backup committed with the given message', execFileSync('git', ['-C', repo, 'log', '-1', '--pretty=%s'], { encoding: 'utf8' }).trim() === 'init backup')
check('repo has live AGENTS.md', readFileSync(join(repo, 'AGENTS.md'), 'utf8') === 'LIVE-AGENTS-v1')

console.log('--- 4) second identical backup reports "no changes" instead of a fake success ---')
res = await call({ mode: 'backup' })
check('no-change commit reported explicitly', /无变更可提交/.test(res.stdout), res.stdout)

console.log('--- 5) repo diverged: restore without confirm is refused ---')
writeFileSync(join(repo, 'AGENTS.md'), 'REPO-AGENTS-v2')
let err = null
try { await call({ mode: 'restore' }) } catch (e) { err = e }
check('restore refused', err !== null, 'no error thrown')
check('refusal explains the confirm requirement', /confirm: true/.test(err?.message ?? ''), err?.message)
check('refusal embeds the dry-run preview', /AGENTS\.md/.test(err?.message ?? ''), err?.message)
check('live source untouched after refusal', liveAgents() === 'LIVE-AGENTS-v1', liveAgents())

console.log('--- 6) dryRun previews without changing anything ---')
res = await call({ mode: 'restore', dryRun: true })
check('dryRun mentions AGENTS.md', /AGENTS\.md/.test(res.stdout), res.stdout)
check('dryRun flagged', /dry-run/.test(res.stdout), res.stdout)
check('live source untouched after dryRun', liveAgents() === 'LIVE-AGENTS-v1', liveAgents())

console.log('--- 7) confirmed restore snapshots then overwrites ---')
res = await call({ mode: 'restore', confirm: true })
check('confirmed restore succeeds', /verify/.test(res.stdout), res.stdout)
check('live source overwritten', liveAgents() === 'REPO-AGENTS-v2', liveAgents())
check('snapshot path reported', /restore-snapshots/.test(res.stdout), res.stdout)
const snapRoot = join(dshHome, 'vet', 'restore-snapshots')
const snaps = existsSync(snapRoot) ? readdirSync(snapRoot) : []
check('snapshot created', snaps.length >= 1, `count=${snaps.length}`)
if (snaps.length >= 1) {
  const snap = join(snapRoot, snaps.sort().at(-1))
  check('snapshot holds pre-restore content', readFileSync(join(snap, 'AGENTS.md'), 'utf8') === 'LIVE-AGENTS-v1')
  check('snapshot manifest present', existsSync(join(snap, 'manifest.txt')))
}

console.log('--- 8) commit message normalization (multi-line / control chars / length) ---')
writeFileSync(join(dshHome, 'settings.yaml'), 'live: 2')
const longTail = 'x'.repeat(400)
res = await call({ mode: 'backup', message: `line1\r\nline2\t\ttoo   many\n${longTail}` })
const subject = execFileSync('git', ['-C', repo, 'log', '-1', '--pretty=%s'], { encoding: 'utf8' }).trim()
check('commit message is one line', !/[\r\n]/.test(subject), JSON.stringify(subject))
check('whitespace collapsed', /line1 line2 too many/.test(subject), JSON.stringify(subject))
check('message truncated to 200 chars', subject.length <= 201, `len=${subject.length}`)
check('backup reported the commit', /备份|init|line1/.test(res.stdout), res.stdout)

console.log('--- 9) backup with a bad repo path fails closed ---')
const tool2 = (() => {
  let t
  apply(
    { ...ctx, tools: { register: (x) => { t = x } } },
    { repoDir: join(root, 'does-not-exist'), syncScript: join(root, 'nope.ps1'), powershell: PS },
  )
  return t
})()
threw = null
try { await tool2.execute({ mode: 'backup' }, exec) } catch (e) { threw = e }
check('missing sync script fails closed', /不存在/.test(threw?.message ?? ''), threw?.message)

rmSync(root, { recursive: true, force: true })
console.log('')
console.log(failures === 0 ? 'ALL SMOKE TESTS PASSED' : `FAILED CHECKS: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
