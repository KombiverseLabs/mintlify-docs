[CmdletBinding()]
param(
    [Alias("SkipMintCli")]
    [switch]$SkipPreview,
    [string]$Sha = $env:LOCAL_E2E_SHA
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mintSpec = "mint@4.2.684"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

if ([string]::IsNullOrWhiteSpace($Sha)) {
    $Sha = (& git rev-parse HEAD 2>&1).Trim()
    if ($LASTEXITCODE -ne 0) {
        $Sha = "unknown-no-git"
    }
}

$sourcePaths = @(
    & git ls-files -co --exclude-standard 2>&1 |
        Where-Object { $_ -notmatch '^\.beads[/\\]' } |
        Sort-Object -Unique
)
if ($LASTEXITCODE -ne 0) {
    throw "Could not enumerate source files for the local E2E digest"
}
$digestLines = [System.Collections.Generic.List[string]]::new()
foreach ($sourcePath in $sourcePaths) {
    $absolutePath = Join-Path $repoRoot $sourcePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        continue
    }
    $fileStream = [System.IO.File]::OpenRead($absolutePath)
    $fileHasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $fileHash = ([System.BitConverter]::ToString($fileHasher.ComputeHash($fileStream))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $fileHasher.Dispose()
        $fileStream.Dispose()
    }
    $digestLines.Add("$fileHash  $($sourcePath.Replace('\', '/'))") | Out-Null
}
$digestInput = [System.Text.Encoding]::UTF8.GetBytes(($digestLines -join "`n"))
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $sourceDigest = ([System.BitConverter]::ToString($sha256.ComputeHash($digestInput))).Replace("-", "").ToLowerInvariant()
}
finally {
    $sha256.Dispose()
}
$worktreeStatus = @(& git status --porcelain=v1 --untracked-files=all)
$worktreeState = if ($worktreeStatus.Count -eq 0) { "clean" } else { "dirty" }

Write-Host "repo: mintlify-docs"
Write-Host "sha: $sha"
Write-Host "source_digest: sha256:$sourceDigest"
Write-Host "source_files: $($digestLines.Count)"
Write-Host "worktree_state: $worktreeState"
Write-Host "cwd: $repoRoot"
Write-Host "command: scripts/run-local-e2e.ps1"

& (Join-Path $PSScriptRoot "test-public-safety.ps1")
& (Join-Path $PSScriptRoot "assert-public-safety.ps1") -RepoRoot $repoRoot

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
        } elseif ($property.Name -eq "root" -and $property.Value -is [string]) {
            $Pages.Add($property.Value) | Out-Null
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
& (Join-Path $PSScriptRoot "check-content-rules.ps1")

if (-not $SkipPreview) {
    $npxVersion = (& npx --version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "npx is not available for Mintlify validation: $npxVersion"
    }
    Write-Host "npx: $($npxVersion.Trim())"
    # `mint validate` rather than `mint broken-links`.
    #
    # broken-links does not resolve root-relative targets against this
    # docs.json: it reported 153 broken links whose 52 distinct targets ALL
    # exist as .mdx files AND appear in the navigation, and all 52 are linked
    # root-relative while none of the absolute-URL targets were flagged.
    # mint@latest reproduces it identically, so it is not a stale pin. Keeping
    # it meant the release gate could only go green by rewriting correct links
    # into absolute URLs, which is the reverse of what this repo decided.
    #
    # Link coverage does not drop: check-internal-links.ps1 above matches both
    # markdown links and JSX href attributes and resolves each target against
    # the navigation and the file tree, which is what broken-links gets wrong.
    #
    # What mint is kept for is MDX build validation, which broken-links only
    # provided as a side effect and which earned its place: it is what caught
    # five conflict markers that had been committed into cloud-kit.mdx and
    # shipped live. Verified both directions - injecting a conflict marker
    # makes `mint validate` exit 1, and removing it exits 0.
    & npx -y $mintSpec validate
    if ($LASTEXITCODE -ne 0) {
        throw "Mintlify build validation failed"
    }
}

if (-not $SkipPreview) {
    & (Join-Path $PSScriptRoot "run-local-preview-smoke.ps1") -RepoRoot $repoRoot -MintSpec $mintSpec
} else {
    Write-Host "mint_preview: skipped"
    Write-Host "local_http_smoke: skipped"
}

Write-Host "result: PASS"
