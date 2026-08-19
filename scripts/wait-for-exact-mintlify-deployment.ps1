[CmdletBinding()]
param(
    [string]$Repository = "KombiverseLabs/mintlify-docs",
    [Parameter(Mandatory = $true)][string]$CommitSha,
    [string]$ExpectedRef = "main",
    [uri]$ExpectedUrl = "https://docs.kombify.io",
    [ValidateRange(1, 300)][int]$TimeoutSeconds = 240
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($CommitSha -notmatch '^[0-9a-f]{40}$') {
    throw "CommitSha must be a lowercase 40-character Git SHA"
}
if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN)) {
    throw "GH_TOKEN is required to resolve the exact Mintlify deployment"
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$expectedOrigin = "{0}://{1}" -f $ExpectedUrl.Scheme, $ExpectedUrl.Authority
$lastState = "no deployment"

do {
    $deployments = @(
        gh api "repos/$Repository/deployments?sha=$CommitSha&per_page=50" |
            ConvertFrom-Json |
            Sort-Object { [datetime]$_.created_at } -Descending
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not query GitHub deployments for $Repository@$CommitSha"
    }

    foreach ($deployment in $deployments) {
        if ([string]$deployment.sha -ne $CommitSha) {
            continue
        }
        if ([string]$deployment.ref -ne $ExpectedRef) {
            continue
        }
        $statuses = @(
            gh api "repos/$Repository/deployments/$($deployment.id)/statuses?per_page=20" |
                ConvertFrom-Json |
                Sort-Object { [datetime]$_.created_at } -Descending
        )
        if ($LASTEXITCODE -ne 0 -or $statuses.Count -eq 0) {
            continue
        }
        $status = $statuses[0]
        $lastState = "deployment=$($deployment.id) state=$($status.state) url=$($status.environment_url)"
        if ([string]$status.state -in @("failure", "error")) {
            throw "Exact Mintlify deployment failed: $lastState"
        }
        if ([string]$status.state -ne "success" -or [string]::IsNullOrWhiteSpace([string]$status.environment_url)) {
            continue
        }
        $environmentUrl = [uri]$status.environment_url
        $environmentOrigin = "{0}://{1}" -f $environmentUrl.Scheme, $environmentUrl.Authority
        if ($environmentOrigin -ne $expectedOrigin) {
            continue
        }

        Write-Host "exact_mintlify_deployment: PASS"
        Write-Host "repository: $Repository"
        Write-Host "sha: $CommitSha"
        Write-Host "ref: $($deployment.ref)"
        Write-Host "deployment_id: $($deployment.id)"
        Write-Host "environment_url: $($status.environment_url)"
        exit 0
    }

    Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

throw "No successful exact Mintlify deployment reached $expectedOrigin within $TimeoutSeconds seconds; last=$lastState"
