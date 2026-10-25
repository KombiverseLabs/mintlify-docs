# Mintlify serves every repository file it does not ignore at its path, not
# only pages. Ignore rules follow .gitignore syntax, evaluated in order.
function ConvertTo-MintIgnoreRule {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Line)

    $pattern = $Line.Trim()
    if ($pattern.Length -eq 0 -or $pattern.StartsWith("#")) {
        return $null
    }
    $negated = $pattern.StartsWith("!")
    if ($negated) {
        $pattern = $pattern.Substring(1)
    }
    $directoryOnly = $pattern.EndsWith("/")
    $pattern = $pattern.TrimEnd("/")
    $anchored = $pattern.Contains("/")
    $pattern = $pattern.TrimStart("/")
    if ($pattern.Length -eq 0) {
        return $null
    }

    $builder = [System.Text.StringBuilder]::new()
    $index = 0
    while ($index -lt $pattern.Length) {
        $character = [string]$pattern[$index]
        if ($character -eq "*" -and $index + 1 -lt $pattern.Length -and [string]$pattern[$index + 1] -eq "*") {
            if ($index + 2 -lt $pattern.Length -and [string]$pattern[$index + 2] -eq "/") {
                $null = $builder.Append("(?:.*/)?")
                $index += 3
            }
            else {
                $null = $builder.Append(".*")
                $index += 2
            }
            continue
        }
        if ($character -eq "*") {
            $null = $builder.Append("[^/]*")
        }
        elseif ($character -eq "?") {
            $null = $builder.Append("[^/]")
        }
        else {
            $null = $builder.Append([regex]::Escape($character))
        }
        $index++
    }
    $prefix = if ($anchored) { "^" } else { "(?:^|/)" }
    $suffix = if ($directoryOnly) { "/" } else { "(?:/|$)" }
    return [pscustomobject]@{
        Negated = $negated
        Regex   = [regex]::new($prefix + $builder.ToString() + $suffix)
    }
}

function Test-MintIgnored {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Rules
    )

    $ignored = $false
    foreach ($rule in $Rules) {
        if ($rule.Regex.IsMatch($RelativePath)) {
            $ignored = -not $rule.Negated
        }
    }
    return $ignored
}

function Get-MintIgnoreRules {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
$mintIgnoreLines = @(
    ".git/", ".github/", ".claude/", ".agents/", ".idea/", ".vscode/", ".cursor/", ".mintlify/", "node_modules/",
    "README.md", "LICENSE.md", "CHANGELOG.md", "CONTRIBUTING.md"
)
$mintIgnorePath = Join-Path $RepoRoot ".mintignore"
if (Test-Path -LiteralPath $mintIgnorePath -PathType Leaf) {
    $mintIgnoreLines += @(Get-Content -LiteralPath $mintIgnorePath)
}
return @($mintIgnoreLines | ForEach-Object { ConvertTo-MintIgnoreRule -Line ([string]$_) } | Where-Object { $null -ne $_ })
}
