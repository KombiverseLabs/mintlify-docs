[CmdletBinding()]
param(
    [switch]$SkipMintCli,
    [string]$Sha = $env:LOCAL_E2E_SHA
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

if ([string]::IsNullOrWhiteSpace($Sha)) {
    $Sha = (& git rev-parse HEAD 2>&1).Trim()
    if ($LASTEXITCODE -ne 0) {
        $Sha = "unknown-no-git"
    }
}

Write-Host "repo: mintlify-docs"
Write-Host "sha: $Sha"
Write-Host "cwd: $repoRoot"
Write-Host "command: scripts/run-local-e2e.ps1"

$docsJsonPath = Join-Path $repoRoot "docs.json"
if (-not (Test-Path -LiteralPath $docsJsonPath -PathType Leaf)) {
    throw "docs.json is missing"
}

$docs = Get-Content -LiteralPath $docsJsonPath -Raw | ConvertFrom-Json

function Add-PageRef {
    param($Node, [System.Collections.Generic.List[string]]$Pages)

    if ($null -eq $Node) {
        return
    }

    if ($Node -is [string]) {
        $Pages.Add($Node) | Out-Null
        return
    }

    if ($Node -is [System.Array]) {
        foreach ($item in $Node) {
            Add-PageRef -Node $item -Pages $Pages
        }
        return
    }

    foreach ($property in $Node.PSObject.Properties) {
        if ($property.Name -eq "pages") {
            Add-PageRef -Node $property.Value -Pages $Pages
        } elseif ($property.Name -in @("groups", "tabs")) {
            Add-PageRef -Node $property.Value -Pages $Pages
        }
    }
}

$pages = [System.Collections.Generic.List[string]]::new()
Add-PageRef -Node $docs.navigation -Pages $pages

$missingPages = [System.Collections.Generic.List[string]]::new()
foreach ($page in ($pages | Sort-Object -Unique)) {
    $candidate = Join-Path $repoRoot ($page + ".mdx")
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $missingPages.Add($page) | Out-Null
    }
}

if ($missingPages.Count -gt 0) {
    Write-Host "missing navigation pages:"
    foreach ($page in $missingPages) {
        Write-Host " - $page"
    }
    throw "docs.json references missing MDX pages"
}

foreach ($assetPath in @($docs.favicon, $docs.logo.light, $docs.logo.dark)) {
    if ([string]::IsNullOrWhiteSpace($assetPath)) {
        continue
    }
    $relativeAssetPath = $assetPath.TrimStart("/")
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativeAssetPath) -PathType Leaf)) {
        throw "Configured asset is missing: $assetPath"
    }
}

Write-Host "docs_json: ok"
Write-Host "navigation_pages: $($pages.Count)"

& (Join-Path $PSScriptRoot "check-internal-links.ps1")

if (-not $SkipMintCli) {
    $npxVersion = (& npx --version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "npx is not available for Mintlify validation: $npxVersion"
    }
    Write-Host "npx: $($npxVersion.Trim())"
    & npx -y mint@latest validate
    if ($LASTEXITCODE -ne 0) {
        throw "Mintlify validate failed"
    }
}

Write-Host "result: PASS"
