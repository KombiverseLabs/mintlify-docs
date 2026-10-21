# Install the Beads hook-safety guard into every workspace repo that tracks a
# beads export (bead: platform-qsts1).
#
# The guard block in pre-commit / post-merge / post-checkout / post-rewrite
# verifies the writable tracker target before the beads section runs: a linked
# worktree must not write another checkout's database, and a remote-backed
# tracker skips the beads section entirely because mutations go through
# `mise run beads:write`. The remote Dolt history is the tracker authority;
# .beads/issues.jsonl is a derived export that no hook imports. The former
# JSONL-into-DB import (scripts/beads-jsonl-merge.mjs) was retired for that
# reason.
#
# The guard block sits OUTSIDE the `BEADS INTEGRATION` section markers, which
# `bd hooks install` preserves across bd upgrades (verified, including --force).
#
# Idempotent: re-run any time, including after a bd upgrade. Read-only apart
# from hook files and convergence of projected hooks to relative core.hooksPath.
#
#   pwsh scripts/install-beads-hook-guard.ps1            # install/refresh
#   pwsh scripts/install-beads-hook-guard.ps1 -Check     # report only, exit 1 on gaps
#   pwsh scripts/install-beads-hook-guard.ps1 -Skip kombify-Techstack
[CmdletBinding()]
param(
  [switch]$Check,
  [string]$WorkspaceRoot,
  [string[]]$Repo,
  [string[]]$Skip = @()
)

$ErrorActionPreference = "Stop"
$sourceRoot = Split-Path $PSScriptRoot -Parent
$root = if ($WorkspaceRoot) { [System.IO.Path]::GetFullPath($WorkspaceRoot) } else { $sourceRoot }

$GuardBegin = "# --- BEGIN KOMBIFY BEADS MERGE GUARD (platform-qsts1) ---"
$GuardEnd = "# --- END KOMBIFY BEADS MERGE GUARD (platform-qsts1) ---"
$BeadsBegin = "# --- BEGIN BEADS INTEGRATION"
$BeadsEnd = "# --- END BEADS INTEGRATION"
$TargetWrapperBegin = "# --- BEGIN KOMBIFY BEADS TARGET WRAPPER (platform-qsts1) ---"
$TargetWrapperEnd = "# --- END KOMBIFY BEADS TARGET WRAPPER (platform-qsts1) ---"
$NormalizeGuardOld = 'if [ -f .beads/issues.jsonl ] && command -v python >/dev/null 2>&1; then'
$NormalizeGuardNew = 'if [ "${_kb_skip_beads_hook:-0}" -ne 1 ] && [ -f .beads/issues.jsonl ] && command -v python >/dev/null 2>&1; then'
$JsonlNormalizeBegin = "# --- BEGIN KOMBIFY BEADS JSONL NORMALIZE (platform-qsts1) ---"
$JsonlNormalizeEnd = "# --- END KOMBIFY BEADS JSONL NORMALIZE (platform-qsts1) ---"
$LegacyNormalizeBegin = "# --- kombify: normalize memory export order ---"
$LegacyNormalizeEnd = "# --- end kombify normalize ---"
$jsonlNormalizeBody = $JsonlNormalizeBegin + "`n" + @'
if [ "${_kb_skip_beads_hook:-0}" -ne 1 ] && [ -f .beads/issues.jsonl ] && command -v node >/dev/null 2>&1; then
  _kb_norm=""
  for _kb_candidate in "scripts/beads-normalize-jsonl.mjs" "../scripts/beads-normalize-jsonl.mjs"; do
    if [ -f "$_kb_candidate" ]; then _kb_norm="$_kb_candidate"; break; fi
  done
  if [ -n "$_kb_norm" ]; then
    node "$_kb_norm" .beads/issues.jsonl || exit $?
    git add .beads/issues.jsonl
  fi
fi
'@ + "`n" + $JsonlNormalizeEnd + "`n"

$guardSource = Join-Path $sourceRoot ".kombify/beads-hook-safety-guard.sh"
if (-not (Test-Path -LiteralPath $guardSource -PathType Leaf)) {
  throw "Beads hook safety authority missing: $guardSource"
}
$guardCore = [System.IO.File]::ReadAllText($guardSource).TrimEnd("`r", "`n")
$guardBody = "$GuardBegin`n$guardCore`n$GuardEnd`n" -replace "`r`n", "`n"
$targetWrapperOpen = "$TargetWrapperBegin`n" + 'if [ "${_kb_skip_beads_hook:-0}" -ne 1 ]; then' + "`n"
$targetWrapperClose = "fi`n$TargetWrapperEnd`n"

