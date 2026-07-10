[CmdletBinding()]
param(
    [Alias("SkipMintCli")]
    [switch]$SkipPreview,
    [switch]$RunMintBrokenLinksAdvisory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mintVersion = "4.2.684"
$mintSpec = "mint@$mintVersion"
$previewBaseUrl = "http://localhost:3000"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

$sha = (& git rev-parse HEAD 2>&1).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Could not resolve git SHA: $sha"
}

Write-Host "repo: mintlify-docs"
Write-Host "sha: $sha"
Write-Host "cwd: $repoRoot"
Write-Host "command: scripts/run-local-e2e.ps1"

$docsJsonPath = Join-Path $repoRoot "docs.json"
if (-not (Test-Path -LiteralPath $docsJsonPath -PathType Leaf)) {
    throw "docs.json is missing"
}

$docs = Get-Content -LiteralPath $docsJsonPath -Raw | ConvertFrom-Json

function Normalize-DocPath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    $value = $PathValue.Trim()
    if ($value -eq "") { return "" }
    $value = $value -replace "\\", "/"
    if ($value.StartsWith("/")) {
        $value = $value.TrimStart("/")
    }
    if ($value -like "*.mdx") {
        $value = $value.Substring(0, $value.Length - 4)
    }
    if ($value.EndsWith("/")) {
        $value = $value.TrimEnd("/")
    }
    return $value
}

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

$activePages = ($pages | ForEach-Object { Normalize-DocPath -PathValue $_ } | Where-Object { $_ -ne "" } | Sort-Object -Unique)
$activePageSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($page in $activePages) {
    $null = $activePageSet.Add($page)
}

