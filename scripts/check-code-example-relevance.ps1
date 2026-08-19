[CmdletBinding()]
param(
    [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
else {
    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
}

$executableExamplePages = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
@(
    "guides/stackkits/application-delivery.mdx",
    "guides/stackkits/back-up-and-restore.mdx",
    "guides/stackkits/configure-stack-spec.mdx",
    "guides/stackkits/review-plan-and-apply.mdx",
    "guides/stackkits/use-cases/private-file-library.mdx",
    "guides/stackkits/use-cases/private-home-base.mdx",
    "guides/stackkits/use-cases/recovery-first-homelab.mdx",
    "stackkits/kits/basement-kit.mdx",
    "stackkits/kits/cloud-kit.mdx",
    "stackkits/overview.mdx",
    "stackkits/quickstart.mdx",
    "stackkits/reference/day-2-operations.mdx",
    "stackkits/reference/mcp-connector.mdx",
    "stackkits/reference/spec-format.mdx",
    "speechkit/framework.mdx"
) | ForEach-Object { $executableExamplePages.Add($_) | Out-Null }

$allowedInlineCommands = @{
    "guides/stackkits/use-cases/private-file-library.mdx" = @(
        "stackkit init"
    )
    "stackkits/apps/overview.mdx" = @(
        "stackkit app compatibility --json"
    )
    "stackkits/reference/day-2-operations.mdx" = @(
        "stackkit validate",
        "stackkit generate",
        "stackkit plan --json",
        "stackkit verify --http --json",
        "stackkit --help"
    )
    "stackkits/reference/spec-format.mdx" = @(
        "stackkit plan --json"
    )
    "stackkits/reference/tool-alternatives.mdx" = @(
        "stackkit app compatibility --json"
    )
}

$executableLanguages = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
@("bash", "sh", "shell", "console", "powershell", "pwsh") |
    ForEach-Object { $executableLanguages.Add($_) | Out-Null }

$structuredExamplePages = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
@(
    "guides/stackkits/application-delivery.mdx",
    "guides/stackkits/configure-stack-spec.mdx",
    "guides/stackkits/use-cases/private-file-library.mdx",
    "stackkits/apps/cloudreve.mdx",
    "stackkits/reference/mcp-connector.mdx"
) | ForEach-Object { $structuredExamplePages.Add($_) | Out-Null }

$errors = [System.Collections.Generic.List[string]]::new()
$mdxFiles = @(
    Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Filter "*.mdx" |
        Where-Object { $_.FullName -notmatch '[\\/](?:node_modules|\.git|\.mintlify)[\\/]' } |
        Sort-Object FullName
)
$executableBlockCount = 0
$structuredBlockCount = 0
$inlineCommandCount = 0

foreach ($file in $mdxFiles) {
    $relative = $file.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $lines = Get-Content -LiteralPath $file.FullName
    $content = $lines -join "`n"
    $inFence = $false
    $fenceLanguage = ""

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = $lines[$index]
        if (-not $inFence -and $line -match '^\s*```(?<language>[^\s`]*)') {
            $inFence = $true
            $fenceLanguage = [string]$Matches.language
            if ($executableLanguages.Contains($fenceLanguage)) {
                $executableBlockCount++
                if (-not $executableExamplePages.Contains($relative)) {
                    $errors.Add("${relative}:$($index + 1) has an executable example without an approved topic-specific workflow") | Out-Null
                }
            }
            elseif (-not [string]::IsNullOrWhiteSpace($fenceLanguage)) {
                $structuredBlockCount++
                if (-not $structuredExamplePages.Contains($relative)) {
                    $errors.Add("${relative}:$($index + 1) has a structured example without an approved topic-specific configuration") | Out-Null
                }
            }
            continue
        }
        if ($inFence -and $line -match '^\s*```\s*$') {
            $inFence = $false
            $fenceLanguage = ""
        }
    }

    foreach ($match in [regex]::Matches($content, '`(?<command>stackkit\s+[^`\r\n]+)`')) {
        $inlineCommandCount++
        $command = [string]$match.Groups["command"].Value
        $allowed = if ($allowedInlineCommands.ContainsKey($relative)) {
            @($allowedInlineCommands[$relative])
        }
        else {
            @()
        }
        if ($command -cnotin $allowed) {
            $errors.Add("${relative} has non-approved inline command '$command'") | Out-Null
        }
    }
}

if ($errors.Count -gt 0) {
    Write-Host "Code-example relevance violations:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "Code-example relevance validation failed"
}

Write-Host "example_relevance_public_pages_checked: $($mdxFiles.Count)"
Write-Host "example_relevance_executable_blocks_checked: $executableBlockCount"
Write-Host "example_relevance_structured_blocks_checked: $structuredBlockCount"
Write-Host "example_relevance_inline_commands_checked: $inlineCommandCount"
Write-Host "example_relevance: ok"
