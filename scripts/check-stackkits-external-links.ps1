[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$destinations = @(
    "https://stackkit.cc/getting-started",
    "https://stackkit.cc/getting-started/cli",
    "https://install.stackkit.cc",
    "https://base.stackkit.cc",
    "https://cloud.stackkit.cc",
    "https://github.com/kombifyio/StackKits/releases/latest"
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($destination in $destinations) {
    try {
        $response = Invoke-WebRequest `
            -Uri $destination `
            -Method Head `
            -UseBasicParsing `
            -MaximumRedirection 5 `
            -TimeoutSec 15
        $status = [int]$response.StatusCode
        if ($status -lt 200 -or $status -ge 400) {
            $errors.Add("$destination returned HTTP $status") | Out-Null
        }
        else {
            Write-Host "stackkits_external_link: HTTP $status $destination"
        }
    }
    catch {
        $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errors.Add("$destination was not reachable (HTTP $status): $($_.Exception.Message)") | Out-Null
    }
}

if ($errors.Count -gt 0) {
    Write-Host "StackKits external-link failures:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "StackKits external-link validation failed"
}

Write-Host "stackkits_external_links_checked: $($destinations.Count)"
Write-Host "stackkits_external_links: ok"
