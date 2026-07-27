[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$DocsConfigPath,
    [string]$PolicyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if ([string]::IsNullOrWhiteSpace($DocsConfigPath)) {
    $DocsConfigPath = Join-Path $RepoRoot "docs.json"
}
if ([string]::IsNullOrWhiteSpace($PolicyPath)) {
    $PolicyPath = Join-Path $RepoRoot "public-safety-policy.json"
}

foreach ($requiredFile in @($DocsConfigPath, $PolicyPath)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required public-safety input is missing: $requiredFile"
    }
}

$docsRaw = Get-Content -LiteralPath $DocsConfigPath -Raw
$docs = $docsRaw | ConvertFrom-Json
$policy = Get-Content -LiteralPath $PolicyPath -Raw | ConvertFrom-Json

if ([int]$policy.version -ne 1) {
    throw "Unsupported public-safety policy version '$($policy.version)'"
}
if ([string]$policy.publicationMode -ne "public-only") {
    throw "mintlify-docs must use publicationMode 'public-only'; got '$($policy.publicationMode)'"
}

function Normalize-PagePath {
    param([Parameter(Mandatory = $true)][string]$PathValue)

    $value = $PathValue.Trim().Replace("\", "/").TrimStart("/")
    if ($value.EndsWith(".mdx", [System.StringComparison]::OrdinalIgnoreCase)) {
        $value = $value.Substring(0, $value.Length - 4)
    }
    return $value.TrimEnd("/")
}

function Add-NavigationPage {
    param(
        $Node,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[string]]$Pages
    )

    if ($null -eq $Node) {
        return
    }
    if ($Node -is [string]) {
        $Pages.Add((Normalize-PagePath -PathValue $Node)) | Out-Null
        return
    }
    if ($Node -is [System.Array]) {
        foreach ($item in $Node) {
            Add-NavigationPage -Node $item -Pages $Pages
        }
        return
    }
    foreach ($property in $Node.PSObject.Properties) {
        if ($property.Name -in @("pages", "groups", "tabs")) {
            Add-NavigationPage -Node $property.Value -Pages $Pages
        }
    }
}

