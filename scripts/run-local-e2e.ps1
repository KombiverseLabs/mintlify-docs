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
$previewBaseUrl = $null

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

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Get-ListeningProcessIds {
    param([Parameter(Mandatory = $true)][int]$Port)
    try {
        $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
        return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    }
    catch {
        return @()
    }
}

function Get-ProcessDescendantIds {
    param([Parameter(Mandatory = $true)][int]$RootPid)

    $descendants = New-Object System.Collections.Generic.List[int]
    $visited = New-Object System.Collections.Generic.HashSet[int]
    $queue = New-Object System.Collections.Generic.Queue[int]
    $queue.Enqueue($RootPid)
    $null = $visited.Add($RootPid)

    while ($queue.Count -gt 0) {
        $currentPid = $queue.Dequeue()
        $children = @(Get-CimInstance -ClassName Win32_Process -Filter "ParentProcessId = $currentPid" -ErrorAction SilentlyContinue)
        foreach ($child in $children) {
            $childPid = [int]$child.ProcessId
            if ($visited.Add($childPid)) {
                $descendants.Add($childPid) | Out-Null
                $queue.Enqueue($childPid)
            }
        }
    }

    return @($descendants)
}

function Stop-ProcessTreeByPid {
    param([Parameter(Mandatory = $true)][int]$RootPid)

    $descendants = @(Get-ProcessDescendantIds -RootPid $RootPid)
    foreach ($procId in ($descendants | Sort-Object -Descending)) {
        $childProc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($null -ne $childProc) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }

    $rootProc = Get-Process -Id $RootPid -ErrorAction SilentlyContinue
    if ($null -ne $rootProc) {
        Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
    }

    return @($descendants + $RootPid)
}

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
        } elseif ($property.Name -eq "tabs") {
            Add-PageRef -Node $property.Value -Pages $Pages
        } elseif ($property.Name -eq "groups" -and $property.Value -is [System.Array] -and @($property.Value | Where-Object { $_ -isnot [string] }).Count -gt 0) {
            Add-PageRef -Node $property.Value -Pages $Pages
        }
    }
}

