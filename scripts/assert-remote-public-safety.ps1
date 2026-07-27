[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][uri]$BaseUrl,
    [string]$PolicyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
    param([Parameter(Mandatory = $true)][uri]$Uri)

    try {
        return Invoke-WebRequest `
            -Uri $Uri `
            -UseBasicParsing `
            -MaximumRedirection 0 `
            -TimeoutSec 15
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            throw "Remote public-safety request failed for $Uri`: $($_.Exception.Message)"
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
        if ($Content -match [regex]::Escape([string]$path)) {
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
$publicUri = [uri]($base + "/")
$publicResponse = Get-Response -Uri $publicUri
if ([int]$publicResponse.StatusCode -ne 200) {
    throw "Expected public route $publicUri to return 200; got $($publicResponse.StatusCode)"
}
Write-Host "remote_public_ok: $publicUri"

foreach ($path in @($policy.remoteForbiddenPaths)) {
    $uri = [uri]($base + [string]$path)
    $response = Get-Response -Uri $uri
    if ([int]$response.StatusCode -notin @(404, 410)) {
        throw "Forbidden public route $uri must return 404 or 410; got $($response.StatusCode)"
    }
    Write-Host "remote_forbidden_route_absent: $uri ($($response.StatusCode))"
}

$llmsUri = [uri]($base + "/llms.txt")
$llmsResponse = Get-Response -Uri $llmsUri
if ([int]$llmsResponse.StatusCode -ne 200) {
    throw "Expected $llmsUri to return 200; got $($llmsResponse.StatusCode)"
}
Assert-NoForbiddenProjection -ProjectionName "llms.txt" -Content ([string]$llmsResponse.Content)
Write-Host "remote_llms_projection: safe"

$sitemapUri = [uri]($base + "/sitemap.xml")
$sitemapResponse = Get-Response -Uri $sitemapUri
if ([int]$sitemapResponse.StatusCode -eq 200) {
    Assert-NoForbiddenProjection -ProjectionName "sitemap.xml" -Content ([string]$sitemapResponse.Content)
    Write-Host "remote_sitemap_projection: safe"
}
elseif ([int]$sitemapResponse.StatusCode -notin @(404, 410)) {
    throw "Unexpected sitemap response from $sitemapUri`: $($sitemapResponse.StatusCode)"
}

Write-Host "remote_public_safety: PASS"
