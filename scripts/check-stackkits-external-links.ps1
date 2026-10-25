[CmdletBinding()]
param([string]$RepoRoot = (Join-Path $PSScriptRoot ".."))

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

. (Join-Path $PSScriptRoot "lib/registered-external-targets.ps1")
Invoke-RegisteredExternalCheck -RepoRoot $RepoRoot -Candidates $destinations -Prefix "stackkits" -TimeoutSeconds 15