$missingPages = [System.Collections.Generic.List[string]]::new()
foreach ($page in $activePages) {
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

function Resolve-DocLinkTarget {
    param(
        [Parameter(Mandatory = $true)][string]$CurrentPage,
        [Parameter(Mandatory = $true)][string]$LinkTarget
    )

    $target = $LinkTarget.Trim()
    if ([string]::IsNullOrWhiteSpace($target)) { return $null }
    if ($target.StartsWith("#")) { return $null }
    if ($target -match '^(mailto:|tel:|data:|https?:|ftp:)') { return $null }
    if ($target.StartsWith("//")) { return $null }

    $target = ($target -split "[#?]")[0]
    if ([string]::IsNullOrWhiteSpace($target)) { return $null }

    if ($target.StartsWith("/")) {
        return "/" + (Normalize-DocPath -PathValue $target)
    }

    $currentDir = Split-Path -Path $CurrentPage -Parent
    $basePath = if ([string]::IsNullOrWhiteSpace($currentDir)) { "" } else { $currentDir -replace "\\", "/" }
    $combined = if ([string]::IsNullOrWhiteSpace($basePath)) { $target } else { "$basePath/$target" }

    $parts = $combined -split "/"
    $stack = New-Object System.Collections.Generic.List[string]
    foreach ($part in $parts) {
        if ($part -eq "" -or $part -eq ".") { continue }
        if ($part -eq "..") {
            if ($stack.Count -gt 0) { $stack.RemoveAt($stack.Count - 1) }
            continue
        }
        $stack.Add($part)
    }
    $normalized = ($stack -join "/")
    return "/" + (Normalize-DocPath -PathValue $normalized)
}

function Assert-InternalLinkOrAsset {
    param(
        [Parameter(Mandatory = $true)][string]$ResolvedTarget,
        [Parameter(Mandatory = $true)][string]$SourcePage
    )

    $normalized = Normalize-DocPath -PathValue $ResolvedTarget
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        if ($ResolvedTarget -eq "/" -or $ResolvedTarget -eq "") { $normalized = "index" } else { return }
    }

    $asFile = Join-Path $repoRoot ($normalized -replace "/", "\")
    if ($ResolvedTarget -match '\.[a-zA-Z0-9]+$') {
        if (-not (Test-Path -LiteralPath $asFile -PathType Leaf)) {
            throw "Broken internal asset link in '$SourcePage': '$ResolvedTarget'"
        }
        return
    }

    if ($activePageSet.Contains($normalized)) {
        return
    }
    $mdxCandidate = Join-Path $repoRoot (($normalized -replace "/", "\") + ".mdx")
    if (Test-Path -LiteralPath $mdxCandidate -PathType Leaf) {
        return
    }
    throw "Broken internal doc link in '$SourcePage': '$ResolvedTarget'"
}

foreach ($page in $activePages) {
    $pagePath = Join-Path $repoRoot (($page -replace "/", "\") + ".mdx")
    $content = Get-Content -LiteralPath $pagePath -Raw

    $markdownMatches = [regex]::Matches($content, '\]\(([^)]+)\)')
    foreach ($match in $markdownMatches) {
        $resolved = Resolve-DocLinkTarget -CurrentPage $page -LinkTarget $match.Groups[1].Value
        if ($null -ne $resolved) {
            Assert-InternalLinkOrAsset -ResolvedTarget $resolved -SourcePage $page
        }
    }

    $hrefMatches = [regex]::Matches($content, '(href|src)\s*=\s*"([^"]+)"')
    foreach ($match in $hrefMatches) {
        $resolved = Resolve-DocLinkTarget -CurrentPage $page -LinkTarget $match.Groups[2].Value
        if ($null -ne $resolved) {
            Assert-InternalLinkOrAsset -ResolvedTarget $resolved -SourcePage $page
        }
    }
}

if ($docs.PSObject.Properties.Name -contains "redirects") {
    foreach ($redirect in $docs.redirects) {
        if ($null -eq $redirect.destination) { continue }
        $destination = [string]$redirect.destination
        if ($destination -match '^(https?:|mailto:|tel:)') { continue }
        if (-not $destination.StartsWith("/")) { continue }
        $resolved = "/" + (Normalize-DocPath -PathValue (($destination -split "[#?]")[0]))
        if ($resolved -eq "/") { continue }
        Assert-InternalLinkOrAsset -ResolvedTarget $resolved -SourcePage ("redirect:" + [string]$redirect.source)
    }
}

if (-not $activePageSet.Contains("index")) {
    throw "Active page set must include 'index'"
}

$allMdxPages = Get-ChildItem -Path $repoRoot -Recurse -File -Filter "*.mdx" |
    ForEach-Object {
        $fullName = $_.FullName
        $relative = if ($fullName.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $fullName.Substring($repoRoot.Length).TrimStart("\", "/")
        } else {
            $fullName
        }
        $relative = $relative -replace "\\", "/"
        Normalize-DocPath -PathValue $relative
    } |
    Sort-Object -Unique

$orphanPages = [System.Collections.Generic.List[string]]::new()
foreach ($mdxPage in $allMdxPages) {
    if (-not $activePageSet.Contains($mdxPage)) {
        $orphanPages.Add($mdxPage) | Out-Null
    }
}
if ($orphanPages.Count -gt 0) {
    Write-Host "orphan pages (not in docs.json navigation):"
    foreach ($orphan in $orphanPages) {
        Write-Host " - $orphan"
    }
    throw "Found orphan MDX pages"
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
Write-Host "navigation_pages: $($activePages.Count)"
Write-Host "orphan_pages: 0"
Write-Host "links: ok"
Write-Host "redirects: ok"

if (-not $SkipPreview) {
    $npxVersion = (& npx --version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "npx is not available for Mint preview validation: $npxVersion"
    }
    Write-Host "npx: $($npxVersion.Trim())"

    $stdoutLog = Join-Path $env:TEMP ("mint-preview-stdout-" + [guid]::NewGuid().ToString("N") + ".log")
    $stderrLog = Join-Path $env:TEMP ("mint-preview-stderr-" + [guid]::NewGuid().ToString("N") + ".log")
    $mintProc = $null

    try {
        $mintCommand = "npx -y $mintSpec dev"
        $mintProc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", $mintCommand) -WorkingDirectory $repoRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
        Write-Host "mint_preview_pid: $($mintProc.Id)"

        $ready = $false
        $previewTimeout = [TimeSpan]::FromMinutes(5)
        $deadline = (Get-Date).Add($previewTimeout)
        do {
            if ($mintProc.HasExited) {
                $stdoutTail = if (Test-Path -LiteralPath $stdoutLog) { (Get-Content -LiteralPath $stdoutLog -Tail 25 | Out-String) } else { "" }
                $stderrTail = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Tail 25 | Out-String) } else { "" }
                throw "Mint preview exited before ready.`nSTDOUT:`n$stdoutTail`nSTDERR:`n$stderrTail"
            }

            try {
                $response = Invoke-WebRequest -Uri $previewBaseUrl -UseBasicParsing -TimeoutSec 3
                if ($response.StatusCode -eq 200) {
                    $ready = $true
                    break
                }
            } catch {
                Start-Sleep -Milliseconds 500
            }
        } while ((Get-Date) -lt $deadline)

        if (-not $ready) {
            $stdoutTail = if (Test-Path -LiteralPath $stdoutLog) { (Get-Content -LiteralPath $stdoutLog -Tail 25 | Out-String) } else { "" }
            $stderrTail = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Tail 25 | Out-String) } else { "" }
            throw "Mint preview did not become ready within $($previewTimeout.TotalSeconds) seconds.`nSTDOUT:`n$stdoutTail`nSTDERR:`n$stderrTail"
        }

        $smokePaths = @(
            "/",
            "/platform/overview",
            "/platform/product-hierarchy",
            "/platform/operating-modes",
            "/platform/oss-core-and-wave1",
            "/platform/cloud-and-premium",
            "/support/support-and-denial-envelopes",
            "/journeys/anonymous-discovery",
            "/journeys/oss-local",
            "/journeys/connected-free",
            "/journeys/paid-operated",
            "/journeys/companion-voice"
        )

        foreach ($smokePath in $smokePaths) {
            $uri = $previewBaseUrl + $smokePath
            $res = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 8
            if ($res.StatusCode -ne 200) {
                throw "Preview smoke failed: $uri returned status $($res.StatusCode)"
            }
            if (-not ($res.Content -match '<html')) {
                throw "Preview smoke failed: $uri did not return HTML content"
            }
            Write-Host "smoke_ok: $uri"
        }
    }
    finally {
        if ($null -ne $mintProc) {
            try {
                if (-not $mintProc.HasExited) {
                    Stop-Process -Id $mintProc.Id -Force
                }
            } catch {
                Write-Host "warning: could not stop mint preview process $($mintProc.Id): $($_.Exception.Message)"
            }
        }
        foreach ($log in @($stdoutLog, $stderrLog)) {
            if (Test-Path -LiteralPath $log) {
                Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

if ($RunMintBrokenLinksAdvisory) {
    Write-Host "advisory: running mint broken-links with pinned version $mintVersion"
    & npx -y $mintSpec broken-links
    if ($LASTEXITCODE -ne 0) {
        Write-Host "advisory_result: mint broken-links returned non-zero exit code ($LASTEXITCODE)"
    }
}

Write-Host "result: PASS"
