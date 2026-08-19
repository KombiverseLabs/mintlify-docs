[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$validator = Join-Path $PSScriptRoot "assert-public-safety.ps1"
$policySource = Join-Path $repoRoot "public-safety-policy.json"
$pwshCommand = (Get-Process -Id $PID).Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("mintlify-public-safety-" + [guid]::NewGuid().ToString("N"))
$tests = 0

function New-TestFixture {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string[]]$NavigationPages = @("index"),
        [hashtable]$Pages = @{
            "index.mdx" = "---`ntitle: Test`ndescription: Safe public page`n---`n`n# Test`n"
        },
        [string]$TabName = "Start",
        [switch]$RestrictedNavigation
    )

    $root = Join-Path $testRoot $Name
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Copy-Item -LiteralPath $policySource -Destination (Join-Path $root "public-safety-policy.json")

    $group = [ordered]@{
        group = "Test"
        pages = @($NavigationPages)
    }
    if ($RestrictedNavigation) {
        $group.public = $false
    }
    $docs = [ordered]@{
        navigation = [ordered]@{
            tabs = @([ordered]@{ tab = $TabName; groups = @($group) })
        }
    }
    $docs | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root "docs.json") -Encoding utf8

    foreach ($entry in $Pages.GetEnumerator()) {
        $path = Join-Path $root $entry.Key
        $directory = Split-Path -Parent $path
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        Set-Content -LiteralPath $path -Value $entry.Value -Encoding utf8
    }
    return $root
}

function Assert-Case {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Fixture,
        [Parameter(Mandatory = $true)][bool]$ShouldPass,
        [string]$ExpectedMessage
    )

    $script:tests++
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $pwshCommand
    $startInfo.Arguments = "-NoProfile -File `"$validator`" -RepoRoot `"$Fixture`""
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = $startInfo
    $null = $child.Start()
    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()
    $child.WaitForExit()
    $output = ($stdoutTask.Result + "`n" + $stderrTask.Result).Trim()
    $passed = $child.ExitCode -eq 0
    $child.Dispose()

    if ($passed -ne $ShouldPass) {
        throw "Test '$Name' expected pass=$ShouldPass but got pass=$passed. Output:`n$output"
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedMessage) -and $output -notmatch [regex]::Escape($ExpectedMessage)) {
        throw "Test '$Name' did not emit expected message '$ExpectedMessage'. Output:`n$output"
    }
    Write-Host "test_pass: $Name"
}

try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

    $safe = New-TestFixture -Name "safe"
    Assert-Case -Name "public allowlist passes" -Fixture $safe -ShouldPass $true -ExpectedMessage "public_safety: PASS"

    $explicitPublic = New-TestFixture -Name "explicit-public" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Safe public page`npublic: true`naudience: public`n---`n`n# Test`n"
    }
    Assert-Case -Name "explicit public frontmatter passes" -Fixture $explicitPublic -ShouldPass $true

    $hidden = New-TestFixture -Name "hidden-direct" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Safe public page`n---`n`n# Test`n"
        "review/secret.mdx" = "---`ntitle: Secret`ndescription: Hidden direct page`n---`n`n# Secret`n"
    }
    Assert-Case -Name "direct hidden page fails" -Fixture $hidden -ShouldPass $false -ExpectedMessage "absent from the public docs.json allowlist"

    $restricted = New-TestFixture -Name "restricted" -NavigationPages @("index", "review/secret") -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Safe public page`n---`n`n# Test`n"
        "review/secret.mdx" = "---`ntitle: Secret`ndescription: Restricted page`npublic: false`naudience: organization-members`n---`n`n# Secret`n"
    }
    Assert-Case -Name "restricted page fails even when navigated" -Fixture $restricted -ShouldPass $false -ExpectedMessage "only audience:public is permitted"

    $restrictedNavigation = New-TestFixture -Name "restricted-navigation" -RestrictedNavigation
    Assert-Case -Name "public false navigation fails" -Fixture $restrictedNavigation -ShouldPass $false -ExpectedMessage "contains public:false"

    $unapprovedTab = New-TestFixture -Name "unapproved-tab" -TabName "Simulate"
    Assert-Case -Name "unapproved navigation tab fails" -Fixture $unapprovedTab -ShouldPass $false -ExpectedMessage "outside the approved public scope"

    $unapprovedPage = New-TestFixture -Name "unapproved-page" -NavigationPages @("index", "sim/overview") -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Safe public page`n---`n`n# Test`n"
        "sim/overview.mdx" = "---`ntitle: Test`ndescription: Out of scope page`n---`n`n# Test`n"
    }
    Assert-Case -Name "unapproved public page fails" -Fixture $unapprovedPage -ShouldPass $false -ExpectedMessage "outside the approved public scope"

    $secret = New-TestFixture -Name "secret" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Unsafe operator secret name`n---`n`nAUTH0_MCP_BEARER must never be public.`n"
    }
    Assert-Case -Name "operator secret name fails" -Fixture $secret -ShouldPass $false -ExpectedMessage "operator-secret-name"

    $origin = New-TestFixture -Name "provider-origin" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Unsafe origin`n---`n`nUse https://internal-service.workers.dev/path.`n"
    }
    Assert-Case -Name "provider origin fails" -Fixture $origin -ShouldPass $false -ExpectedMessage "provider-origin"

    $proxmox = New-TestFixture -Name "proxmox" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Internal development infrastructure`n---`n`nProxmox setup guide.`n"
    }
    Assert-Case -Name "internal Proxmox content fails" -Fixture $proxmox -ShouldPass $false -ExpectedMessage "internal-proxmox"

    $unreleasedProduct = New-TestFixture -Name "unreleased-product" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Unreleased product surface`n---`n`nUse kombify Techstack to operate this stack.`n"
    }
    Assert-Case -Name "unreleased product content fails" -Fixture $unreleasedProduct -ShouldPass $false -ExpectedMessage "unreleased-product-surface"

    $escapedLink = New-TestFixture -Name "escaped-link" -Pages @{
        "index.mdx" = "---`ntitle: Test`ndescription: Escaped local link`n---`n`n[Outside](../outside.txt)`n"
    }
    Assert-Case -Name "link cannot escape repository" -Fixture $escapedLink -ShouldPass $false -ExpectedMessage "unresolved local link"

    Write-Host "public_safety_tests: PASS ($tests cases)"
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
