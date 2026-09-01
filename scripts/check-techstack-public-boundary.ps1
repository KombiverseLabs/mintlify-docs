[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$requirements = @{
    "techstack/overview.mdx" = @(
        @{ Pattern = '(?i)\b(?:alpha|preview)\b'; Reason = "missing pre-1.0 availability label" }
    )
    "techstack/operating-modes.mdx" = @(
        @{ Pattern = '(?i)\bStackKits\b'; Reason = "missing StackKits execution boundary" }
    )
    "techstack/availability.mdx" = @(
        @{ Pattern = '(?i)\bWindows Alpha\b'; Reason = "missing released Windows Alpha status" }
    )
    "techstack/install-windows.mdx" = @(
        @{ Pattern = '(?i)https://github\.com/kombifyio/TechStack'; Reason = "missing official public source link" },
        @{ Pattern = '(?i)releases/latest/download/kombify-Techstack-Setup\.exe'; Reason = "missing official Windows Alpha asset" },
        @{ Pattern = '(?i)\bunsigned\b'; Reason = "missing unsigned-build warning" }
    )
}

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $requirements.Keys) {
    $fullPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        $errors.Add("missing Techstack boundary page: $relativePath") | Out-Null
        continue
    }
    $content = Get-Content -LiteralPath $fullPath -Raw
    foreach ($requirement in $requirements[$relativePath]) {
        if ($content -notmatch $requirement.Pattern) {
            $errors.Add("$relativePath $($requirement.Reason)") | Out-Null
        }
    }
}

$techstackFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "techstack") -File -Filter "*.mdx" |
        Sort-Object FullName
)
foreach ($file in $techstackFiles) {
    $relative = $file.FullName.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($rule in @(
        @{ Pattern = '(?i)\b(?:generally available|production-ready|GA release)\b'; Reason = "unsupported availability claim" }
    )) {
        if ($content -match $rule.Pattern) {
            $errors.Add("$relative contains $($rule.Reason)") | Out-Null
        }
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Techstack public-boundary violations:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "Techstack public-boundary validation failed"
}

Write-Host "techstack_public_release: windows-alpha"
Write-Host "techstack_public_boundary_files_checked: $($techstackFiles.Count)"
Write-Host "techstack_public_boundary: ok"
