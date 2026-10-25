. (Join-Path $PSScriptRoot "publication.ps1")

# Deliberately a literal-source scanner, not an MDX evaluator or a link crawler.
function Get-ExternalTargetKey {
    param([string]$Target)
    $uri = $null
    if ($Target -match '[${}<>]' -or -not [uri]::TryCreate($Target, [UriKind]::Absolute, [ref]$uri)) { return $null }
    if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or -not $uri.IsDefaultPort) { return $null }
    return $uri.GetLeftPart([UriPartial]::Path) + $uri.Query
}

function Remove-UnevaluatedMdxExpressions {
    param([string]$Text)
    # Preserve the one expression form whose value is known without evaluation.
    $Text = [regex]::Replace($Text, '\bhref\s*=\s*\{\s*(["''])(?<target>[^"'']*)\1\s*\}', 'href="${target}"')
    $result = [Text.StringBuilder]::new()
    $depth = 0; $quote = ''; $escaped = $false; $unresolved = 0; $position = -1
    foreach ($character in $Text.ToCharArray()) {
        $position++
        if ($depth -eq 0) {
            if ($character -eq '{') {
                $depth = 1
                $prefix = $Text.Substring(0, $position)
                $linePrefix = $prefix.Substring($prefix.LastIndexOf("`n") + 1)
                if ($linePrefix -notmatch '^\s*import\b') { $unresolved++ }
            }
            else { $null = $result.Append($character) }
            continue
        }
        if ($quote) {
            if ($escaped) { $escaped = $false }
            elseif ($character -eq '\') { $escaped = $true }
            elseif ($character -eq $quote) { $quote = '' }
        }
        elseif ($character -in @('"', "'", '`')) { $quote = [string]$character }
        elseif ($character -eq '{') { $depth++ }
        elseif ($character -eq '}') { $depth-- }
    }
    return [pscustomobject]@{ Text = $result.ToString(); UnresolvedExpressions = $unresolved }
}

function Get-PublishedExternalLiterals {
    param([string]$RepoRoot, [Parameter(Mandatory = $true)]$Diagnostics)
    $rules = @(Get-MintIgnoreRules -RepoRoot $RepoRoot)
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $pending = [Collections.Generic.Queue[string]]::new()
    foreach ($file in Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force -Filter '*.mdx') {
        $relative = $file.FullName.Substring($RepoRoot.Length).TrimStart('/','\').Replace('\','/')
        if ($relative -notmatch '^snippets/' -and -not (Test-MintIgnored $relative $rules)) { $pending.Enqueue($file.FullName) }
    }
    $docs = Get-Content -LiteralPath (Join-Path $RepoRoot 'docs.json') -Raw | ConvertFrom-Json
    function Read-ConfigLinks($Value) {
        if ($null -eq $Value -or $Value -is [string] -or $Value -is [ValueType]) { return }
        if ($Value -is [array]) { foreach ($item in $Value) { Read-ConfigLinks $item }; return }
        foreach ($property in $Value.PSObject.Properties) {
            if ($property.Name -eq 'href' -and $property.Value -is [string]) {
                [pscustomobject]@{ Target = $property.Value; Source = 'docs.json'; Kind = 'config-href' }
            } else { Read-ConfigLinks $property.Value }
        }
    }
    Read-ConfigLinks $docs
    while ($pending.Count) {
        $file = $pending.Dequeue()
        if (-not $seen.Add($file)) { continue }
        $relative = $file.Substring($RepoRoot.Length).TrimStart('/','\').Replace('\','/')
        $content = [string](Get-Content -LiteralPath $file -Raw)
        $content = [regex]::Replace($content, '\A---\r?\n.*?\r?\n---(?:\r?\n|$)', '', 'Singleline')
        $content = [regex]::Replace($content, '<!--.*?-->|\{/\*.*?\*/\}', '', 'Singleline')
        $rendered = [Text.StringBuilder]::new()
        $fence = ''; $shell = $false
        foreach ($line in ($content -split '\r?\n')) {
            if (-not $fence -and $line -match '^\s{0,3}(`{3,}|~{3,})([^\s]*)') {
                $fence = $Matches[1]; $shell = $Matches[2] -in @('sh','bash','shell','zsh'); continue
            }
            if ($fence) {
                if ($line -match ('^\s{0,3}' + [regex]::Escape($fence[0]) + '{' + $fence.Length + ',}\s*$')) { $fence = ''; continue }
                if ($shell) {
                    $command = $line -replace '(?:^|\s)#.*$', ''
                    if ($command -match '^\s*(?:sudo\s+)?(?:curl|wget)\s+') {
                        foreach ($match in [regex]::Matches($command, 'https://(?:install|base|cloud)\.stackkit\.cc(?:/[^\s"''|;]*)?(?=[\s"''|;]|$)')) {
                            [pscustomobject]@{ Target = $match.Value; Source = $relative; Kind = 'installer-command' }
                        }
                    }
                }
                continue
            }
            if ($line -match '^(?: {4}|\t)') { continue }
            $null = $rendered.AppendLine($line)
        }
        $text = [regex]::Replace($rendered.ToString(), '(`+).*?\1', '', 'Singleline')
        if ($text -match '(?m)^export\s') {
            $Diagnostics.ExportedModules++
            Write-Host "external_literals_unresolved: exported_mdx_module=$relative"
            continue
        }
        $masked = Remove-UnevaluatedMdxExpressions $text
        $Diagnostics.Expressions += $masked.UnresolvedExpressions
        if ($masked.UnresolvedExpressions) {
            Write-Host "external_literals_unresolved: source=$relative expressions=$($masked.UnresolvedExpressions)"
        }
        $text = $masked.Text
        # Only used, local MDX imports are followed. JSX/JS and dynamic expressions
        # require rendering/evaluation and are outside this literal coverage.
        foreach ($import in [regex]::Matches($text, '(?m)^import\s+(?<name>[A-Za-z_$][\w$]*)\s+from\s+["''](?<path>[^"'']+\.mdx)["''];?')) {
            if ($text -notmatch ('<' + [regex]::Escape($import.Groups['name'].Value) + '(?:\s|/?>)')) { continue }
            $path = $import.Groups['path'].Value
            $base = if ($path.StartsWith('/')) { $RepoRoot } else { Split-Path $file }
            $target = [IO.Path]::GetFullPath((Join-Path $base $path.TrimStart('/')))
            if (-not $target.StartsWith($RepoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::Ordinal)) { continue }
            $targetRelative = $target.Substring($RepoRoot.Length).TrimStart('/','\').Replace('\','/')
            if ((Test-Path -LiteralPath $target -PathType Leaf) -and -not (Test-MintIgnored $targetRelative $rules)) { $pending.Enqueue($target) }
        }
        $text = [regex]::Replace($text, '(?m)^import\s+.*$', '')
        $patterns = @(
            '\[[^\]\r\n]*\]\(\s*<?(?<target>https://[^\s)>]+)>?(?:\s+["''][^\r\n]*["''])?\s*\)',
            '<(?<target>https://[^\s<>]+)>',
            '\bhref\s*=\s*(?:["''](?<target>[^"'']+)["'']|\{\s*["''](?<target>[^"'']+)["'']\s*\})'
        )
        foreach ($pattern in $patterns) {
            foreach ($match in [regex]::Matches($text, $pattern)) {
                [pscustomobject]@{ Target = [Net.WebUtility]::HtmlDecode($match.Groups['target'].Value); Source = $relative; Kind = 'link-literal' }
            }
        }
        foreach ($definition in [regex]::Matches($text, '(?m)^\s{0,3}\[(?<label>[^\]]+)\]:\s*<?(?<target>https://[^\s>]+)>?')) {
            $label = [regex]::Escape($definition.Groups['label'].Value)
            $body = [regex]::Replace($text, '(?m)^\s{0,3}\[[^\]]+\]:.*$', '')
            if ($body -match ('(?i)\[(?:[^\]]+)\]\[' + $label + '\]|\[' + $label + '\](?:\[\])?(?![(:])')) {
                [pscustomobject]@{ Target = $definition.Groups['target'].Value; Source = $relative; Kind = 'reference-link' }
            }
        }
    }
}

function Invoke-RegisteredExternalCheck {
    param([string]$RepoRoot, [string[]]$Candidates, [string]$Prefix, [int]$TimeoutSeconds)
    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path.TrimEnd('/','\')
    $registry = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($candidate in $Candidates) {
        $key = Get-ExternalTargetKey $candidate
        if (-not $key) { throw 'Invalid external destination registry entry (HTTPS without credentials required)' }
        $null = $registry.Add($key)
    }
    $targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $offered = 0; $unregistered = 0; $unsafe = 0
    $discovery = [pscustomobject]@{ Expressions = 0; ExportedModules = 0 }
    foreach ($literal in Get-PublishedExternalLiterals -RepoRoot $RepoRoot -Diagnostics $discovery) {
        $offered++
        $key = Get-ExternalTargetKey $literal.Target
        if (-not $key) { $unsafe++; continue }
        if (-not $registry.Contains($key)) { $unregistered++; continue }
        $null = $targets.Add($key)
    }
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    $failed = 0; $checked = 0
    try {
        foreach ($target in ($targets | Sort-Object)) {
            $checked++
            $uri = [uri]$target
            # One deadline per destination, including all redirect hops.
            $deadline = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
            try {
                for ($hop = 0; $hop -le 5; $hop++) {
                    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Head, $uri)
                    $response = $null
                    try {
                        $response = $client.SendAsync($request, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $deadline.Token).GetAwaiter().GetResult()
                        $status = [int]$response.StatusCode
                        if ($status -in @(301,302,303,307,308)) {
                            if ($hop -eq 5 -or $null -eq $response.Headers.Location) { throw 'Invalid redirect chain' }
                            $next = [uri]::new($uri, $response.Headers.Location)
                            if (-not (Get-ExternalTargetKey $next.AbsoluteUri)) { throw 'Unsafe redirect' }
                            $uri = $next
                            continue
                        }
                        if ($status -lt 200 -or $status -ge 300) { throw "HTTP $status" }
                        Write-Host "${Prefix}_external_link: HTTP $status $(([uri]$target).GetLeftPart([UriPartial]::Path))"
                        break
                    }
                    finally { if ($null -ne $response) { $response.Dispose() }; $request.Dispose() }
                }
            }
            catch {
                $failed++
                # Exceptions and redirect locations may contain signed query credentials.
                Write-Host "${Prefix}_external_link_failed: $(([uri]$target).GetLeftPart([UriPartial]::Path)) (HTTP, transport or redirect failure)"
            }
            finally { $deadline.Dispose() }
        }
    }
    finally { $client.Dispose(); $handler.Dispose() }
    Write-Host "${Prefix}_external_links_scope: registered-destinations/literals (dynamic MDX not evaluated)"
    Write-Host "${Prefix}_external_links_unresolved: expressions=$($discovery.Expressions); exported_mdx_modules=$($discovery.ExportedModules)"
    Write-Host "${Prefix}_external_links_offered: $offered; eligible_unique=$($targets.Count); skipped_unregistered=$unregistered; skipped_unsafe_or_template=$unsafe; failed=$failed"
    Write-Host "${Prefix}_external_links_checked: $checked"
    if ($failed) { throw "$Prefix external-link validation failed" }
    Write-Host "${Prefix}_external_links: ok"
}
