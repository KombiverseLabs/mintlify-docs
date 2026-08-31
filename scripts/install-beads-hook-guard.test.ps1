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
  [System.IO.File]::WriteAllText((Join-Path $canonical "source.txt"), "initial`n")
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "install-beads-hook-guard.ps1") -Destination (Join-Path $canonical "scripts/install-beads-hook-guard.ps1")
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
  Invoke-Git $canonical @("config", "core.hooksPath", ".beads/hooks") | Out-Null
  Invoke-Git $canonical @("add", ".beads/hooks/pre-commit") | Out-Null

  & (Join-Path $canonical "scripts/install-beads-hook-guard.ps1") -Repo workspace-root | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "initial guard install failed" }
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

  Invoke-Git $canonical @("add", ".beads", ".kombify", "scripts/install-beads-hook-guard.ps1", "source.txt") | Out-Null
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
if [ "${1:-}" = "hooks" ] && [ "${2:-}" = "run" ]; then
  printf 'bd hooks run invoked\n' >> "$FAKE_BD_MARKER"
  printf 'foreign write\n' >> "$FAKE_CANONICAL_ISSUES"
  exit 0
fi
exit 0
'@
  $fakeBdPath = Join-Path $fakeBin "bd"
  [System.IO.File]::WriteAllText($fakeBdPath, ($fakeBd -replace "`r`n", "`n"))
  $gitSh = Join-Path (Split-Path (Get-Command git).Source -Parent) "..\bin\sh.exe"
  if (-not (Test-Path -LiteralPath $gitSh)) { $gitSh = "C:\Program Files\Git\bin\sh.exe" }
  & $gitSh -c 'chmod +x "$1"' -- ($fakeBdPath -replace '\\', '/')
  if ($LASTEXITCODE -ne 0) { throw "could not make fake bd executable" }

  $oldPath = $env:PATH
  $oldBeadsDir = $env:FAKE_BEADS_DIR
  $oldMarker = $env:FAKE_BD_MARKER
  $oldIssues = $env:FAKE_CANONICAL_ISSUES
  $oldTail = $env:HOOK_TAIL_MARKER
  try {
    $env:PATH = "$fakeBin;$oldPath"
    $env:FAKE_BEADS_DIR = Join-Path $canonical ".beads"
    $env:FAKE_BD_MARKER = $fakeMarker
    $env:FAKE_CANONICAL_ISSUES = $canonicalIssues
    $env:HOOK_TAIL_MARKER = $tailMarker

    $issuesHash = Get-FileHashValue $canonicalIssues
    [System.IO.File]::AppendAllText((Join-Path $linked "source.txt"), "source-only`n")
    Invoke-Git $linked @("add", "source.txt") | Out-Null
    $sourceCommit = Invoke-Git $linked @("commit", "-m", "source only")
    Assert-True ($sourceCommit.ExitCode -eq 0) "source-only linked-worktree commit was blocked"
    Assert-True (($sourceCommit.Output -join "`n") -match "beads target safety: skipping beads hook") "source-only commit did not report the safe skip"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "source-only commit invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "source-only commit changed canonical tracker state"
    Assert-True (Test-Path -LiteralPath $tailMarker) "non-beads hook logic did not continue after the safe skip"

    $tailCount = @(Get-Content -LiteralPath $tailMarker).Count
    [System.IO.File]::AppendAllText((Join-Path $linked ".beads/hooks/post-merge"), "# linked hook source`n")
    Invoke-Git $linked @("add", ".beads/hooks/post-merge") | Out-Null
    $hookCommit = Invoke-Git $linked @("commit", "-m", "tracked hook source")
    Assert-True ($hookCommit.ExitCode -eq 0) "tracked hook source was misclassified as tracker state"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "tracked hook source invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "tracked hook source changed canonical tracker state"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -gt $tailCount) "non-beads hook logic did not continue for tracked hook source"

    $tailCount = @(Get-Content -LiteralPath $tailMarker).Count
    [System.IO.File]::AppendAllText((Join-Path $linked ".beads/issues.jsonl"), "linked-only-tracker-state`n")
    Invoke-Git $linked @("add", ".beads/issues.jsonl") | Out-Null
    $beadsCommit = Invoke-Git $linked @("commit", "-m", "tracker sync must fail") -AllowFailure
    Assert-True ($beadsCommit.ExitCode -ne 0) "staged .beads/** commit did not fail closed"
    Assert-True (-not (Test-Path -LiteralPath $fakeMarker)) "failed tracker commit invoked the foreign bd write path"
    Assert-True ((Get-FileHashValue $canonicalIssues) -eq $issuesHash) "failed tracker commit changed canonical tracker state"
    Assert-True (@(Get-Content -LiteralPath $tailMarker).Count -eq $tailCount) "hook continued after the fail-closed tracker decision"
  } finally {
    $env:PATH = $oldPath
    $env:FAKE_BEADS_DIR = $oldBeadsDir
    $env:FAKE_BD_MARKER = $oldMarker
    $env:FAKE_CANONICAL_ISSUES = $oldIssues
    $env:HOOK_TAIL_MARKER = $oldTail
  }

  Write-Output "PASS: linked-worktree source and hook commits skip foreign writes; tracker state fails closed"
} finally {
  $resolved = [System.IO.Path]::GetFullPath($testRoot)
  if ($resolved.StartsWith($tempBase + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
