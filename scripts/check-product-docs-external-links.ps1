[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Mutable `latest` destinations on purpose: the pages link them, so the gate
# proves the link a reader clicks resolves today, not that some frozen tag
# still exists. The exact published tag is checked separately by
# check-speechkit-release-truth.ps1 against data/speechkit/latest.json.
$destinations = @(
    "https://techstack.kombify.io",
    "https://speechkit.cc",
    "https://github.com/kombifyio/SpeechKit",
    "https://github.com/kombifyio/SpeechKit/releases/latest",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/SpeechKit-Setup.exe",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/SpeechKit-Portable.zip",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/SpeechKit-macOS-arm64.zip",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/SHA256SUMS.txt",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/UNSIGNED-WINDOWS-RELEASE.txt",
    "https://github.com/kombifyio/SpeechKit/releases/latest/download/UNSIGNED-MACOS-RELEASE.txt"
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
