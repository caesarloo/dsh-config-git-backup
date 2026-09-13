# Isolated protection tests for this machine's sync.ps1 contract (D2/D4).
#
# The plugin passes -Mode / -DryRun / -Force to a sync.ps1 it does not own, so the
# contract is tested here rather than in smoke.mjs: this harness copies
# C:\workspace\dsh\sync.ps1 into a throwaway sandbox, rewrites its three path
# variables, and asserts preview / refusal / snapshot / verify behaviour there.
# The real live sources are never touched.
#
# Run:  powershell -NoProfile -ExecutionPolicy Bypass -File test\sync-protection-tests.ps1
# Exit: 0 = all checks passed, N>0 = number of failed checks.
## Isolated test harness for the hardened sync.ps1 (D2/D4).
# It copies C:\workspace\dsh\sync.ps1 into a throwaway sandbox, rewrites the three
# path variables, and exercises backup / restore protection there. The real live
# sources are never touched.
$ErrorActionPreference = 'Stop'
$script:fail = 0

function Check {
    param([string]$TestName, [bool]$Ok, [string]$Detail = '')
    if ($Ok) { Write-Host ("PASS  " + $TestName) }
    else { Write-Host ("FAIL  " + $TestName + "   " + $Detail); $script:fail++ }
}

$root = Join-Path $env:TEMP 'dsh-sync-test'
if (Test-Path $root) { Remove-Item $root -Recurse -Force }
$repo = Join-Path $root 'repo'
$home2 = Join-Path $root 'dshhome'
$plug = Join-Path $root 'plugins'
New-Item -ItemType Directory -Force $repo, (Join-Path $home2 'profiles\web'), (Join-Path $home2 'skills\demo'), $plug | Out-Null

Set-Content -Path (Join-Path $home2 'AGENTS.md') -Value 'LIVE-AGENTS-v1'
Set-Content -Path (Join-Path $home2 'settings.yaml') -Value 'live: 1'
Set-Content -Path (Join-Path $home2 'profiles\web\cordis.yml') -Value 'cordis live'
Set-Content -Path (Join-Path $home2 'skills\demo\SKILL.md') -Value 'skill v1'
Set-Content -Path (Join-Path $plug 'p.js') -Value 'plugin v1'

$lines = Get-Content 'C:\workspace\dsh\sync.ps1'
$out = New-Object System.Collections.Generic.List[string]
foreach ($l in $lines) {
    if ($l -like '$Repo = *') { $out.Add("`$Repo = '$repo'") }
    elseif ($l -like '$DshHome = *') { $out.Add("`$DshHome = '$home2'") }
    elseif ($l -like '$PluginSrc = *') { $out.Add("`$PluginSrc = '$plug'") }
    else { $out.Add($l) }
}
$testScript = Join-Path $root 'sync.ps1'
[System.IO.File]::WriteAllLines($testScript, $out, (New-Object System.Text.UTF8Encoding($true)))

$psExe = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
function RunSync {
    param([string[]]$SyncArgs)
    # Under Windows PowerShell 5.1 a native child writing to stderr becomes a
    # *terminating* error when redirected with 2>&1 while ErrorActionPreference is
    # 'Stop' - but "the script deliberately refuses" is exactly what we test here.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & $psExe -NoProfile -ExecutionPolicy Bypass -File $testScript @SyncArgs 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $prevEap }
    return [pscustomobject]@{ Exit = $code; Text = ($raw | Out-String) }
}
function Content { param([string]$P) if (Test-Path -LiteralPath $P) { (Get-Content -LiteralPath $P -Raw).Trim() } else { '<absent>' } }

Write-Host '--- 1) backup writes live content into the repo, then verifies ---'
$r = RunSync @('-Mode', 'backup')
Check 'backup exits 0' ($r.Exit -eq 0) ("exit=" + $r.Exit + " " + $r.Text)
Check 'backup verify passed' ($r.Text -match 'verify')
Check 'repo AGENTS.md updated' ((Content (Join-Path $repo 'AGENTS.md')) -eq 'LIVE-AGENTS-v1') (Content (Join-Path $repo 'AGENTS.md'))
Check 'repo skills dir synced' ((Content (Join-Path $repo 'skills\demo\SKILL.md')) -eq 'skill v1')
Check 'repo plugins dir synced' ((Content (Join-Path $repo 'plugins\p.js')) -eq 'plugin v1')

Write-Host '--- 2) simulate another host having newer repo content ---'
git -C $repo init -q
git -C $repo config user.email t@example.com
git -C $repo config user.name tester
git -C $repo add -A
git -C $repo commit -qm init
Set-Content -Path (Join-Path $repo 'AGENTS.md') -Value 'REPO-AGENTS-v2'
Set-Content -Path (Join-Path $repo 'skills\demo\NEW.md') -Value 'from repo'

Write-Host '--- 3) restore without -Force must refuse and change nothing ---'
$r = RunSync @('-Mode', 'restore')
Check 'restore without -Force fails' ($r.Exit -ne 0) ("exit=" + $r.Exit)
Check 'refusal names the reason' ($r.Text -match 'restore' -and $r.Text -match 'DryRun')
Check 'live AGENTS.md untouched' ((Content (Join-Path $home2 'AGENTS.md')) -eq 'LIVE-AGENTS-v1') (Content (Join-Path $home2 'AGENTS.md'))
Check 'live NEW.md not created' ((Content (Join-Path $home2 'skills\demo\NEW.md')) -eq '<absent>')