$hookNames = @("pre-commit", "post-merge", "post-checkout", "post-rewrite")

function Write-Text([string]$Path, [string]$Content) {
  # LF endings: these run under sh, and CRLF breaks the shebang on some setups.
  [System.IO.File]::WriteAllText($Path, ($Content -replace "`r`n", "`n"))
}

function Test-HookExecutable([string]$Path) {
  if ($IsWindows) { return $true }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  return ([System.IO.File]::GetUnixFileMode($Path) -band [System.IO.UnixFileMode]::UserExecute) -ne 0
}

function Write-Hook([string]$Path, [string]$Content) {
  Write-Text $Path $Content
  if (-not $IsWindows) {
    $mode = [System.IO.File]::GetUnixFileMode($Path)
    [System.IO.File]::SetUnixFileMode($Path, ($mode -bor [System.IO.UnixFileMode]::UserExecute))
  }
}

function Normalize-Text([string]$Content) {
  if ($null -eq $Content) { return $null }
  return ($Content -replace "`r`n", "`n")
}

function Replace-MarkedBlock(
  [string]$Content,
  [string]$Begin,
  [string]$End,
  [string]$Replacement
) {
  $start = $Content.IndexOf($Begin, [StringComparison]::Ordinal)
  if ($start -lt 0) { return $null }
  $endStart = $Content.IndexOf($End, $start, [StringComparison]::Ordinal)
  if ($endStart -lt 0) { throw "unterminated hook block: $Begin" }
  $end = $endStart + $End.Length
  if ($end -lt $Content.Length -and $Content[$end] -eq "`n") { $end = [int]$end + 1 }
  return $Content.Substring(0, $start) + $Replacement + $Content.Substring($end)
}

function Add-BeadsTargetWrapper([string]$Content) {
  # Remove our previous wrapper first so repeated installs are byte-stable even
  # when bd refreshed the managed section between runs.
  $Content = $Content.Replace($targetWrapperOpen, "")
  $Content = $Content.Replace($targetWrapperClose, "")

  $start = $Content.IndexOf($BeadsBegin, [StringComparison]::Ordinal)
  if ($start -lt 0) { return $Content }
  $endStart = $Content.IndexOf($BeadsEnd, $start, [StringComparison]::Ordinal)
  if ($endStart -lt 0) { throw "unterminated beads integration section" }
  $end = $Content.IndexOf("`n", $endStart, [StringComparison]::Ordinal)
  if ($end -lt 0) { $end = $Content.Length } else { $end = [int]$end + 1 }
  $section = $Content.Substring($start, $end - $start)
  $wrapped = $targetWrapperOpen + $section + $targetWrapperClose
  return $Content.Substring(0, $start) + $wrapped + $Content.Substring($end)
}

function Add-JsonlNormalize([string]$Content, [string]$Hook) {
  if ($Hook -ne "pre-commit") { return $Content }
  $replaced = Replace-MarkedBlock $Content $JsonlNormalizeBegin $JsonlNormalizeEnd $jsonlNormalizeBody
  if ($null -ne $replaced) { return $replaced }
  $legacy = Replace-MarkedBlock $Content $LegacyNormalizeBegin $LegacyNormalizeEnd $jsonlNormalizeBody
  if ($null -ne $legacy) { return $legacy }
  $wrapperEnd = $Content.IndexOf($TargetWrapperEnd, [StringComparison]::Ordinal)
  if ($wrapperEnd -ge 0) {
    $insertAt = $wrapperEnd + $TargetWrapperEnd.Length
    if ($insertAt -lt $Content.Length -and $Content[$insertAt] -eq "`n") {
      $insertAt = [int]$insertAt + 1
    }
    return $Content.Substring(0, $insertAt) + $jsonlNormalizeBody + $Content.Substring($insertAt)
  }
  if (-not $Content.EndsWith("`n")) { $Content += "`n" }
  return $Content + $jsonlNormalizeBody
}

