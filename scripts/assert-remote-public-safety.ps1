[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][uri]$BaseUrl,
    [string]$PolicyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Mintlify deployment statuses set environment_url to a changed PAGE
# (e.g. https://<preview>.mintlify.site/CONTRIBUTING), not the site origin.
# Normalize to the origin so route joins below are deterministic.
$BaseUrl = [uri]("{0}://{1}" -f $BaseUrl.Scheme, $BaseUrl.Authority)

if ([string]::IsNullOrWhiteSpace($PolicyPath)) {
    $PolicyPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "public-safety-policy.json"
}
if (-not (Test-Path -LiteralPath $PolicyPath -PathType Leaf)) {
    throw "Public-safety policy is missing: $PolicyPath"
}
$policy = Get-Content -LiteralPath $PolicyPath -Raw | ConvertFrom-Json
if ([string]$policy.publicationMode -ne "public-only") {
    throw "Remote public-safety smoke only supports publicationMode 'public-only'"
}

function Get-Response {
    param(
        [Parameter(Mandatory = $true)][uri]$Uri,
        [switch]$FollowRedirects
    )

    # Public/projection routes may legitimately redirect (e.g. the site root
    # 308s to a landing page); forbidden-route checks stay strict (no follow)
    # so a redirect can never mask a leaked page.
    $maxRedirect = if ($FollowRedirects) { 5 } else { 0 }
    try {
        return Invoke-WebRequest `
            -Uri $Uri `
            -UseBasicParsing `
            -DisableKeepAlive `
            -MaximumRedirection $maxRedirect `
            -TimeoutSec 15
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            if ($FollowRedirects) {
                throw "Remote public-safety request failed for $Uri`: $($_.Exception.Message)"
            }

            # Windows PowerShell 5 can surface Mintlify's 404 response as a
            # connection-close WebException with no Response object after a
            # successful request on the same process. Re-probe the forbidden
            # route with curl and accept only its explicit HTTP status. A curl
            # transport failure remains a hard failure.
            $curlName = if ($env:OS -eq "Windows_NT") { "curl.exe" } else { "curl" }
            $curl = Get-Command $curlName -ErrorAction Stop
            $nullDevice = if ($env:OS -eq "Windows_NT") { "NUL" } else { "/dev/null" }
            $statusText = & $curl.Source `
                --silent `
                --show-error `
                --output $nullDevice `
                --write-out "%{http_code}" `
                --max-redirs 0 `
                --connect-timeout 15 `
                --max-time 15 `
                $Uri.AbsoluteUri
            if ($LASTEXITCODE -ne 0 -or [string]$statusText -notmatch '^\d{3}$') {
                throw "Remote public-safety fallback failed for $Uri after: $($_.Exception.Message)"
            }
            return [pscustomobject]@{
                StatusCode = [int]$statusText
                Content = ""
            }
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content = ""
        }
    }
}

function Assert-NoForbiddenProjection {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectionName,
        [Parameter(Mandatory = $true)][string]$Content
    )

    foreach ($path in @($policy.remoteForbiddenPaths)) {
        $escapedPath = [regex]::Escape([string]$path)
        # Match a relative link or an absolute URL with this exact path. A raw
        # substring check would incorrectly flag /stackkits/quickstart when the
        # retired route is /quickstart.
        $pathPattern = "(?im)(?:^|[\s`"'(>])(?:https?://[^/\s<>`"')]+)?$escapedPath(?:[/#?\s<>`"')]|$)"
        if ($Content -match $pathPattern) {
            throw "$ProjectionName exposes forbidden path '$path'"
        }
    }
    foreach ($marker in @($policy.remoteForbiddenMarkers)) {
        if ($Content -match [regex]::Escape([string]$marker)) {
            throw "$ProjectionName exposes forbidden marker '$marker'"
        }
    }
}

$base = $BaseUrl.AbsoluteUri.TrimEnd("/")
foreach ($path in @($policy.localSmokePaths)) {
    $publicUri = [uri]($base + [string]$path)
    $publicResponse = Get-Response -Uri $publicUri -FollowRedirects
    if ([int]$publicResponse.StatusCode -ne 200) {
        throw "Expected public route $publicUri to return 200; got $($publicResponse.StatusCode)"
    }
    Write-Host "remote_public_ok: $publicUri"
}

foreach ($path in @($policy.remoteForbiddenPaths)) {
    $uri = [uri]($base + [string]$path)
    $response = Get-Response -Uri $uri
    if ([int]$response.StatusCode -notin @(404, 410)) {
        throw "Forbidden public route $uri must return 404 or 410; got $($response.StatusCode)"
    }
    Write-Host "remote_forbidden_route_absent: $uri ($($response.StatusCode))"
}

$llmsUri = [uri]($base + "/llms.txt")
$llmsResponse = Get-Response -Uri $llmsUri -FollowRedirects
if ([int]$llmsResponse.StatusCode -ne 200) {
    throw "Expected $llmsUri to return 200; got $($llmsResponse.StatusCode)"
}
Assert-NoForbiddenProjection -ProjectionName "llms.txt" -Content ([string]$llmsResponse.Content)
Write-Host "remote_llms_projection: safe"

$sitemapUri = [uri]($base + "/sitemap.xml")
$sitemapResponse = Get-Response -Uri $sitemapUri -FollowRedirects
if ([int]$sitemapResponse.StatusCode -eq 200) {
    Assert-NoForbiddenProjection -ProjectionName "sitemap.xml" -Content ([string]$sitemapResponse.Content)
    Write-Host "remote_sitemap_projection: safe"
}
elseif ([int]$sitemapResponse.StatusCode -notin @(404, 410)) {
    throw "Unexpected sitemap response from $sitemapUri`: $($sitemapResponse.StatusCode)"
}

Write-Host "remote_public_safety: PASS"