Write-Host '--- 4) restore -DryRun previews and still changes nothing ---'
$r = RunSync @('-Mode', 'restore', '-DryRun')
Check 'dry-run exits 0' ($r.Exit -eq 0) ("exit=" + $r.Exit + " " + $r.Text)
Check 'dry-run lists AGENTS.md' ($r.Text -match 'AGENTS\.md')
Check 'dry-run lists NEW.md' ($r.Text -match 'NEW\.md')
Check 'dry-run tags itself' ($r.Text -match 'dry-run')
Check 'live AGENTS.md still untouched' ((Content (Join-Path $home2 'AGENTS.md')) -eq 'LIVE-AGENTS-v1')
Check 'live NEW.md still absent' ((Content (Join-Path $home2 'skills\demo\NEW.md')) -eq '<absent>')

Write-Host '--- 5) restore -Force snapshots first, then overwrites ---'
Set-Content -Path (Join-Path $home2 'skills\demo\LOCAL-ONLY.md') -Value 'keep me'
$r = RunSync @('-Mode', 'restore', '-Force')
Check 'forced restore exits 0' ($r.Exit -eq 0) ("exit=" + $r.Exit + " " + $r.Text)
Check 'restore verify passed' ($r.Text -match 'verify')
Check 'live AGENTS.md overwritten by repo' ((Content (Join-Path $home2 'AGENTS.md')) -eq 'REPO-AGENTS-v2') (Content (Join-Path $home2 'AGENTS.md'))
Check 'repo-only file landed in live' ((Content (Join-Path $home2 'skills\demo\NEW.md')) -eq 'from repo')
Check 'live-only file kept (no purge)' ((Content (Join-Path $home2 'skills\demo\LOCAL-ONLY.md')) -eq 'keep me')
$snapRoot = Join-Path $home2 'vet\restore-snapshots'
$snaps = @(Get-ChildItem -LiteralPath $snapRoot -Directory -ErrorAction SilentlyContinue)
Check 'snapshot dir created' ($snaps.Count -ge 1) ("count=" + $snaps.Count)
if ($snaps.Count -ge 1) {
    $snap = $snaps[0].FullName
    Check 'snapshot kept the PRE-restore live content' ((Content (Join-Path $snap 'AGENTS.md')) -eq 'LIVE-AGENTS-v1') (Content (Join-Path $snap 'AGENTS.md'))
    Check 'snapshot manifest written' (Test-Path (Join-Path $snap 'manifest.txt'))
    Check 'snapshot excludes node_modules' (-not (Test-Path (Join-Path $snap 'plugins\node_modules')))
}

Write-Host '--- 6) D4: robocopy silently skips (same size + same mtime) must fail loudly ---'
$liveSkill = Join-Path $home2 'skills\demo\SKILL.md'
$repoSkill = Join-Path $repo 'skills\demo\SKILL.md'
Set-Content -Path $liveSkill -Value 'AAAA'
Set-Content -Path $repoSkill -Value 'BBBB'
$ts = Get-Date '2026-01-01 00:00:00'
(Get-Item $liveSkill).LastWriteTime = $ts
(Get-Item $repoSkill).LastWriteTime = $ts
$r = RunSync @('-Mode', 'backup')
Check 'silent robocopy skip is detected (non-zero exit)' ($r.Exit -ne 0) ("exit=" + $r.Exit + " " + $r.Text)
Check 'failure message names the verify step' ($r.Text -match 'verify' -or $r.Text -match 'sync')
Check 'stale repo file is listed' ($r.Text -match 'SKILL\.md')
Check 'repo copy really was skipped (BBBB)' ((Content $repoSkill) -eq 'BBBB') (Content $repoSkill)

Write-Host '--- 7) D4 fix: after the mtimes differ again the same backup succeeds ---'
(Get-Item $liveSkill).LastWriteTime = (Get-Date).AddMinutes(1)
$r = RunSync @('-Mode', 'backup')
Check 'backup exits 0 once mtime differs' ($r.Exit -eq 0) ("exit=" + $r.Exit + " " + $r.Text)
Check 'repo now has live content' ((Content $repoSkill) -eq 'AAAA') (Content $repoSkill)

Write-Host '--- 8) restore -Force fails loudly when a live file cannot be written ---'
Set-Content -Path $repoSkill -Value 'CCCC'
$lock = [System.IO.File]::Open($liveSkill, 'Open', 'ReadWrite', 'None')
try {
    $r = RunSync @('-Mode', 'restore', '-Force')
    Check 'locked-file restore fails loudly' ($r.Exit -ne 0) ("exit=" + $r.Exit + " " + $r.Text)
} finally { $lock.Dispose() }

Write-Host '--- 9) snapshot pruning keeps 10 ---'
foreach ($n in 1..10) { New-Item -ItemType Directory -Force -Path (Join-Path $snapRoot ("20250101-0000" + $n)) | Out-Null }
$r = RunSync @('-Mode', 'restore', '-Force')
Check 'pruning restore exits 0' ($r.Exit -eq 0) ("exit=" + $r.Exit + " " + $r.Text)
$left = @(Get-ChildItem -LiteralPath $snapRoot -Directory)
Check 'snapshots capped at 10' ($left.Count -eq 10) ("count=" + $left.Count)

Write-Host ''
if ($script:fail -eq 0) { Write-Host 'ALL TESTS PASSED' } else { Write-Host ("FAILED CHECKS: " + $script:fail) }
exit $script:fail