function Get-ExpectedHook([string]$Existing, [string]$Hook) {
  if (-not $Existing) {
    return (Add-JsonlNormalize "#!/usr/bin/env sh`n$guardBody" $Hook)
  }

  $content = Normalize-Text $Existing
  $replaced = Replace-MarkedBlock $content $GuardBegin $GuardEnd $guardBody
  if ($null -ne $replaced) {
    $content = $replaced
  } elseif ($content.Contains($BeadsBegin)) {
    # Insert above the beads section so target validation and import run first.
    $idx = $content.IndexOf($BeadsBegin, [StringComparison]::Ordinal)
    $content = $content.Substring(0, $idx) + $guardBody + $content.Substring($idx)
  } else {
    # No beads section: append after the shebang without bypassing later custom
    # hook logic (for example a Husky pre-commit script).
    $lines = $content -split "`n"
    if ($lines[0] -like "#!*") {
      $rest = if ($lines.Count -gt 1) { ($lines[1..($lines.Count - 1)] -join "`n") } else { "" }
      $content = $lines[0] + "`n" + $guardBody + $rest
    } else {
      $content = $guardBody + $content
    }
  }

  $content = Add-BeadsTargetWrapper $content
  # The workspace root owns an additional deterministic-memory normalizer after
  # the managed beads section. It also writes/stages tracker state and must obey
  # the same target decision.
  $content = $content.Replace($NormalizeGuardOld, $NormalizeGuardNew)
  return (Add-JsonlNormalize $content $Hook)
}

# Husky- and vite-plus-managed hooks: core.hooksPath points at a "<dir>/_"
# folder of tiny stubs whose "h" dispatcher runs "<dir>/<hook>". The scripts
# that actually execute live in the parent, so that is where a chain into the
# tracked .beads/hooks belongs; the guard itself stays in .beads/hooks.
function Get-DispatcherScriptsDir([string]$HooksDir) {
  if (-not $HooksDir) { return $null }
  $leaf = Split-Path $HooksDir -Leaf
  if ($leaf -ne "_") { return $null }
  if (-not (Test-Path (Join-Path $HooksDir "h") -PathType Leaf)) { return $null }
  return (Split-Path $HooksDir -Parent)
}

$ChainBegin = "# --- BEGIN KOMBIFY BEADS HOOK CHAIN (platform-qsts1) ---"
$ChainEnd = "# --- END KOMBIFY BEADS HOOK CHAIN (platform-qsts1) ---"
function Get-ChainBody([string]$Hook) {
  return @(
    $ChainBegin,
    '_kb_root="$(git rev-parse --show-toplevel 2>/dev/null)"',
    "if [ -n `"`$_kb_root`" ] && [ -f `"`$_kb_root/.beads/hooks/$Hook`" ]; then",
    "  sh `"`$_kb_root/.beads/hooks/$Hook`" `"`$@`" || exit `$?",
    "fi",
    $ChainEnd,
    ""
  ) -join "`n"
}

function Get-ExpectedChainScript([string]$Existing, [string]$Hook, [string]$TargetContent) {
  $body = Get-ChainBody $Hook
  if (-not $Existing) { return "#!/usr/bin/env sh`n$body" }

  $content = Normalize-Text $Existing
  $replaced = Replace-MarkedBlock $content $ChainBegin $ChainEnd $body
  if ($null -ne $replaced) { $content = $replaced }

  # Get-ExpectedHook preserves a repository's own hook body inside
  # .beads/hooks/<hook>, so a dispatcher script that still carries the same
  # body would run it twice through the chain. Keep only the chain whenever
  # every one of its own commands already lives in the target.
  $ownLines = @(($content -split "`n") | Where-Object {
    $line = $_.Trim()
    $line -and -not $line.StartsWith("#") -and -not $line.StartsWith("#!")
  })
  $chainLines = @(($body -split "`n") | Where-Object { $_.Trim() })
  $carried = @($ownLines | Where-Object { $chainLines -notcontains $_ })
  if ($TargetContent -and $carried.Count -gt 0) {
    $duplicated = @($carried | Where-Object { $TargetContent.Contains($_.Trim()) })
    if ($duplicated.Count -eq $carried.Count) {
      return "#!/usr/bin/env sh`n$body"
    }
  }

  if ($null -ne $replaced) { return $content }
  if (-not $content.EndsWith("`n")) { $content += "`n" }
  return $content + $body
}

