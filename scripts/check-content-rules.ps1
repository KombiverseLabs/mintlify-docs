[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# Tier-1 content rules (DOCUMENTATION-STANDARD.md + ADR-0026 kit taxonomy).
# Each rule: regex pattern, human reason, optional path exclusions (regex on repo-relative path).
$rules = @(
    @{ Pattern = '/stackkits/kits/base-kit'; Reason = "retired kit page link (base-kit is retired; use /stackkits/kits/basement-kit)" },
    @{ Pattern = '/stackkits/kits/ha-kit'; Reason = "retired kit page link (HA is the add-on /stackkits/addons/high-availability)" },
    @{ Pattern = '\bBase Kit\b'; Reason = "retired kit name (ADR-0026: use Basement Kit)"; Exclude = '^changelog/' },
    @{ Pattern = '\bBase Homelab\b'; Reason = "retired kit name (ADR-0026)"; Exclude = '^changelog/' },
    @{ Pattern = '\bHA Kit\b'; Reason = "retired marketed kit (ADR-0026: HA is a node-gated add-on)"; Exclude = '^changelog/' },
    @{ Pattern = '\bHigh Availability Kit\b'; Reason = "retired marketed kit (ADR-0026)"; Exclude = '^changelog/' },
    @{ Pattern = 'localhost:\d'; Reason = "localhost:PORT URLs are not allowed in Tier-1 docs" },
    @{ Pattern = '(?i)doppler'; Reason = "secret-manager references are not allowed in Tier-1 docs" },
    @{ Pattern = '\bplatform-[a-z0-9]*\d[a-z0-9]*(\.\d+)?\b'; Reason = "internal issue-tracker IDs are not allowed in Tier-1 docs" }
)

$failures = [System.Collections.Generic.List[string]]::new()
$mdxFiles = Get-ChildItem -Path $repoRoot -Recurse -Include *.mdx -File |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }

$rootPrefix = $repoRoot.TrimEnd('\') + '\'

foreach ($file in $mdxFiles) {
    $relativePath = $file.FullName.Substring($rootPrefix.Length).Replace('\', '/')
    $content = Get-Content -LiteralPath $file.FullName -Raw

    foreach ($rule in $rules) {
        if ($rule.ContainsKey('Exclude') -and $relativePath -match $rule.Exclude) {
            continue
        }
        $ruleMatches = [regex]::Matches($content, $rule.Pattern)
        if ($ruleMatches.Count -gt 0) {
            $failures.Add("${relativePath}: '$($ruleMatches[0].Value)' - $($rule.Reason)") | Out-Null
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host "content rule violations:"
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    throw "content rules validation failed"
}

Write-Host "content_rules_files_checked: $($mdxFiles.Count)"
Write-Host "content_rules: ok"
