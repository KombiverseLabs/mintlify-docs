[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][uri]$BaseUrl,
    [string]$PublicPath = "/",
    [string]$RestrictedPath = "/review/audience-workflow",
    [string[]]$RestrictedMarkers = @("Documentation review workflow", "organization members")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RemoteResponse {
    param([Parameter(Mandatory = $true)][uri]$Uri)

    try {
        return Invoke-WebRequest -Uri $Uri -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            throw "Remote audience request failed for $Uri`: $($_.Exception.Message)"
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content = ""
        }
    }
}

$base = $BaseUrl.AbsoluteUri.TrimEnd("/")
$publicUri = "$base$PublicPath"
$restrictedUri = "$base$RestrictedPath"

$publicResponse = Get-RemoteResponse -Uri ([uri]$publicUri)
if ($publicResponse.StatusCode -ne 200) {
    throw "Expected public route $publicUri to return 200; got $($publicResponse.StatusCode)"
}
Write-Host "remote_public_ok: $publicUri"

$restrictedResponse = Get-RemoteResponse -Uri ([uri]$restrictedUri)
$protectedStatusCodes = @(301, 302, 303, 307, 308, 401, 403, 404)
if ($restrictedResponse.StatusCode -in $protectedStatusCodes) {
    Write-Host "remote_restricted_ok: $restrictedUri returned protected/not-found status $($restrictedResponse.StatusCode)"
    exit 0
}

if ($restrictedResponse.StatusCode -eq 200) {
    foreach ($marker in $RestrictedMarkers) {
        if ($restrictedResponse.Content -match [regex]::Escape($marker)) {
            throw "Remote preview leak: $restrictedUri rendered restricted marker '$marker'"
        }
    }
    throw "Remote preview leak: $restrictedUri returned 200 and is unexpectedly publicly renderable"
}

throw "Unexpected restricted route status for $restrictedUri`: $($restrictedResponse.StatusCode)"