function Get-FrontmatterBody {
    param([Parameter(Mandatory = $true)][string]$Content)

    $match = [regex]::Match(
        $Content,
        "\A---\r?\n(?<body>.*?)\r?\n---(?:\r?\n|\z)",
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups["body"].Value
}

function Get-FrontmatterValue {
    param(
        [Parameter(Mandatory = $true)][string]$Body,
        [Parameter(Mandatory = $true)][string]$Key
    )

    $match = [regex]::Match($Body, "(?im)^" + [regex]::Escape($Key) + ":\s*(?<value>.*?)\s*$")
    if (-not $match.Success) {
        return $null
    }
    return $match.Groups["value"].Value.Trim().Trim("'`"")
}

function Test-LocalLinkTarget {
    param(
        [Parameter(Mandatory = $true)][string]$SourceFile,
        [Parameter(Mandatory = $true)][string]$RawTarget
    )

    $target = $RawTarget.Trim().Trim("<", ">", "'", "`"")
    if ([string]::IsNullOrWhiteSpace($target) -or $target.StartsWith("#")) {
        return $true
    }
    if ($target -match '^(?i)(?:https?:|mailto:|tel:|data:|javascript:|//)') {
        return $true
    }
    if ($target -match '^\{.*\}$') {
        return $true
    }

    $target = ($target -split "#", 2)[0]
    $target = ($target -split "\?", 2)[0]
    try {
        $target = [uri]::UnescapeDataString($target)
    }
    catch {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($target)) {
        return $true
    }

    if ($target.StartsWith("/")) {
        $candidate = Join-Path $RepoRoot $target.TrimStart("/")
    }
    else {
        $candidate = Join-Path (Split-Path -Parent $SourceFile) $target
    }
    try {
        $candidate = [System.IO.Path]::GetFullPath($candidate)
    }
    catch {
        return $false
    }
    $repoBoundary = $RepoRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    if ($candidate -ne $RepoRoot -and -not $candidate.StartsWith($repoBoundary, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }

    $candidates = [System.Collections.Generic.List[string]]::new()
    $candidates.Add($candidate) | Out-Null
    if ([string]::IsNullOrWhiteSpace([System.IO.Path]::GetExtension($candidate))) {
        $candidates.Add($candidate + ".mdx") | Out-Null
        $candidates.Add((Join-Path $candidate "index.mdx")) | Out-Null
    }
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            return $true
        }
    }
    return $false
}

$errors = [System.Collections.Generic.List[string]]::new()
$localLinksChecked = 0

if ([regex]::IsMatch($docsRaw, '(?im)"public"\s*:\s*false')) {
    $errors.Add("docs.json contains public:false; this repository has no restricted navigation mode") | Out-Null
}
if ([regex]::IsMatch($docsRaw, '(?im)"(?:audience|authentication|restricted)"\s*:')) {
    $errors.Add("docs.json contains a restricted-audience property; all navigation is public") | Out-Null
}

$navigationPages = [System.Collections.Generic.List[string]]::new()
Add-NavigationPage -Node $docs.navigation -Pages $navigationPages
$publicPages = @($navigationPages | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
$publicPageSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($page in $publicPages) {
    $null = $publicPageSet.Add($page)
}

if ($publicPages.Count -eq 0) {
    $errors.Add("docs.json has no public navigation pages") | Out-Null
}
if (-not $publicPageSet.Contains("index")) {
    $errors.Add("docs.json public navigation must include index") | Out-Null
}

$excludedDirectorySet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($directory in @($policy.excludedDirectories)) {
    $null = $excludedDirectorySet.Add([string]$directory)
}

$mdxFiles = @(
    Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Filter "*.mdx" | Where-Object {
        $relative = $_.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        $segments = @($relative -split "/")
        -not @($segments | Where-Object { $excludedDirectorySet.Contains($_) }).Count
    }
)

$mdxPageSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($file in $mdxFiles) {
    $relative = $file.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $page = Normalize-PagePath -PathValue $relative
    $null = $mdxPageSet.Add($page)
}

foreach ($page in $publicPages) {
    if (-not $mdxPageSet.Contains($page)) {
        $errors.Add("public navigation references missing page '$page.mdx'") | Out-Null
    }
}
foreach ($page in $mdxPageSet) {
    if (-not $publicPageSet.Contains($page)) {
        $errors.Add("MDX page '$page.mdx' is directly publishable but absent from the public docs.json allowlist") | Out-Null
    }
}

foreach ($file in $mdxFiles) {
    $relative = $file.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    $page = Normalize-PagePath -PathValue $relative
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $frontmatter = Get-FrontmatterBody -Content $content

    if ($null -eq $frontmatter) {
        $errors.Add("'$relative' has missing or malformed frontmatter") | Out-Null
        continue
    }
    foreach ($requiredKey in @("title", "description")) {
        if ([string]::IsNullOrWhiteSpace((Get-FrontmatterValue -Body $frontmatter -Key $requiredKey))) {
            $errors.Add("'$relative' is missing required frontmatter '$requiredKey'") | Out-Null
        }
    }

    $publicValue = Get-FrontmatterValue -Body $frontmatter -Key "public"
    if ($null -ne $publicValue -and $publicValue.ToLowerInvariant() -ne "true") {
        $errors.Add("'$relative' declares public:$publicValue; only public:true is permitted") | Out-Null
    }
    $audienceValue = Get-FrontmatterValue -Body $frontmatter -Key "audience"
    if ($null -ne $audienceValue -and $audienceValue.ToLowerInvariant() -ne "public") {
        $errors.Add("'$relative' declares audience:$audienceValue; only audience:public is permitted") | Out-Null
    }
    foreach ($key in @($policy.forbiddenFrontmatterKeys)) {
        if ($null -ne (Get-FrontmatterValue -Body $frontmatter -Key ([string]$key))) {
            $errors.Add("'$relative' uses forbidden restricted-publication frontmatter '$key'") | Out-Null
        }
    }
    foreach ($booleanKey in @("draft", "hidden")) {
        $value = Get-FrontmatterValue -Body $frontmatter -Key $booleanKey
        if ($null -ne $value -and $value.ToLowerInvariant() -eq "true") {
            $errors.Add("'$relative' uses $booleanKey`:true; hidden routes are still directly publishable") | Out-Null
        }
    }
    foreach ($prefix in @($policy.forbiddenPathPrefixes)) {
        if ($page.StartsWith(([string]$prefix), [System.StringComparison]::OrdinalIgnoreCase)) {
            $errors.Add("'$relative' is under forbidden public path prefix '$prefix'") | Out-Null
        }
    }
    foreach ($rule in @($policy.forbiddenContentPatterns)) {
        try {
            $matched = [regex]::IsMatch($content, [string]$rule.pattern)
        }
        catch {
            throw "Invalid public-safety regex '$($rule.id)': $($_.Exception.Message)"
        }
        if ($matched) {
            $errors.Add("'$relative' matches forbidden content rule '$($rule.id)'") | Out-Null
        }
    }

    $linkMatches = @(
        [regex]::Matches($content, '\]\((?<target>[^)]+)\)') +
        [regex]::Matches($content, '(?i)\bhref\s*=\s*["''](?<target>[^"'']+)["'']')
    )
    foreach ($linkMatch in $linkMatches) {
        $rawTarget = $linkMatch.Groups["target"].Value
        $localLinksChecked++
        if (-not (Test-LocalLinkTarget -SourceFile $file.FullName -RawTarget $rawTarget)) {
            $errors.Add("'$relative' contains unresolved local link '$rawTarget'") | Out-Null
        }
    }
}

if ($errors.Count -gt 0) {
    Write-Host "public safety errors:"
    foreach ($errorText in @($errors | Sort-Object -Unique)) {
        Write-Host " - $errorText"
    }
    throw "Public documentation safety validation failed with $($errors.Count) finding(s)"
}

Write-Host "publication_mode: public-only"
Write-Host "public_allowlist_pages: $($publicPages.Count)"
Write-Host "direct_hidden_pages: 0"
Write-Host "forbidden_content_findings: 0"
Write-Host "local_links_checked: $localLinksChecked"
Write-Host "public_safety: PASS"
