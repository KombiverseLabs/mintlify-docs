[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$PolicyPath,
    [string]$MintSpec = "mint@4.2.684",
    [ValidateRange(30, 300)][int]$StartupTimeoutSeconds = 180
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$runningOnWindows = $PSVersionTable.PSEdition -eq "Desktop" -or $env:OS -eq "Windows_NT"
if ([string]::IsNullOrWhiteSpace($PolicyPath)) {
    $PolicyPath = Join-Path $RepoRoot "public-safety-policy.json"
}
$policy = Get-Content -LiteralPath $PolicyPath -Raw | ConvertFrom-Json

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

function Stop-PreviewProcessTree {
    param([Parameter(Mandatory = $true)][int]$RootProcessId)

    if ($runningOnWindows) {
        $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
        $pending = [System.Collections.Generic.Queue[int]]::new()
        $descendants = [System.Collections.Generic.List[int]]::new()
        $pending.Enqueue($RootProcessId)
        while ($pending.Count -gt 0) {
            $parentId = $pending.Dequeue()
            foreach ($child in @($processes | Where-Object { [int]$_.ParentProcessId -eq $parentId })) {
                $childId = [int]$child.ProcessId
                $descendants.Add($childId) | Out-Null
                $pending.Enqueue($childId)
            }
        }
        foreach ($processId in @($descendants)) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
    Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

function Get-HttpResponse {
    param(
        [Parameter(Mandatory = $true)][uri]$Uri,
        # Only the forbidden-route probe may pass this. The mint dev server
        # answers some absent paths by closing the connection instead of
        # returning a status, which surfaces as "The request was aborted: The
        # connection was closed unexpectedly" with a null Response and used to
        # abort the whole gate. For a route that must NOT exist, a refused or
        # dropped connection is stronger evidence of absence than a 404, so it
        # is reported as status 0 and treated as absent. The reachability probe
        # must never use this: there a dropped connection is a real failure.
        [switch]$TreatConnectionFailureAsAbsent
    )

    try {
        return Invoke-WebRequest `
            -Uri $Uri `
            -UseBasicParsing `
            -MaximumRedirection 0 `
            -TimeoutSec 8
    }
    catch {
        $response = $_.Exception.Response
        if ($null -eq $response) {
            if ($TreatConnectionFailureAsAbsent) {
                return [pscustomobject]@{
                    StatusCode = 0
                    Content = ""
                }
            }
            throw
        }
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content = ""
        }
    }
}

$port = Get-FreeTcpPort
$baseUrl = "http://127.0.0.1:$port"
$npxName = if ($runningOnWindows) { "npx.cmd" } else { "npx" }
$npx = (Get-Command $npxName -ErrorAction Stop).Source
$stdoutLog = Join-Path ([System.IO.Path]::GetTempPath()) ("mint-preview-stdout-" + [guid]::NewGuid().ToString("N") + ".log")
$stderrLog = Join-Path ([System.IO.Path]::GetTempPath()) ("mint-preview-stderr-" + [guid]::NewGuid().ToString("N") + ".log")
$process = $null

try {
    $startParameters = @{
        FilePath = $npx
        ArgumentList = @("-y", $MintSpec, "dev", "--port", [string]$port)
        WorkingDirectory = $RepoRoot
        RedirectStandardOutput = $stdoutLog
        RedirectStandardError = $stderrLog
        PassThru = $true
    }
    if ($runningOnWindows) {
        $startParameters.WindowStyle = "Hidden"
    }
    $process = Start-Process @startParameters
    Write-Host "mint_preview_pid: $($process.Id)"
    Write-Host "mint_preview_url: $baseUrl"

    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    $ready = $false
    do {
        if ($process.HasExited) {
            break
        }
        try {
            $response = Get-HttpResponse -Uri ([uri]($baseUrl + "/"))
            if ([int]$response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        }
        catch {
            # The preview is still starting.
        }
        Start-Sleep -Seconds 2
        $process.Refresh()
    } while ((Get-Date) -lt $deadline)

    if (-not $ready) {
        $stdout = if (Test-Path -LiteralPath $stdoutLog) { (Get-Content -LiteralPath $stdoutLog -Tail 60) -join "`n" } else { "" }
        $stderr = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -LiteralPath $stderrLog -Tail 60) -join "`n" } else { "" }
        throw "Mint preview did not become ready within $StartupTimeoutSeconds seconds.`nstdout:`n$stdout`nstderr:`n$stderr"
    }

    foreach ($path in @($policy.localSmokePaths)) {
        $uri = [uri]($baseUrl + [string]$path)
        $response = Get-HttpResponse -Uri $uri
        if ([int]$response.StatusCode -ne 200 -or [string]$response.Content -notmatch "<html") {
            throw "Local preview smoke failed for $uri`: status=$($response.StatusCode), html=$([string]$response.Content -match '<html')"
        }
        Write-Host "local_public_route_ok: $uri"
    }

    foreach ($path in @($policy.remoteForbiddenPaths)) {
        $uri = [uri]($baseUrl + [string]$path)
        $response = Get-HttpResponse -Uri $uri -TreatConnectionFailureAsAbsent
        # 0 means the connection was refused or dropped - see Get-HttpResponse.
        if ([int]$response.StatusCode -notin @(0, 404, 410)) {
            throw "Local preview exposes forbidden route $uri with status $($response.StatusCode)"
        }
        $observed = if ([int]$response.StatusCode -eq 0) { "connection-refused" } else { [string]$response.StatusCode }
        Write-Host "local_forbidden_route_absent: $uri ($observed)"
    }

    Write-Host "local_http_smoke: PASS"
}
finally {
    if ($null -ne $process) {
        Stop-PreviewProcessTree -RootProcessId $process.Id
    }
    foreach ($log in @($stdoutLog, $stderrLog)) {
        if (Test-Path -LiteralPath $log) {
            Remove-Item -LiteralPath $log -Force
        }
    }
}
