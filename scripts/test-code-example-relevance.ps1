[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$checker = Join-Path $PSScriptRoot "check-code-example-relevance.ps1"
$systemTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $systemTemp ("mintlify-example-relevance-" + [guid]::NewGuid().ToString("N"))

function Set-FixturePage {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $path = Join-Path $fixtureRoot $RelativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $path) -Force | Out-Null
    Set-Content -LiteralPath $path -Value $Content -Encoding utf8
}

function Assert-CheckerFails {
    param([Parameter(Mandatory = $true)][string]$ExpectedPattern)
    try {
        & $checker -RepoRoot $fixtureRoot *> $null
    }
    catch {
        if ($_.Exception.Message -notmatch $ExpectedPattern) {
            throw "Checker failed for the wrong reason: $($_.Exception.Message)"
        }
        return
    }
    throw "Checker unexpectedly accepted an irrelevant code example"
}

try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null

    Set-FixturePage -RelativePath "stackkits/reference/monitoring.mdx" -Content @'
---
title: Monitoring
---
```bash
stackkit verify --json
```
'@
    Assert-CheckerFails -ExpectedPattern "Code-example relevance validation failed"
    Write-Host "test_pass: unrelated executable block fails"

    Set-FixturePage -RelativePath "stackkits/reference/monitoring.mdx" -Content @'
---
title: Monitoring
---
Use `stackkit verify --json`.
'@
    Assert-CheckerFails -ExpectedPattern "Code-example relevance validation failed"
    Write-Host "test_pass: unrelated inline command fails"

    Set-FixturePage -RelativePath "stackkits/reference/monitoring.mdx" -Content @'
---
title: Monitoring
---
```json
{ "monitoring": true }
```
'@
    Assert-CheckerFails -ExpectedPattern "Code-example relevance validation failed"
    Write-Host "test_pass: unrelated structured block fails"

    Set-FixturePage -RelativePath "stackkits/reference/monitoring.mdx" -Content @'
---
title: Monitoring
---
Monitoring guidance without a synthetic command example.
'@
    Set-FixturePage -RelativePath "stackkits/reference/day-2-operations.mdx" -Content @'
---
title: Operations
---
```bash
stackkit status --json
```
'@
    & $checker -RepoRoot $fixtureRoot
    Write-Host "test_pass: topic-specific executable block passes"
}
finally {
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    if ($resolvedFixture.StartsWith($systemTemp, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedFixture)) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}

Write-Host "code_example_relevance_tests: PASS (4 cases)"
