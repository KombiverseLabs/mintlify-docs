[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$requirements = @{
    "speechkit/overview.mdx" = @(
        "https://github.com/kombifyio/SpeechKit/releases/tag/v0.52.14",
        "SpeechKit is beta software"
    )
    "speechkit/install-windows.mdx" = @(
        "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SpeechKit-Setup.exe",
        "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SpeechKit-Portable.zip",
        "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SHA256SUMS.txt",
        "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/UNSIGNED-WINDOWS-RELEASE.txt",
        "Windows 10 and Windows 11 on x64 systems"
    )
    "speechkit/framework.mdx" = @(
        "go get github.com/kombifyio/SpeechKit@v0.52.14",
        "Go 1.26 or newer"
    )
}

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $requirements.Keys) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $errors.Add("missing release-truth page: $relativePath") | Out-Null
        continue
    }
    $content = Get-Content -LiteralPath $fullPath -Raw
    foreach ($requiredText in $requirements[$relativePath]) {
        if ($content.IndexOf($requiredText, [System.StringComparison]::Ordinal) -lt 0) {
            $errors.Add("$relativePath is missing exact release-backed text '$requiredText'") | Out-Null
        }
    }
}

$speechKitFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "speechkit") -File -Filter "*.mdx" |
        Sort-Object FullName
)
foreach ($file in $speechKitFiles) {
    $relative = $file.FullName.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $content = Get-Content -LiteralPath $file.FullName -Raw
    if ($content -match '(?i)releases/(?:latest|download/latest)') {
        $errors.Add("$relative uses a mutable latest release link") | Out-Null
    }
    if ($content -match '(?i)go get\s+github\.com/kombifyio/SpeechKit(?!@v0\.52\.14)') {
        $errors.Add("$relative uses an unpinned or wrong SpeechKit Go module version") | Out-Null
    }
    if ($content -match '(?i)\b(?:macOS|Linux)\b.{0,24}\bdesktop\b.{0,24}\b(?:is|are)\s+(?:supported|available)') {
        $errors.Add("$relative claims an unsupported macOS or Linux desktop package") | Out-Null
    }
}

if ($errors.Count -gt 0) {
    Write-Host "SpeechKit release-truth violations:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "SpeechKit release-truth validation failed"
}

Write-Host "speechkit_release: v0.52.14"
Write-Host "speechkit_public_tag_sha: 46ed2b0580fb7ff412c7b88db96401973a4c7a2e"
Write-Host "speechkit_release_truth_files_checked: $($speechKitFiles.Count)"
Write-Host "speechkit_release_truth: ok"