function Get-Frontmatter {
    param([Parameter(Mandatory = $true)][string]$Content)

    if (-not $Content.StartsWith("---")) {
        return [pscustomobject]@{
            Public = $false
            Audience = $null
            HasGroupsDeclaration = $false
        }
    }

    $match = [regex]::Match($Content, "\A---\r?\n(?<body>.*?)\r?\n---\r?\n", [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) {
        return [pscustomobject]@{
            Public = $false
            Audience = $null
            HasGroupsDeclaration = $false
        }
    }

    $body = $match.Groups["body"].Value
    $public = [regex]::IsMatch($body, "(?m)^public:\s*true\s*$")
    $hasGroupsDeclaration = [regex]::IsMatch($body, "(?m)^groups:\s*")
    $audience = $null
    $audienceMatch = [regex]::Match($body, "(?m)^audience:\s*(?<value>.+?)\s*$")
    if ($audienceMatch.Success) {
        $audience = $audienceMatch.Groups["value"].Value.Trim().Trim("'`"")
    }

    return [pscustomobject]@{
        Public = $public
        Audience = $audience
        HasGroupsDeclaration = $hasGroupsDeclaration
    }
}

function Add-NavigationAudienceRecord {
    param(
        $Node,
        [bool]$PublicAncestry = $false,
        [string[]]$AncestorGroups = @(),
        [string[]]$AncestorNames = @(),
        [System.Collections.Generic.List[object]]$Records
    )

    if ($null -eq $Node) {
        return
    }
    if ($Node -is [string]) {
        $Records.Add([pscustomobject]@{
            Page = Normalize-DocPath -PathValue $Node
            PublicAncestry = $PublicAncestry
            AncestorGroups = @($AncestorGroups)
            AncestorNames = @($AncestorNames)
        }) | Out-Null
        return
    }
    if ($Node -is [System.Array]) {
        foreach ($item in $Node) {
            Add-NavigationAudienceRecord -Node $item -PublicAncestry $PublicAncestry -AncestorGroups $AncestorGroups -AncestorNames $AncestorNames -Records $Records
        }
        return
    }

    $nextPublic = $PublicAncestry
    $nextGroups = @($AncestorGroups)
    $nextNames = @($AncestorNames)
    if ($Node.PSObject.Properties.Name -contains "group") {
        $nextNames += [string]$Node.group
        if ($Node.PSObject.Properties.Name -contains "public") {
            if ($Node.public -eq $true) {
                $nextPublic = $true
            }
        }
        if ($Node.PSObject.Properties.Name -contains "pages") {
            Add-NavigationAudienceRecord -Node $Node.pages -PublicAncestry $nextPublic -AncestorGroups $nextGroups -AncestorNames $nextNames -Records $Records
        }
        return
    }
    foreach ($property in $Node.PSObject.Properties) {
        if ($property.Name -in @("tabs", "groups")) {
            if ($property.Value -is [System.Array] -and @($property.Value | Where-Object { $_ -isnot [string] }).Count -gt 0) {
                Add-NavigationAudienceRecord -Node $property.Value -PublicAncestry $PublicAncestry -AncestorGroups $AncestorGroups -AncestorNames $AncestorNames -Records $Records
            }
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

$audienceRecords = [System.Collections.Generic.List[object]]::new()
Add-NavigationAudienceRecord -Node $docs.navigation -Records $audienceRecords
$recordsByPage = @{}
foreach ($record in $audienceRecords) {
    if ([string]::IsNullOrWhiteSpace($record.Page)) {
        throw "Navigation contains an empty page reference"
    }
    if (-not $recordsByPage.ContainsKey($record.Page)) {
        $recordsByPage[$record.Page] = [System.Collections.Generic.List[object]]::new()
    }
    $recordsByPage[$record.Page].Add($record) | Out-Null
}

$audienceErrors = [System.Collections.Generic.List[string]]::new()
foreach ($page in $activePages) {
    if (-not $recordsByPage.ContainsKey($page)) {
        $audienceErrors.Add("page '$page' has no navigation audience ancestry") | Out-Null
        continue
    }
    $pagePath = Join-Path $repoRoot (($page -replace "/", "\") + ".mdx")
    $frontmatter = Get-Frontmatter -Content (Get-Content -LiteralPath $pagePath -Raw)
    $pageIsPublic = $frontmatter.Public
    $pageAudience = if ([string]::IsNullOrWhiteSpace([string]$frontmatter.Audience)) { $null } else { [string]$frontmatter.Audience }
    $pageIsRestricted = $pageAudience -eq "organization-members"
    if ($frontmatter.HasGroupsDeclaration) {
        $audienceErrors.Add("page '$page' declares unsupported 'groups' frontmatter (Mintlify Enterprise groups contract is not available here); use audience: organization-members") | Out-Null
    }
    if ($null -ne $pageAudience -and -not $pageIsRestricted) {
        $audienceErrors.Add("page '$page' has unsupported audience value '$pageAudience'; expected 'organization-members'") | Out-Null
    }
    foreach ($record in $recordsByPage[$page]) {
        $hasPublic = $pageIsPublic -or $record.PublicAncestry
        if ($pageIsRestricted -and $hasPublic) {
            $audienceErrors.Add("page '$page' is both public and restricted (organization-members)") | Out-Null
        }
        if (-not $pageIsRestricted -and -not $hasPublic) {
            $audienceErrors.Add("page '$page' has ambiguous audience classification") | Out-Null
        }
        if ($record.PublicAncestry -and $pageIsRestricted) {
            $audienceErrors.Add("restricted page '$page' appears under public navigation ancestry") | Out-Null
        }
        if ($page.StartsWith("review/", [System.StringComparison]::OrdinalIgnoreCase) -and $hasPublic) {
            $audienceErrors.Add("public page '$page' appears under the internal review path") | Out-Null
        }
        if ($page.StartsWith("review/", [System.StringComparison]::OrdinalIgnoreCase) -and -not $pageIsRestricted) {
            $audienceErrors.Add("review page '$page' must declare audience: organization-members") | Out-Null
        }
    }
}
if ($audienceErrors.Count -gt 0) {
    Write-Host "audience boundary errors:"
    foreach ($errorText in ($audienceErrors | Sort-Object -Unique)) {
        Write-Host " - $errorText"
    }
    throw "Audience boundary validation failed"
}
Write-Host "audience_boundary: ok"
Write-Host "public_pages: $(@($activePages | Where-Object { -not $_.StartsWith("review/") }).Count)"
Write-Host "restricted_pages: $(@($activePages | Where-Object { $_.StartsWith("review/") }).Count)"

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
    $previewViews = @(
        @{ Name = "runtime-smoke" }
    )
    foreach ($previewView in $previewViews) {
    $previewPort = Get-FreeTcpPort
    $occupiedAtStart = @(Get-ListeningProcessIds -Port $previewPort)
    if ($occupiedAtStart.Count -gt 0) {
        throw "Selected preview port $previewPort is already occupied before launch."
    }
    $previewBaseUrl = "http://localhost:$previewPort"
    Write-Host "preview_view: $($previewView.Name)"
    Write-Host "preview_url: $previewBaseUrl"

    $npxVersion = (& npx --version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "npx is not available for Mint preview validation: $npxVersion"
    }
    Write-Host "npx: $($npxVersion.Trim())"

    $stdoutLog = Join-Path $env:TEMP ("mint-preview-stdout-" + [guid]::NewGuid().ToString("N") + ".log")
    $stderrLog = Join-Path $env:TEMP ("mint-preview-stderr-" + [guid]::NewGuid().ToString("N") + ".log")
    $mintProc = $null
    $launchedTreePids = @()

    try {
        $mintCommand = "npx -y $mintSpec dev --port $previewPort"
        $mintProc = Start-Process -FilePath $env:ComSpec -ArgumentList @("/d", "/s", "/c", $mintCommand) -WorkingDirectory $repoRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
        Write-Host "mint_preview_pid: $($mintProc.Id)"

        $ready = $false
        $previewTimeout = [TimeSpan]::FromMinutes(5)
        $deadline = (Get-Date).Add($previewTimeout)
        do {
            try {
                $response = Invoke-WebRequest -Uri $previewBaseUrl -UseBasicParsing -TimeoutSec 3
                if ($response.StatusCode -eq 200) {
                    $listenerPids = @(Get-ListeningProcessIds -Port $previewPort)
                    $treePids = @((Get-ProcessDescendantIds -RootPid $mintProc.Id) + $mintProc.Id)
                    $listenerInTree = $false
                    foreach ($listenerPid in $listenerPids) {
                        if ($treePids -contains $listenerPid) {
                            $listenerInTree = $true
                            break
                        }
                    }
                    if ($listenerInTree) {
                        $ready = $true
                        break
                    }
                }
            } catch {
                Start-Sleep -Milliseconds 500
            }
            if ($mintProc.HasExited -and -not $ready) {
                $stdoutTail = if (Test-Path -LiteralPath $stdoutLog) { (Get-Content -LiteralPath $stdoutLog -Tail 25 | Out-String) } else { "" }
                $stderrTail = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Tail 25 | Out-String) } else { "" }
                throw "Mint preview exited before ready.`nSTDOUT:`n$stdoutTail`nSTDERR:`n$stderrTail"
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
            "/journeys/companion-voice",
            "/stackkits/overview",
            "/stackkits/quickstart",
            "/stackkits/kits/basement-kit",
            "/stackkits/kits/cloud-kit",
            "/review/audience-workflow"
        )

        foreach ($smokePath in $smokePaths) {
            $uri = $previewBaseUrl + $smokePath
            $attempts = 0
            $maxAttempts = 3
            $res = $null
            $lastError = $null
            while ($attempts -lt $maxAttempts) {
                $attempts++
                try {
                    $res = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 8
                    $lastError = $null
                    break
                }
                catch {
                    $lastError = $_
                    Start-Sleep -Milliseconds 700
                }
            }
            if ($null -ne $lastError) {
                throw "Preview smoke failed after $maxAttempts attempts: $uri :: $($lastError.Exception.Message)"
            }
            if ($null -eq $res) {
                throw "Preview smoke failed: $uri returned no response"
            }
            if ($res.StatusCode -ne 200) {
                throw "Preview smoke failed: $uri returned status $($res.StatusCode)"
            }
            if (-not ($res.Content -match '<html')) {
                throw "Preview smoke failed: $uri did not return HTML content"
            }
            Write-Host "smoke_ok: $uri"
        }

        $restrictedUri = $previewBaseUrl + "/review/audience-workflow"
        try {
            $restrictedResponse = Invoke-WebRequest -Uri $restrictedUri -UseBasicParsing -TimeoutSec 8
            if ($restrictedResponse.StatusCode -eq 200 -and $restrictedResponse.Content -match "Documentation review workflow|organization members") {
                Write-Host "local_auth_not_enforced: $restrictedUri rendered restricted marker content; local Mint CLI cannot prove provider authentication. Deployed/provider checks remain required."
            }
            elseif ($restrictedResponse.StatusCode -eq 200) {
                Write-Host "local_restricted_response: $restrictedUri returned 200 without the configured restricted markers"
            }
            else {
                Write-Host "local_restricted_response: $restrictedUri returned $($restrictedResponse.StatusCode)"
            }
        }
        catch {
            Write-Host "local_restricted_response: $restrictedUri returned a protected/not-found response"
        }
    }
    finally {
        if ($null -ne $mintProc) {
            try {
                $launchedTreePids = @(Stop-ProcessTreeByPid -RootPid $mintProc.Id | Sort-Object -Unique)
                Start-Sleep -Milliseconds 300
                $remainingPids = @()
                foreach ($procId in $launchedTreePids) {
                    if ($null -ne (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
                        $remainingPids += $procId
                    }
                }
                if ($remainingPids.Count -gt 0) {
                    throw "Mint preview cleanup failed; remaining process IDs: $($remainingPids -join ', ')"
                }

                $remainingListeners = @(Get-ListeningProcessIds -Port $previewPort)
                $unexpectedListeners = @($remainingListeners | Where-Object { $occupiedAtStart -notcontains $_ })
                if ($unexpectedListeners.Count -gt 0) {
                    foreach ($listenerPid in $unexpectedListeners) {
                        Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
                    }
                    Start-Sleep -Milliseconds 300
                    $remainingListeners = @(Get-ListeningProcessIds -Port $previewPort)
                    $unexpectedListeners = @($remainingListeners | Where-Object { $occupiedAtStart -notcontains $_ })
                }
                if ($unexpectedListeners.Count -gt 0) {
                    throw "Mint preview cleanup failed; listener still active on port ${previewPort}: $($unexpectedListeners -join ', ')"
                }
            } catch {
                throw "Mint preview cleanup error: $($_.Exception.Message)"
            }
        }
        foreach ($log in @($stdoutLog, $stderrLog)) {
            if (Test-Path -LiteralPath $log) {
                Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
            }
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
