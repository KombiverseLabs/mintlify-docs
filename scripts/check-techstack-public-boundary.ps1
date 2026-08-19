[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$requirements = @{
    "techstack/overview.mdx" = @(
        "Techstack is currently a preview",
        "No public Techstack installer or anonymous source distribution is available today",
        "https://techstack.kombify.io"
    )
    "techstack/operating-modes.mdx" = @(
        "The local Techstack distribution is still part of the preview and is not a public download yet",
        "Techstack does not become a second renderer or bypass StackKits validation"
    )
    "techstack/availability.mdx" = @(
        "its open-core distribution has not been released",
        "There is no supported public Techstack installation path until an official release is published"
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
    $normalizedContent = [regex]::Replace($content, '\s+', ' ')
    foreach ($requiredText in $requirements[$relativePath]) {
        if ($normalizedContent.IndexOf($requiredText, [System.StringComparison]::Ordinal) -lt 0) {
            $errors.Add("$relativePath is missing public-boundary text '$requiredText'") | Out-Null
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
        @{ Pattern = '(?i)github\.com/(?:KombiverseLabs/kombify-Techstack|kombifyio/techstack)'; Reason = "non-public Techstack repository link" },
        @{ Pattern = '(?im)^\s*```(?:bash|sh|shell|console|powershell|pwsh)\s*$'; Reason = "synthetic Techstack installation or lifecycle command" },
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

Write-Host "techstack_public_docs_source_sha: 9e5c30e699a482d149d89f9a3383db6718a9e360"
Write-Host "techstack_public_boundary_files_checked: $($techstackFiles.Count)"
Write-Host "techstack_public_boundary: ok"
