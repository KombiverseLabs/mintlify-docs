[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# SpeechKit release truth, version-free edition.
#
# The previous version of this gate pinned every SpeechKit page to one exact
# tag and forbade `releases/latest`. That kept the claims verifiable and the
# pages frozen: the docs still described v0.52.14 eighteen minor releases
# later, because moving them meant editing this file by hand.
#
# The contract now is the other way round. Download links must be mutable
# (`releases/latest/...`), so they cannot rot, and the only version-bearing
# text is one generated block per page that
# scripts/sync-speechkit-release-docs.mjs reconciles against the published
# release. This gate checks the shape of the links and delegates the version
# claim to that script's offline --check mode.

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$errors = [System.Collections.Generic.List[string]]::new()

$speechKitFiles = @(
    if (Test-Path -LiteralPath (Join-Path $repoRoot "speechkit") -PathType Container) {
        Get-ChildItem -LiteralPath (Join-Path $repoRoot "speechkit") -File -Filter "*.mdx" |
            Sort-Object FullName
    }
)
foreach ($file in $speechKitFiles) {
    $relative = $file.FullName.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $content = Get-Content -LiteralPath $file.FullName -Raw

    if ($content -match '(?i)releases/download/v\d') {
        $errors.Add("$relative pins a download URL to one release; use releases/latest/download/") | Out-Null
    }
    if ($content -match '(?i)go get\s+github\.com/kombifyio/SpeechKit(?!@latest)') {
        $errors.Add("$relative installs the Go module without @latest") | Out-Null
    }
    if ($content -match '(?i)\bLinux\b.{0,24}\bdesktop\b.{0,24}\b(?:is|are)\s+(?:supported|available)') {
        $errors.Add("$relative claims an unsupported Linux desktop package") | Out-Null
    }
    if ($content -match '(?i)ghcr\.io/kombifyio/speechkit-server') {
        $errors.Add("$relative offers a container image that is not anonymously pullable") | Out-Null
    }
}

if ($errors.Count -gt 0) {
    Write-Host "SpeechKit release-truth violations:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "SpeechKit release-truth validation failed"
}

& node (Join-Path $PSScriptRoot "sync-speechkit-release-docs.mjs") --check --repo-root $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw "SpeechKit generated release block validation failed"
}

Write-Host "speechkit_release_truth_files_checked: $($speechKitFiles.Count)"
Write-Host "speechkit_release_truth: ok"