function Test-PathInsideRepo([string]$RepoPath, [string]$CandidatePath) {
  $repoFull = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\', '/')
  $candidateFull = [System.IO.Path]::GetFullPath($CandidatePath).TrimEnd('\', '/')
  if ($candidateFull.Equals($repoFull, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $candidateFull.StartsWith($repoFull + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Test-LinkedWorktree([string]$RepoPath) {
  $gitDir = git -C $RepoPath rev-parse --path-format=absolute --git-dir 2>$null
  $commonDir = git -C $RepoPath rev-parse --path-format=absolute --git-common-dir 2>$null
  if (-not $gitDir -or -not $commonDir) { return $false }
  return -not ([System.IO.Path]::GetFullPath($gitDir).Equals(
    [System.IO.Path]::GetFullPath($commonDir),
    [StringComparison]::OrdinalIgnoreCase
  ))
}

function Resolve-HooksDir([string]$RepoPath) {
  $configured = git -C $RepoPath config --get core.hooksPath 2>$null
  if ($configured) {
    $dir = $configured
    if (-not [System.IO.Path]::IsPathRooted($dir)) { $dir = Join-Path $RepoPath $dir }
    $local = Join-Path $RepoPath ".beads/hooks"

    # core.hooksPath is stored in the shared git config. A linked worktree may
    # therefore inherit an absolute path into the canonical checkout. Never
    # write through that path while installing from another checkout; update
    # the tracked repo-local snapshot that will become active after merge.
    if (-not (Test-PathInsideRepo $RepoPath $dir)) {
      if (Test-Path $local -PathType Container) {
        Write-Host "  isolated target safety: using repo-local hooks instead of foreign core.hooksPath ($configured)"
        return $local
      }
      return $null
    }

    if (Test-Path $dir -PathType Container) { return $dir }
    # Dangling hooksPath: kombify-Mobile pointed at the pre-rename
    # kombify-AI-App path, so every hook in that repo was inert.
    if (Test-Path $local -PathType Container) {
      if (-not $Check -and -not (Test-LinkedWorktree $RepoPath)) {
        git -C $RepoPath config core.hooksPath ".beads/hooks" | Out-Null
        Write-Host "  repaired dangling core.hooksPath -> .beads/hooks (was: $configured)"
      } elseif (-not $Check) {
        Write-Host "  linked worktree: left shared core.hooksPath unchanged (was: $configured)"
      } else {
        Write-Host "  DANGLING core.hooksPath: $configured (hooks inert)"
      }
      return $local
    }
    return $null
  }
  $husky = Join-Path $RepoPath ".husky"
  if (Test-Path (Join-Path $husky "_") -PathType Container) { return $husky }
  return (Join-Path $RepoPath ".git/hooks")
}

$targets = @()
$gaps = @()

# A folded repository keeps its tracker in the workspace root. The redirect is
# checkout-local because a standalone clone has no stable path to that authority.
$profilePath = Join-Path $root "internal/standards-enforcement/development-fleet-profile.json"
$manifestPath = Join-Path $root "internal/standards-enforcement/repo-manifest.json"
$redirectTargets = @()
if ((Test-Path $profilePath -PathType Leaf) -and (Test-Path $manifestPath -PathType Leaf)) {
  $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  foreach ($entry in $profile.repositories | Where-Object { $_.beads_hook_safety -eq "workspace-redirect" }) {
    if ($Repo -and $entry.id -notin $Repo) { continue }
    if ($entry.id -in $Skip) { continue }
    $manifestEntry = $manifest.repos | Where-Object { $_.id -eq $entry.id } | Select-Object -First 1
    if (-not $manifestEntry) {
      $gaps += "$($entry.id): manifest entry unavailable for workspace redirect"
      continue
    }
    $repoPath = [System.IO.Path]::GetFullPath((Join-Path $root $manifestEntry.path))
    if (-not (Test-Path $repoPath -PathType Container)) {
      $gaps += "$($entry.id): checkout unavailable for workspace redirect"
      continue
    }
    $redirectTargets += [pscustomobject]@{ Name = $entry.id; Path = $repoPath }
  }
}

foreach ($target in $redirectTargets) {
  $beadsPath = Join-Path $target.Path ".beads"
  $redirectPath = Join-Path $beadsPath "redirect"
  $authorityPath = Join-Path $root ".beads"
  $expected = [System.IO.Path]::GetRelativePath($target.Path, $authorityPath).Replace('\', '/') + "`n"
  $current = if (Test-Path $redirectPath -PathType Leaf) {
    Normalize-Text ([System.IO.File]::ReadAllText($redirectPath))
  } else { $null }
  if ($Check) {
    if ($current -ne $expected) {
      $gaps += "$($target.Name)/.beads/redirect"
      Write-Host "[$($target.Name)] workspace redirect missing or stale"
    } else {
      Write-Host "[$($target.Name)] workspace redirect current"
    }
    continue
  }
  if (-not (Test-Path $beadsPath -PathType Container)) {
    New-Item -ItemType Directory -Path $beadsPath -Force | Out-Null
  }
  if ($current -ne $expected) {
    Write-Text $redirectPath $expected
    Write-Host "[$($target.Name)] workspace redirect installed"
  } else {
    Write-Host "[$($target.Name)] workspace redirect current"
  }
}

# Linked product worktrees sit inside the workspace directory tree. Without a
# checkout-local redirect, `bd -C` walks up into the workspace store.
$worktreeRedirect = Join-Path $PSScriptRoot "install-beads-worktree-redirect.mjs"
if (Test-Path -LiteralPath $worktreeRedirect -PathType Leaf) {
  $worktreeArgs = @($worktreeRedirect, "--root", $root)
  if ($Check) { $worktreeArgs += "--check" }
  & node @worktreeArgs
  if ($Check -and $LASTEXITCODE -ne 0) {
    $gaps += "linked-worktree-redirect"
  }
}

# Every repo that tracks a beads export is exposed to the hazard.
$candidates = @([pscustomobject]@{ Path = $root; Name = "workspace-root" })
$candidates += Get-ChildItem $root -Directory |
  Where-Object { $_.Name -notmatch '^[._]' -and (Test-Path (Join-Path $_.FullName ".git")) } |
  ForEach-Object { [pscustomobject]@{ Path = $_.FullName; Name = $_.Name } }

foreach ($c in $candidates) {
  if ($Repo -and $c.Name -notin $Repo) { continue }
  if ($c.Name -in $Skip) {
    Write-Host "[$($c.Name)] skipped on request"
    continue
  }
  if (-not (Test-Path (Join-Path $c.Path ".beads/issues.jsonl"))) { continue }

  # Repos whose hook directory is git-TRACKED take a committable change here.
  # Never add one to a repo that already carries WIP — that strands the change
  # in somebody else's dirty tree (CLAUDE.md agent-concurrency rule). The
  # workspace root is exempt: it owns this script, so whoever runs it is already
  # committing there.
  $hooksTracked = @(git -C $c.Path ls-files ".beads/hooks" ".githooks" ".husky" 2>$null).Count -gt 0
  $isDirty = @(git -C $c.Path status --porcelain 2>$null | Where-Object { $_ }).Count -gt 0
  if ($hooksTracked -and $isDirty -and $c.Name -ne "workspace-root") {
    Write-Host "[$($c.Name)] skipped: hook directory is tracked and the working tree is dirty"
    if ($Check) { $gaps += "$($c.Name): dirty tracked hook directory was not inspected" }
    continue
  }

  $targets += $c
}

foreach ($t in $targets) {
  Write-Host "[$($t.Name)]"
  $trackedLocalHooks = @(git -C $t.Path ls-files ".beads/hooks" 2>$null).Count -gt 0
  $localHooksDir = Join-Path $t.Path ".beads/hooks"
  $hooksDir = $null

  if ($trackedLocalHooks -and (Test-Path $localHooksDir -PathType Container)) {
    $configured = git -C $t.Path config --get core.hooksPath 2>$null
    $configured = if ($configured) { @($configured)[0].Trim() } else { "" }
    $configuredNormalized = $configured.Replace('\', '/')
    $configuredTarget = if (-not $configured) {
      ""
    } elseif ([System.IO.Path]::IsPathRooted($configured)) {
      $configured
    } else {
      Join-Path $t.Path $configured
    }
    $targetsLocalHooks = $configuredTarget -and
      ([System.IO.Path]::GetFullPath($configuredTarget).TrimEnd('\', '/').Equals(
        [System.IO.Path]::GetFullPath($localHooksDir).TrimEnd('\', '/'),
        [StringComparison]::OrdinalIgnoreCase
      ))

    if ($configuredNormalized -eq ".beads/hooks") {
      $hooksDir = $localHooksDir
    } elseif (-not $configured -or $targetsLocalHooks) {
      if ($Check) {
        $actual = if ($configured) { $configured } else { "unset" }
        $gaps += "$($t.Name)/core.hooksPath"
        Write-Host "  core.hooksPath : expected relative .beads/hooks (actual: $actual)"
      } elseif (Test-LinkedWorktree $t.Path) {
        Write-Host "  linked worktree: left shared core.hooksPath unchanged (was: $configured)"
      } else {
        git -C $t.Path config core.hooksPath ".beads/hooks" | Out-Null
        Write-Host "  normalized core.hooksPath -> .beads/hooks (was: $(if ($configured) { $configured } else { 'unset' }))"
      }
      $hooksDir = $localHooksDir
    } elseif ((Test-LinkedWorktree $t.Path) -and -not (Test-PathInsideRepo $t.Path $configuredTarget)) {
      if ($Check) {
        $gaps += "$($t.Name)/core.hooksPath"
        Write-Host "  core.hooksPath : linked worktree inherited foreign target ($configured)"
      } else {
        Write-Host "  isolated target safety: using repo-local hooks instead of foreign core.hooksPath ($configured)"
      }
      $hooksDir = $localHooksDir
    } elseif (($scriptsDir = Get-DispatcherScriptsDir $configuredTarget)) {
      # The dispatcher runs <scripts>/<hook>; chain those into the tracked
      # .beads/hooks so the guard and the beads integration keep executing.
      Write-Host "  managed dispatcher: chaining $(Split-Path $scriptsDir -Leaf)/<hook> into .beads/hooks"
      foreach ($chainHook in $hookNames) {
        $chainPath = Join-Path $scriptsDir $chainHook
        $chainExisting = if (Test-Path $chainPath) { [System.IO.File]::ReadAllText($chainPath) } else { $null }
        $chainTargetPath = Join-Path $localHooksDir $chainHook
        $chainTarget = if (Test-Path $chainTargetPath) { [System.IO.File]::ReadAllText($chainTargetPath) } else { "" }
        $chainExpected = Get-ExpectedChainScript $chainExisting $chainHook $chainTarget
        if ($Check) {
          if ($null -eq $chainExisting -or (Normalize-Text $chainExisting) -ne $chainExpected -or -not (Test-HookExecutable $chainPath)) {
            $gaps += "$($t.Name)/$(Split-Path $scriptsDir -Leaf)/$chainHook"
            Write-Host "  $chainHook : CHAIN MISSING OR STALE"
          }
        } elseif ($null -eq $chainExisting -or (Normalize-Text $chainExisting) -ne $chainExpected -or -not (Test-HookExecutable $chainPath)) {
          Write-Hook $chainPath $chainExpected
          Write-Host "  $chainHook : chain installed/refreshed"
        }
      }
      $hooksDir = $localHooksDir
    } else {
      $gaps += "$($t.Name)/core.hooksPath"
      Write-Host "  core.hooksPath : custom target requires dedicated reconciliation ($configured)"
      continue
    }
  } else {
    $hooksDir = Resolve-HooksDir $t.Path
  }

  if (-not $hooksDir) {
    $gaps += "$($t.Name): no usable hooks directory"
    Write-Host "  SKIP: no usable hooks directory"
    continue
  }
  if (-not $Check -and -not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
  }

  # Earlier bd installs also carry preparation/push hooks. Protect existing ones
  # without creating extra hooks or changing the projected consumer contract.
  $targetHookNames = @($hookNames)
  $targetHookNames += @("prepare-commit-msg", "pre-push") | Where-Object { Test-Path (Join-Path $hooksDir $_) -PathType Leaf }
  foreach ($hook in $targetHookNames) {
    $path = Join-Path $hooksDir $hook
    $existing = if (Test-Path $path) { [System.IO.File]::ReadAllText($path) } else { $null }

    $expected = Get-ExpectedHook $existing $hook
    $current = Normalize-Text $existing

    if ($Check) {
      if ($null -eq $current -or $current -ne $expected -or -not (Test-HookExecutable $path)) {
        $gaps += "$($t.Name)/$hook"
        Write-Host "  $hook : GUARD MISSING OR STALE"
      } else {
        Write-Host "  $hook : guard current"
      }
      continue
    }

    if ($null -ne $current -and $current -eq $expected -and (Test-HookExecutable $path)) {
      Write-Host "  $hook : guard current"
      continue
    }
    Write-Hook $path $expected
    Write-Host "  $hook : guard installed/refreshed"
  }
}

if ($Check) {
  if ($gaps.Count -gt 0) {
    Write-Host "Beads hook safety has $($gaps.Count) gap(s) — run: pwsh scripts/install-beads-hook-guard.ps1" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "beads hook-safety guard present in all $($targets.Count) beads-tracking repo(s)."
  exit 0
}

Write-Host "beads hook-safety guard installed across $($targets.Count) beads-tracking repo(s) (platform-qsts1)."
