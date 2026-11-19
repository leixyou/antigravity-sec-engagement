#Requires -Version 5.1
<#
.SYNOPSIS
  Installs the sec-engagement plugin into the Antigravity desktop app for the
  current Windows user. The agy CLI is not required.

.DESCRIPTION
  Copies (or shallow-clones) the plugin into %USERPROFILE%\.gemini\config\plugins\
  sec-engagement, strips VCS and engagement material from the copy, checks for a
  usable Node.js, and runs the plugin's own self-test.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -Source . -Force
#>
[CmdletBinding()]
param(
    [string] $Source = 'https://github.com/leixyou/antigravity-sec-engagement',
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  ok  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !!  $m" -ForegroundColor Yellow }

$configRoot = Join-Path $env:USERPROFILE '.gemini\config\plugins'
$dest       = Join-Path $configRoot 'sec-engagement'

Step "Target: $dest"

if (Test-Path $dest) {
    if (-not $Force) {
        Warn "$dest already exists. Re-run with -Force to replace it."
        exit 1
    }
    Step 'Removing the existing installation'
    Remove-Item -Recurse -Force $dest
}

New-Item -ItemType Directory -Force -Path $configRoot | Out-Null

if ($Source -match '^(https?://|git@)') {
    Step "Cloning $Source"
    git clone --depth 1 $Source $dest
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }
}
else {
    $src = (Resolve-Path -Path $Source).Path
    if (-not (Test-Path (Join-Path $src 'plugin.json'))) {
        throw "No plugin.json in $src - point -Source at the plugin directory."
    }
    Step "Copying from $src"
    Copy-Item -Recurse -Path $src -Destination $dest
    foreach ($junk in '.git', 'scope.yml', 'scope.json', 'samples', 'analysis', 'evidence', 'poc') {
        $p = Join-Path $dest $junk
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
}

if (-not (Test-Path (Join-Path $dest 'plugin.json'))) {
    throw "plugin.json missing at $dest - Antigravity will not load this directory."
}
Ok 'plugin.json present'

Step 'Checking Node.js (required by the lifecycle hooks)'
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Warn 'node is not on PATH.'
    Warn 'Rules, agents and skills will load; the scope gate and evidence trail will NOT.'
    Warn 'Install Node.js LTS, then run: node scripts\selftest.mjs inside the plugin folder.'
}
else {
    $v = (& node --version).TrimStart('v')
    $major = [int] ($v.Split('.')[0])
    if ($major -lt 18) { Warn "node $v found, v18 or newer is required." } else { Ok "node $v" }
}

Step 'Verifying the hooks'
Push-Location $dest
try {
    if ($nodePath) { & node 'scripts\selftest.mjs' }
}
finally { Pop-Location }

Write-Host ''
Write-Host 'Next:' -ForegroundColor Cyan
Write-Host '  1. Restart Antigravity'
Write-Host '  2. Customizations > Installed > Security Engagement > enable'
Write-Host '  3. Add a scope manifest for the engagement, either'
Write-Host "       <repo>\scope.yml"
Write-Host '     or'
Write-Host "       $env:USERPROFILE\.config\sec-engagement\scopes\<repo>.yml"
