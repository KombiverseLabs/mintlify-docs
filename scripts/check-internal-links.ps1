[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repoRoot

function Get-RepoRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $rootPath = [System.IO.Path]::GetFullPath($repoRoot)
    if (-not $rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $rootPath += [System.IO.Path]::DirectorySeparatorChar
    }

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $rootUri = [System.Uri]::new($rootPath)
    $fileUri = [System.Uri]::new($fullPath)
    return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString())
}

function Normalize-Route {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $route = $Value.Trim()
    if ([string]::IsNullOrWhiteSpace($route)) {
        return ""
    }

    foreach ($separator in @("#", "?")) {
        $index = $route.IndexOf($separator)
        if ($index -ge 0) {
            $route = $route.Substring(0, $index)
        }
    }

    $route = $route.Trim().TrimStart("/").TrimEnd("/")
    $route = $route.Replace("\", "/")

    foreach ($extension in @(".mdx", ".md")) {
        if ($route.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
            $route = $route.Substring(0, $route.Length - $extension.Length)
            break
        }
    }

    return $route
}

function Add-PageRef {
    param($Node, [System.Collections.Generic.HashSet[string]]$Routes)

    if ($null -eq $Node) {
        return
    }

    if ($Node -is [string]) {
        $route = Normalize-Route -Value $Node
        if (-not [string]::IsNullOrWhiteSpace($route)) {
            $Routes.Add($route) | Out-Null
        }
        return
    }

    if ($Node -is [System.Array]) {
        foreach ($item in $Node) {
            Add-PageRef -Node $item -Routes $Routes
        }
        return
    }

    foreach ($property in $Node.PSObject.Properties) {
        if ($property.Name -in @("pages", "groups", "tabs")) {
            Add-PageRef -Node $property.Value -Routes $Routes
        }
    }
}

function Is-SkippedTarget {
    param([string]$Target)

    if ([string]::IsNullOrWhiteSpace($Target)) {
        return $true
    }

    $trimmed = $Target.Trim()
    return $trimmed.StartsWith("#") -or
        $trimmed.StartsWith("http://", [System.StringComparison]::OrdinalIgnoreCase) -or
        $trimmed.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase) -or
        $trimmed.StartsWith("mailto:", [System.StringComparison]::OrdinalIgnoreCase) -or
        $trimmed.StartsWith("tel:", [System.StringComparison]::OrdinalIgnoreCase) -or
        $trimmed.StartsWith("javascript:", [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-TargetRoute {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [Parameter(Mandatory = $true)]
        [string]$SourceRelativePath
    )

    $targetPath = $Target.Trim()
    if ($targetPath.StartsWith("/")) {
        return Normalize-Route -Value $targetPath
    }

    $sourceDir = [System.IO.Path]::GetDirectoryName($SourceRelativePath)
    if ([string]::IsNullOrWhiteSpace($sourceDir)) {
        return Normalize-Route -Value $targetPath
    }

    $combined = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $repoRoot $sourceDir) $targetPath))
    $relative = Get-RepoRelativePath -Path $combined
    return Normalize-Route -Value $relative
}

$docsJsonPath = Join-Path $repoRoot "docs.json"
$docs = Get-Content -LiteralPath $docsJsonPath -Raw | ConvertFrom-Json

$routes = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
Add-PageRef -Node $docs.navigation -Routes $routes

$mdxFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Filter "*.mdx" |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' }

foreach ($file in $mdxFiles) {
    $relativePath = (Get-RepoRelativePath -Path $file.FullName).Replace("\", "/")
    $routes.Add((Normalize-Route -Value $relativePath)) | Out-Null
}

$markdownLinkPattern = [regex]'!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)'
$hrefPattern = [regex]'href\s*=\s*["'']([^"'']+)["'']'
$failures = [System.Collections.Generic.List[string]]::new()
$checked = 0

foreach ($file in $mdxFiles) {
    $relativePath = (Get-RepoRelativePath -Path $file.FullName).Replace("\", "/")
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $targets = [System.Collections.Generic.List[string]]::new()

    foreach ($match in $markdownLinkPattern.Matches($content)) {
        $targets.Add($match.Groups[1].Value) | Out-Null
    }
    foreach ($match in $hrefPattern.Matches($content)) {
        $targets.Add($match.Groups[1].Value) | Out-Null
    }

    foreach ($target in $targets) {
        if (Is-SkippedTarget -Target $target) {
            continue
        }

        $route = Resolve-TargetRoute -Target $target -SourceRelativePath $relativePath
        if ([string]::IsNullOrWhiteSpace($route)) {
            continue
        }

        $extension = [System.IO.Path]::GetExtension($route)
        if (-not [string]::IsNullOrWhiteSpace($extension) -and $extension -notin @(".md", ".mdx")) {
            $assetPath = Join-Path $repoRoot $route
            if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
                $failures.Add("${relativePath}: missing asset target ${target}") | Out-Null
            }
            $checked += 1
            continue
        }

        if (-not $routes.Contains($route)) {
            $failures.Add("${relativePath}: missing page target ${target}") | Out-Null
        }
        $checked += 1
    }
}

if ($failures.Count -gt 0) {
    Write-Host "internal link failures:"
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    throw "internal link validation failed"
}

Write-Host "internal_links_checked: $checked"
Write-Host "internal_links: ok"
