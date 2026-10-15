[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-Git([string]$Repo, [string[]]$Arguments, [switch]$AllowFailure) {
  $output = @(& git -C $Repo @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "git $($Arguments -join ' ') failed ($exitCode): $($output -join [Environment]::NewLine)"
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Get-FileHashValue([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$testRoot = Join-Path $tempBase ("kombify-beads-hook-safety-" + [guid]::NewGuid().ToString("N"))
$canonical = Join-Path $testRoot "canonical"
$linked = Join-Path $testRoot "linked"
$junction = Join-Path $testRoot "workspace-view"
$emptyHooks = Join-Path $testRoot "empty-hooks"
$fakeBin = Join-Path $testRoot "fake-bin"
$fakeMarker = Join-Path $testRoot "bd-write-marker.txt"
$tailMarker = Join-Path $testRoot "custom-tail-marker.txt"
$canonicalIssues = Join-Path $canonical ".beads/issues.jsonl"

try {
  New-Item -ItemType Directory -Path $canonical, $emptyHooks, $fakeBin -Force | Out-Null
  Invoke-Git $canonical @("init", "-b", "main") | Out-Null
  Invoke-Git $canonical @("config", "user.name", "Hook Safety Test") | Out-Null
  Invoke-Git $canonical @("config", "user.email", "hook-safety@example.invalid") | Out-Null

  New-Item -ItemType Directory -Path (Join-Path $canonical ".beads/hooks"), (Join-Path $canonical ".kombify"), (Join-Path $canonical "scripts"), (Join-Path $canonical "internal/standards-enforcement"), (Join-Path $canonical "kombify-Cloud") -Force | Out-Null
  [System.IO.File]::WriteAllText($canonicalIssues, "canonical-tracker-state`n")
  [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/metadata.json"), '{"backend":"dolt"}')
  [System.IO.File]::WriteAllText((Join-Path $canonical "source.txt"), "initial`n")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "install-beads-hook-guard.ps1") -Destination (Join-Path $canonical "scripts/install-beads-hook-guard.ps1")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "beads-hook-authority.mjs") -Destination (Join-Path $canonical "scripts/beads-hook-authority.mjs")
  Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) ".kombify/beads-hook-safety-guard.sh") -Destination (Join-Path $canonical ".kombify/beads-hook-safety-guard.sh")
  [System.IO.File]::WriteAllText((Join-Path $canonical "internal/standards-enforcement/development-fleet-profile.json"), '{"repositories":[{"id":"kombify-Cloud","beads_hook_safety":"workspace-redirect"}]}')
  [System.IO.File]::WriteAllText((Join-Path $canonical "internal/standards-enforcement/repo-manifest.json"), '{"repos":[{"id":"kombify-Cloud","path":"kombify-Cloud"}]}')

  $legacyHook = @'
#!/usr/bin/env sh
# --- BEGIN KOMBIFY BEADS MERGE GUARD (platform-qsts1) ---
echo "legacy guard"
# --- END KOMBIFY BEADS MERGE GUARD (platform-qsts1) ---
# --- BEGIN BEADS INTEGRATION v1.0.3 ---
if command -v bd >/dev/null 2>&1; then
  bd hooks run pre-commit "$@"
fi
# --- END BEADS INTEGRATION v1.0.3 ---
printf 'tail\n' >> "$HOOK_TAIL_MARKER"
'@
  [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/hooks/pre-commit"), ($legacyHook -replace "`r`n", "`n"))
  foreach ($hook in "prepare-commit-msg", "pre-push") {
    [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/hooks/$hook"), (($legacyHook -replace 'bd hooks run pre-commit', "bd hooks run $hook") -replace "`r`n", "`n"))
  }
  Invoke-Git $canonical @("config", "core.hooksPath", ".beads/hooks") | Out-Null
  Invoke-Git $canonical @("add", ".beads/hooks/pre-commit") | Out-Null

  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "initial guard install failed" }
  # Regression: a here-string end marker must not swallow the final shell fi.
  if ($IsWindows) {
    $gitSh = Join-Path (Split-Path (Get-Command git).Source -Parent) "..\bin\sh.exe"
    if (-not (Test-Path -LiteralPath $gitSh)) { $gitSh = "C:\Program Files\Git\bin\sh.exe" }
  } else {
    $gitSh = (Get-Command sh -ErrorAction Stop).Source
  }
  & $gitSh -n ((Join-Path $canonical ".beads/hooks/pre-commit") -replace '\\', '/')
  Assert-True ($LASTEXITCODE -eq 0) "generated pre-commit hook has invalid shell syntax"
  $installedHook = Get-Content -LiteralPath (Join-Path $canonical ".beads/hooks/pre-commit") -Raw
  Assert-True ($installedHook -notmatch "legacy guard") "stale guard body was not replaced"
  Assert-True (([regex]::Matches($installedHook, "BEGIN KOMBIFY BEADS MERGE GUARD")).Count -eq 1) "guard marker must occur exactly once"
  Assert-True (([regex]::Matches($installedHook, "BEGIN KOMBIFY BEADS TARGET WRAPPER")).Count -eq 1) "target wrapper must occur exactly once"
  $firstHashes = @{}
  foreach ($hook in "pre-commit", "post-merge", "post-checkout", "post-rewrite") {
    $firstHashes[$hook] = Get-FileHashValue (Join-Path $canonical ".beads/hooks/$hook")
  }
  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "second guard install failed" }
  foreach ($hook in $firstHashes.Keys) {
    Assert-True ((Get-FileHashValue (Join-Path $canonical ".beads/hooks/$hook")) -eq $firstHashes[$hook]) "guard install is not byte-idempotent for $hook"
  }

  if (-not $IsWindows) {
    $preCommit = Join-Path $canonical ".beads/hooks/pre-commit"
    $mode = [System.IO.File]::GetUnixFileMode($preCommit)
    [System.IO.File]::SetUnixFileMode($preCommit, ($mode -band (-bnot [System.IO.UnixFileMode]::UserExecute)))
    @(& (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Check -Repo workspace-root 2>&1) | Out-Null
    Assert-True ($LASTEXITCODE -ne 0) "drift check accepted a hook that Git cannot execute"
    & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
    Assert-True ($LASTEXITCODE -eq 0) "installer did not repair a non-executable hook"
  }

  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo kombify-Cloud | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "workspace redirect install failed"
  Assert-True (([System.IO.File]::ReadAllText((Join-Path $canonical "kombify-Cloud/.beads/redirect"))).Trim() -eq "../.beads") "workspace redirect does not target root authority"
  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Check -Repo kombify-Cloud | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "workspace redirect check failed"

  Invoke-Git $canonical @("config", "core.hooksPath", (Join-Path $canonical ".beads/hooks")) | Out-Null
  @(& (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Check -Repo workspace-root 2>&1) | Out-Null
  Assert-True ($LASTEXITCODE -ne 0) "guard check accepted an absolute core.hooksPath"
  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "guard install did not repair an absolute core.hooksPath"
  $repairedPath = (Invoke-Git $canonical @("config", "--get", "core.hooksPath")).Output[0]
  Assert-True ($repairedPath -eq ".beads/hooks") "absolute core.hooksPath was not repaired to the relative contract"

  $dirtyConsumer = Join-Path $canonical "kombify-Dirty"
  New-Item -ItemType Directory -Path (Join-Path $dirtyConsumer ".beads/hooks") -Force | Out-Null
  Invoke-Git $dirtyConsumer @("init", "-b", "main") | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $dirtyConsumer ".beads/issues.jsonl"), "dirty-consumer-tracker`n")
  [System.IO.File]::WriteAllText((Join-Path $dirtyConsumer ".beads/hooks/pre-commit"), "#!/usr/bin/env sh`n")
  Invoke-Git $dirtyConsumer @("add", ".beads/hooks/pre-commit") | Out-Null
  @(& (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Check -Repo kombify-Dirty 2>&1) | Out-Null
  Assert-True ($LASTEXITCODE -ne 0) "guard check reported a dirty skipped repository as healthy"

  Invoke-Git $canonical @("add", ".beads", ".kombify", "scripts", "source.txt") | Out-Null
  Invoke-Git $canonical @("-c", "core.hooksPath=$emptyHooks", "commit", "-m", "fixture") | Out-Null
  Invoke-Git $canonical @("config", "core.hooksPath", (Join-Path $canonical ".beads/hooks")) | Out-Null
  Invoke-Git $canonical @("-c", "core.hooksPath=$emptyHooks", "worktree", "add", "-b", "linked-test", $linked, "HEAD") | Out-Null

  # Installing from a linked worktree must update its tracked snapshot, never
  # follow the shared absolute core.hooksPath into the canonical checkout.
  $canonicalHookBefore = Get-FileHashValue (Join-Path $canonical ".beads/hooks/pre-commit")
  & (Join-Path $linked "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "linked-worktree guard install failed" }
  Assert-True ((Get-FileHashValue (Join-Path $canonical ".beads/hooks/pre-commit")) -eq $canonicalHookBefore) "linked installer wrote through foreign core.hooksPath"

  $fakeBd = @'
#!/usr/bin/env sh
if [ "${1:-}" = "--readonly" ]; then shift; fi
if [ "${1:-}" = "where" ]; then
  printf '%s\n' "$FAKE_BEADS_DIR"
  printf '  database: fake\n'
  exit 0
fi
if [ "${1:-}" = "hooks" ] || [ "${1:-}" = "import" ] || [ "${1:-}" = "export" ] || [ "${1:-}" = "remember" ]; then
  printf 'bd legacy write invoked\n' >> "$FAKE_BD_MARKER"
  printf 'foreign write\n' >> "$FAKE_CANONICAL_ISSUES"
  exit 0
fi
exit 0
'@
  $fakeBdPath = Join-Path $fakeBin "bd"
  [System.IO.File]::WriteAllText($fakeBdPath, ($fakeBd -replace "`r`n", "`n"))
  & $gitSh -c 'chmod +x "$1"' -- ($fakeBdPath -replace '\\', '/')
  if ($LASTEXITCODE -ne 0) { throw "could not make fake bd executable" }

  $oldPath = $env:PATH
  $oldBeadsDir = $env:FAKE_BEADS_DIR
  $oldMarker = $env:FAKE_BD_MARKER
  $oldIssues = $env:FAKE_CANONICAL_ISSUES
  $oldTail = $env:HOOK_TAIL_MARKER
  try {
    $env:PATH = $fakeBin + [System.IO.Path]::PathSeparator + $oldPath
    $env:FAKE_BEADS_DIR = Join-Path $canonical ".beads"
    $env:FAKE_BD_MARKER = $fakeMarker
    $env:FAKE_CANONICAL_ISSUES = $canonicalIssues
    $env:HOOK_TAIL_MARKER = $tailMarker

    $issuesHash = Get-FileHashValue $canonicalIssues
    # An unavailable target must retain source-only progress without granting
    # permission to commit tracker state. Exercise both through the same hook.
    $env:FAKE_BEADS_DIR = ""
    [System.IO.File]::AppendAllText((Join-Path $linked "source.txt"), "source-only`n")
    Invoke-Git $linked @("add", "source.txt") | Out-Null
    $sourceCommit = Invoke-Git $linked @("commit", "-m", "source only")
    Assert-True ($sourceCommit.ExitCode -eq 0) "source-only linked-worktree commit was blocked"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "source-only commit invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "source-only commit changed canonical tracker state"
    Assert-True (Test-Path -LiteralPath $tailMarker) "non-beads hook logic did not continue after the safe skip"
    $env:FAKE_BEADS_DIR = Join-Path $canonical ".beads"

    $tailCount = @(Get-Content -LiteralPath $tailMarker).Count
    [System.IO.File]::AppendAllText((Join-Path $linked ".beads/hooks/post-merge"), "# linked hook source`n")
    Invoke-Git $linked @("add", ".beads/hooks/post-merge") | Out-Null
    $hookCommit = Invoke-Git $linked @("commit", "-m", "tracked hook source")
    Assert-True ($hookCommit.ExitCode -eq 0) "tracked hook source was misclassified as tracker state"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "tracked hook source invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "tracked hook source changed canonical tracker state"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -gt $tailCount) "non-beads hook logic did not continue for tracked hook source"

    $tailCount = @(Get-Content -LiteralPath $tailMarker).Count
    [System.IO.File]::WriteAllText((Join-Path $linked ".beads/PRIME.md"), "compact bd prime guidance`n")
    Invoke-Git $linked @("add", ".beads/PRIME.md") | Out-Null
    $primeCommit = Invoke-Git $linked @("commit", "-m", "tracked bd prime guidance")
    Assert-True ($primeCommit.ExitCode -eq 0) "tracked .beads/PRIME.md source was misclassified as tracker state"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "tracked .beads/PRIME.md invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "tracked .beads/PRIME.md changed canonical tracker state"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -gt $tailCount) "non-beads hook logic did not continue for tracked .beads/PRIME.md"

    $tailCount = @(Get-Content -LiteralPath $tailMarker).Count
    [System.IO.File]::AppendAllText((Join-Path $linked ".beads/issues.jsonl"), "linked-only-tracker-state`n")
    Invoke-Git $linked @("add", ".beads/issues.jsonl") | Out-Null
    $env:FAKE_BEADS_DIR = ""
    $beadsCommit = Invoke-Git $linked @("commit", "-m", "tracker sync must fail") -AllowFailure
    Assert-True ($beadsCommit.ExitCode -ne 0) "unresolved tracker target accepted staged tracker state"
    $env:FAKE_BEADS_DIR = Join-Path $canonical ".beads"
    $beadsCommit = Invoke-Git $linked @("commit", "-m", "foreign tracker sync must fail") -AllowFailure
    Assert-True ($beadsCommit.ExitCode -ne 0) "staged .beads/** commit did not fail closed"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "failed tracker commit invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "failed tracker commit changed canonical tracker state"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -eq $tailCount) "hook continued after the fail-closed tracker decision"

    # Remote-backed trackers are mutated only through beads:write. A normal
    # Git commit must keep the derived export and custom hook tail intact.
    Invoke-Git $canonical @("remote", "add", "origin", "https://example.invalid/workspace.git") | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/config.yaml"), 'sync.remote: "git+https://example.invalid/workspace.git"' + "`n")
    # Curated workspace views reach a canonical clone through a directory link.
    # Exercise the real Git entry here so an empty helper result cannot silently
    # fall through to native Beads writes despite a successful hook exit.
    $linkType = if ($IsWindows) { "Junction" } else { "SymbolicLink" }
    New-Item -ItemType $linkType -Path $junction -Target $canonical | Out-Null
    $viewAuthority = & node (Join-Path $junction "scripts/beads-hook-authority.mjs") $junction (Join-Path $junction ".beads")
    Assert-True ($LASTEXITCODE -eq 0 -and $viewAuthority -eq "remote") "workspace-view helper did not resolve remote authority"
    [System.IO.File]::AppendAllText((Join-Path $canonical "source.txt"), "remote-authority-source`n")
    Invoke-Git $canonical @("add", "source.txt") | Out-Null
    $remoteCommit = Invoke-Git $junction @("commit", "-m", "remote authority source")
    Assert-True ($remoteCommit.ExitCode -eq 0) "remote-authority source commit was blocked"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "remote-authority commit invoked a legacy tracker write"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "remote-authority commit changed its derived export"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -gt $tailCount) "custom hook tail did not run after remote-authority routing"

    foreach ($hook in "post-merge", "post-checkout", "post-rewrite", "pre-push") {
      Invoke-Git $canonical @("hook", "run", $hook) | Out-Null
    }
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "remote-authority lifecycle hook invoked a legacy tracker write"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "remote-authority lifecycle hook changed its derived export"

    # Reproduced regression: bootstrap/adoption can store origin in Dolt while
    # config.yaml has no sync.remote. Exercise that public hook write boundary.
    $configPath = Join-Path $canonical ".beads/config.yaml"
    $configSource = [System.IO.File]::ReadAllText($configPath)
    $oldCommand = $env:KOMBIFY_BEADS_COMMAND_JSON
    $oldRemoteState = $env:FAKE_DOLT_REMOTE_STATE
    $remoteStatePath = Join-Path $testRoot "remote-state.json"
    $remoteReader = Join-Path $fakeBin "read-remotes.mjs"
    [System.IO.File]::WriteAllText($remoteReader, @'
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
if (args[0] !== "--readonly" || args[1] !== "-C" ||
    realpathSync(resolve(args[2], ".beads")) !== realpathSync(process.env.FAKE_BEADS_DIR) ||
    args.slice(3).join(" ") !== "dolt remote list --json") process.exit(2);
const state = JSON.parse(readFileSync(process.env.FAKE_DOLT_REMOTE_STATE, "utf8"));
if (state.failure) process.exit(1);
process.stdout.write(state.output);
'@)
    try {
      $env:KOMBIFY_BEADS_COMMAND_JSON = ConvertTo-Json -InputObject @((Get-Command node).Source, $remoteReader) -Compress
      $env:FAKE_DOLT_REMOTE_STATE = $remoteStatePath
      [System.IO.File]::WriteAllText($remoteStatePath, (ConvertTo-Json @{ output = '[{"name":"origin","url":"git+https://example.invalid/workspace.git"}]' } -Compress))
      Remove-Item -LiteralPath $configPath
      [System.IO.File]::AppendAllText((Join-Path $canonical "source.txt"), "native-remote-source`n")
      Invoke-Git $canonical @("add", "source.txt") | Out-Null
      Invoke-Git $junction @("commit", "-m", "native remote authority source") | Out-Null
      Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "native Dolt remote commit invoked a legacy tracker write"
      Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "native Dolt remote commit changed its derived export"
      [System.IO.File]::WriteAllText($configPath, "issue-prefix: fixture`n")
      Invoke-Git $canonical @("hook", "run", "pre-commit") | Out-Null
      Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "config without sync.remote invoked a legacy tracker write"
      foreach ($invalidState in @(
        @{ output = '[{"name":"origin","url":"git+https://example.invalid/other.git"}]' },
        @{ output = '[{"name":"origin","url":"git+https://example.invalid/workspace.git"},{"name":"origin","url":"git+https://example.invalid/workspace.git"}]' },
        @{ output = 'invalid-json' },
        @{ failure = $true }
      )) {
        [System.IO.File]::WriteAllText($remoteStatePath, (ConvertTo-Json $invalidState -Compress))
        $invalidNativeHook = Invoke-Git $canonical @("hook", "run", "pre-commit") -AllowFailure
        Assert-True ($invalidNativeHook.ExitCode -ne 0) "unverified native remote did not fail closed"
        Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "unverified native remote invoked a legacy tracker write"
      }
    } finally {
      [System.IO.File]::WriteAllText($configPath, $configSource)
      $env:KOMBIFY_BEADS_COMMAND_JSON = $oldCommand
      $env:FAKE_DOLT_REMOTE_STATE = $oldRemoteState
    }

    # A successful process without an authority result is not a legacy decision.
    $helperPath = Join-Path $canonical "scripts/beads-hook-authority.mjs"
    $helperSource = [System.IO.File]::ReadAllText($helperPath)
    try {
      [System.IO.File]::WriteAllText($helperPath, "")
      $emptyAuthorityHook = Invoke-Git $canonical @("hook", "run", "pre-commit") -AllowFailure
      Assert-True ($emptyAuthorityHook.ExitCode -ne 0) "empty authority result did not fail closed"
      Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "empty authority result invoked a legacy tracker write"
    } finally {
      [System.IO.File]::WriteAllText($helperPath, $helperSource)
    }

    # A declared but invalid binding must not fall back to legacy writes.
    foreach ($invalidConfig in @(
      'sync.remote: "git+https://example.invalid/other.git"',
      'sync.remote: "git+https://example.invalid/workspace.git',
      "sync.remote: git+https://example.invalid/workspace.git`nsync.remote: git+https://example.invalid/workspace.git"
    )) {
      [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/config.yaml"), $invalidConfig + "`n")
      $invalidHook = Invoke-Git $canonical @("hook", "run", "pre-commit") -AllowFailure
      Assert-True ($invalidHook.ExitCode -ne 0) "invalid remote binding did not fail closed"
      Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "invalid binding invoked a legacy tracker write"
    }
    [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/config.yaml"), 'sync.remote: "git+https://example.invalid/workspace.git"' + "`n")
    [System.IO.File]::WriteAllText((Join-Path $canonical ".beads/metadata.json"), '{invalid')
    $invalidMetadata = Invoke-Git $canonical @("hook", "run", "pre-commit") -AllowFailure
    Assert-True ($invalidMetadata.ExitCode -ne 0) "invalid tracker metadata did not fail closed"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "invalid metadata invoked a legacy tracker write"
  } finally {
    $env:PATH = $oldPath
    $env:FAKE_BEADS_DIR = $oldBeadsDir
    $env:FAKE_BD_MARKER = $oldMarker
    $env:FAKE_CANONICAL_ISSUES = $oldIssues
    $env:HOOK_TAIL_MARKER = $oldTail
  }

  # A husky/vite-plus repository points core.hooksPath at "<dir>/_", whose "h"
  # dispatcher runs "<dir>/<hook>". The guard belongs in the tracked
  # .beads/hooks; the managed script must chain into it exactly once.
  $dispatcher = Join-Path $testRoot "dispatcher"
  New-Item -ItemType Directory -Path (Join-Path $dispatcher ".beads/hooks"), (Join-Path $dispatcher ".vp-hooks/_") -Force | Out-Null
  Invoke-Git $dispatcher @("init", "-b", "main") | Out-Null
  Invoke-Git $dispatcher @("config", "user.name", "Hook Safety Test") | Out-Null
  Invoke-Git $dispatcher @("config", "user.email", "hook-safety@example.invalid") | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $dispatcher ".beads/issues.jsonl"), "state`n")
  [System.IO.File]::WriteAllText((Join-Path $dispatcher ".beads/metadata.json"), '{"backend":"dolt"}')
  [System.IO.File]::WriteAllText((Join-Path $dispatcher ".vp-hooks/_/h"), "#!/usr/bin/env sh`nexit 0`n")
  [System.IO.File]::WriteAllText((Join-Path $dispatcher ".vp-hooks/pre-commit"), "vp staged`n")
  [System.IO.File]::WriteAllText((Join-Path $dispatcher ".beads/hooks/pre-commit"), "#!/usr/bin/env sh`nvp staged`n")
  Invoke-Git $dispatcher @("add", "-A") | Out-Null
  Invoke-Git $dispatcher @("-c", "core.hooksPath=$emptyHooks", "commit", "-m", "fixture") | Out-Null
  Invoke-Git $dispatcher @("config", "core.hooksPath", ".vp-hooks/_") | Out-Null

  & pwsh -NoProfile -File (Join-Path $PSScriptRoot "install-beads-hook-guard.ps1") -WorkspaceRoot $testRoot | Out-Null

  $chain = [System.IO.File]::ReadAllText((Join-Path $dispatcher ".vp-hooks/pre-commit"))
  Assert-True ($chain -match [regex]::Escape(".beads/hooks/pre-commit")) "dispatcher script was not chained into the guarded hook"
  Assert-True ((([regex]::Matches($chain, "vp staged")).Count) -eq 0) "chain kept a body the target already runs (vp staged would run twice)"
  $guarded = [System.IO.File]::ReadAllText((Join-Path $dispatcher ".beads/hooks/pre-commit"))
  Assert-True ($guarded -match [regex]::Escape("BEGIN KOMBIFY BEADS MERGE GUARD")) "guard missing from the dispatcher repo's tracked hook"
  Assert-True ($guarded -match "vp staged") "guard install dropped the repository's own hook body"

  Write-Output "PASS: linked-worktree and remote-authority hooks preserve tracker state; invalid targets fail closed"
} finally {
  if (Test-Path -LiteralPath $junction) {
    $view = Get-Item -LiteralPath $junction -Force
    if ($view.LinkType -notin @("Junction", "SymbolicLink")) { throw "Expected a workspace-view link" }
    $view.Delete()
  }
  $resolved = [System.IO.Path]::GetFullPath($testRoot)
  if ($resolved.StartsWith($tempBase + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
    if (Test-Path -LiteralPath (Join-Path $linked ".git")) {
      Invoke-Git $canonical @("worktree", "remove", "--force", $linked) | Out-Null
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
