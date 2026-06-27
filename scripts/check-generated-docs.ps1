[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

function Get-MdxFrontmatter {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $lines = @(Get-Content -LiteralPath $Path)
    $frontmatter = @{}
    if ($lines.Count -lt 3 -or $lines[0].Trim() -ne "---") {
        return $frontmatter
    }

    $endIndex = -1
    for ($i = 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq "---") {
            $endIndex = $i
            break
        }
    }
    if ($endIndex -lt 0) {
        return $frontmatter
    }

    for ($i = 1; $i -lt $endIndex; $i++) {
        $line = $lines[$i]
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }
        if ($line -notmatch '^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*$') {
            continue
        }

        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $frontmatter[$key] = $value
    }

    return $frontmatter
}

function Is-GeneratedTrue {
    param($Frontmatter)

    if (-not $Frontmatter.ContainsKey("generated")) {
        return $false
    }
    return $Frontmatter["generated"].ToString().Trim().ToLowerInvariant() -eq "true"
}

$generatedDocs = [System.Collections.Generic.List[string]]::new()
$failures = [System.Collections.Generic.List[string]]::new()

$mdxFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Filter "*.mdx" |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($file in $mdxFiles) {
    $frontmatter = Get-MdxFrontmatter -Path $file.FullName
    if (-not (Is-GeneratedTrue -Frontmatter $frontmatter)) {
        continue
    }

    $relativePath = [System.IO.Path]::GetRelativePath($repoRoot, $file.FullName).Replace("\", "/")
    $generatedDocs.Add($relativePath) | Out-Null

    foreach ($requiredKey in @("generatedBy", "sourceHash", "contentHash")) {
        if (-not $frontmatter.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace($frontmatter[$requiredKey])) {
            $failures.Add("${relativePath}: generated:true requires frontmatter '${requiredKey}'") | Out-Null
        }
    }

    if ($frontmatter.ContainsKey("generatedBy") -and $frontmatter["generatedBy"] -ne "stackkit docs emit-mintlify") {
        $failures.Add("${relativePath}: generatedBy must be 'stackkit docs emit-mintlify'") | Out-Null
    }
}

if ($failures.Count -gt 0) {
    Write-Host "generated docs ownership failures:"
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    throw "generated docs ownership validation failed"
}

Write-Host "generated_docs: $($generatedDocs.Count)"
foreach ($path in ($generatedDocs | Sort-Object)) {
    Write-Host " - $path"
}
Write-Host "generated_docs_ownership: ok"
