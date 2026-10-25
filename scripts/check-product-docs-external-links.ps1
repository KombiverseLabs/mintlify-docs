[CmdletBinding()]
param([string]$RepoRoot = (Join-Path $PSScriptRoot ".."))

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

. (Join-Path $PSScriptRoot "lib/registered-external-targets.ps1")
Invoke-RegisteredExternalCheck -RepoRoot $RepoRoot -Candidates $destinations -Prefix "product_docs" -TimeoutSeconds 20
