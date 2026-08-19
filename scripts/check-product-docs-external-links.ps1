[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$destinations = @(
    "https://techstack.kombify.io",
    "https://github.com/kombifyio/SpeechKit",
    "https://github.com/kombifyio/SpeechKit/releases/tag/v0.52.14",
    "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SpeechKit-Setup.exe",
    "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SpeechKit-Portable.zip",
    "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/SHA256SUMS.txt",
    "https://github.com/kombifyio/SpeechKit/releases/download/v0.52.14/UNSIGNED-WINDOWS-RELEASE.txt"
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($destination in $destinations) {
    try {
        $response = Invoke-WebRequest `
            -Uri $destination `
            -Method Head `
            -UseBasicParsing `
            -MaximumRedirection 5 `
            -TimeoutSec 20
        $status = [int]$response.StatusCode
        if ($status -lt 200 -or $status -ge 400) {
            $errors.Add("$destination returned HTTP $status") | Out-Null
        }
        else {
            Write-Host "product_docs_external_link: HTTP $status $destination"
        }
    }
    catch {
        $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errors.Add("$destination was not reachable (HTTP $status): $($_.Exception.Message)") | Out-Null
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Product docs external-link failures:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "Product docs external-link validation failed"
}

Write-Host "product_docs_external_links_checked: $($destinations.Count)"
Write-Host "product_docs_external_links: ok"
