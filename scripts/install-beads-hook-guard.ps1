# Refresh Kombify's tracker-free Git hook projection; preserve unrelated hooks.
# No tracker bootstrap, redirects, local database or shared Git config changes.
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
$profile = Get-Content (Join-Path $sourceRoot "internal/standards-enforcement/development-fleet-profile.json") -Raw | ConvertFrom-Json
$manifest = Get-Content (Join-Path $sourceRoot "internal/standards-enforcement/repo-manifest.json") -Raw | ConvertFrom-Json
$priorRoot = $env:KOMBIFY_WORKSPACE_ROOT
try {
  $env:KOMBIFY_WORKSPACE_ROOT = $root
  foreach ($entry in $profile.repositories) {
    if ($entry.beads_hook_safety -eq "none" -or $entry.id -in $Skip) { continue }
    $target = $manifest.repos | Where-Object { $_.id -eq $entry.id } | Select-Object -First 1
    if (-not $target -or -not (Test-Path (Join-Path $root $target.path) -PathType Container)) { continue }
    $selected = $entry.id -in $Repo -or ($entry.id -eq "kombify-workspace" -and "workspace-root" -in $Repo)
    if ($Repo -and -not $selected) { continue }
    $arguments = @((Join-Path $PSScriptRoot "project-development-fleet.mjs"), "--repo", $entry.id, "--beads-only")
    if (-not $Check) { $arguments += "--write" }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "Hook projection failed for $($entry.id)" }
  }
} finally {
  $env:KOMBIFY_WORKSPACE_ROOT = $priorRoot
}
