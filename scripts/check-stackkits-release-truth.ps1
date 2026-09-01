[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$requiredMarkersByPage = @(
    @{
        Path = "stackkits/quickstart.mdx"
        Markers = @(
            "https://stackkit.cc/getting-started/cli",
            "https://base.stackkit.cc",
            "curl -sSL https://base.stackkit.cc | sh",
            "stackkit plan --json"
        )
    },
    @{
        Path = "guides/stackkits/choosing-a-kit.mdx"
        Markers = @(
            "https://stackkit.cc/getting-started",
            "https://install.stackkit.cc",
            "curl -sSL https://install.stackkit.cc | sh"
        )
    },
    @{
        Path = "stackkits/kits/cloud-kit.mdx"
        Markers = @(
            "https://cloud.stackkit.cc",
            "curl -sSL https://cloud.stackkit.cc | DOMAIN=example.com sh",
            "does not provision"
        )
    }
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($page in $requiredMarkersByPage) {
    $pagePath = Join-Path $repoRoot $page.Path
    if (-not (Test-Path -LiteralPath $pagePath -PathType Leaf)) {
        $errors.Add("missing release-truth page: $($page.Path)") | Out-Null
        continue
    }
    $content = Get-Content -LiteralPath $pagePath -Raw
    foreach ($marker in $page.Markers) {
        if ($content.IndexOf($marker, [System.StringComparison]::Ordinal) -lt 0) {
            $errors.Add("$($page.Path) is missing release-truth marker '$marker'") | Out-Null
        }
    }
}

$rules = @(
    @{ Pattern = '(?i)\bstackkits\.cc\b'; Reason = "wrong public website; use singular stackkit.cc" },
    @{ Pattern = '\bhome\.localhost\b'; Reason = "stale native-v2 local domain; current releases author home.test" },
    @{ Pattern = '(?i)\bone[- ]liner\s+(?:fully\s+)?(?:deploys?|applies?)\b'; Reason = "installer must not be described as performing Apply" },
    @{ Pattern = '(?i)\bDOMAIN=[^\s|]+\s+curl\b[^\r\n]*cloud\.stackkit\.cc'; Reason = "DOMAIN must be passed to sh on the right side of the pipeline" },
    @{ Pattern = '(?i)curl\s+-sSL\s+https://(?:base|cloud|install)\.stackkit\.cc[^\r\n]*\bSTACKKIT_RELEASE_VERSION\s*='; Reason = "public installer commands must resolve the current release instead of pinning a stale version" },
    @{ Pattern = '(?i)\b(?:Immich|Vaultwarden|Jellyfin)\b[^\r\n]{0,80}\bdefault application\b'; Reason = "these applications are not selected by the initial native-v2 StackSpec" },
    @{ Pattern = '(?i)\bKomodo\b[^\r\n]{0,80}\bsupported alternative\b'; Reason = "Komodo maturity must follow the current adapter matrix" },
    @{ Pattern = '(?i)\bCloud Kit is (?:the )?stable\b'; Reason = "Cloud live-runtime release evidence remains pending" }
)

$mdxFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Filter "*.mdx" |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($file in $mdxFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $relative = $file.FullName.Substring($repoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    foreach ($rule in $rules) {
        $match = [regex]::Match($content, $rule.Pattern)
        if ($match.Success) {
            $errors.Add("${relative}: '$($match.Value)' - $($rule.Reason)") | Out-Null
        }
    }
}

if ($errors.Count -gt 0) {
    Write-Host "StackKits release-truth violations:"
    foreach ($errorMessage in $errors) {
        Write-Host " - $errorMessage"
    }
    throw "StackKits release-truth validation failed"
}

Write-Host "stackkits_release: current-public-release"
Write-Host "stackkits_release_truth_files_checked: $($mdxFiles.Count)"
Write-Host "stackkits_release_truth: ok"
