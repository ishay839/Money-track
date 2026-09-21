# One-line installer for Windows.
#
#   irm https://raw.githubusercontent.com/ishay839/Money-track/main/install.ps1 | iex
#
# Installs what is missing (Node.js, Git) via winget, clones the repo, and runs
# the normal npm setup. Everything here is what the README tells you to do
# by hand; this just saves the typing.
#
# ASCII only, and saved WITHOUT a BOM, on purpose. `irm | iex` hands the script
# to PowerShell as a string: a UTF-8 BOM survives as a literal U+FEFF before the
# first '#', which PowerShell then reads as a command named "?#" and the whole
# thing dies on line 1. And a console running a non-UTF-8 codepage renders any
# non-ASCII text as mojibake. Keeping this file to plain ASCII sidesteps both.

$ErrorActionPreference = 'Stop'

# Windows ships with ExecutionPolicy=Restricted, which blocks npm.ps1 and makes
# a bare `npm` fail with "running scripts is disabled on this system". This
# only relaxes the policy for THIS process - nothing is changed permanently on
# the machine - and npm is invoked through npm.cmd below, which is a batch file
# and not subject to the policy at all.
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch { }

$Repo    = 'https://github.com/ishay839/Money-track.git'
$Dir     = Join-Path $env:USERPROFILE 'money-track'
$MinNode = 22

function Say  { param($m) Write-Host $m }
function Step { param($m) Write-Host '' ; Write-Host ('==> ' + $m) -ForegroundColor Cyan }
function Warn { param($m) Write-Host ('    ' + $m) -ForegroundColor Yellow }
function Die  { param($m) Write-Host '' ; Write-Host ('Setup stopped: ' + $m) -ForegroundColor Red ; exit 1 }

function Have { param($c) return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# npm.cmd, not npm: the .ps1 shim is blocked under a Restricted policy.
function Npm {
    param([string[]]$Arguments)
    $cmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
    if ($cmd) { & $cmd.Source @Arguments }
    else { & npm @Arguments }
}

# winget writes new tools into the machine PATH, which this already-running
# shell cannot see. Re-read it rather than telling the user to reopen.
function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $machine + ';' + $user
}

function Install-Package {
    param($Id, $Label)
    if (-not (Have 'winget')) {
        Die ($Label + ' is missing and winget is not available. Install it manually, then run this again.')
    }
    Step ('Installing ' + $Label + ' (a few minutes)')
    winget install --id $Id --accept-package-agreements --accept-source-agreements --silent -e | Out-Null
    Update-PathFromRegistry
}

Say ''
Say '  Spent - local personal finance tracker'
Say '  --------------------------------------'

# --- Node.js ---------------------------------------------------------------
$nodeOk = $false
if (Have 'node') {
    $ver = (node --version) -replace '^v', ''
    $major = [int](($ver -split '\.')[0])
    if ($major -ge $MinNode) {
        $nodeOk = $true
        Say ''
        Say ('    Node.js ' + $ver + ' - ok')
    }
    else {
        Warn ('Node.js ' + $ver + ' is too old, need ' + $MinNode + ' or newer')
    }
}
if (-not $nodeOk) {
    Install-Package 'OpenJS.NodeJS.LTS' 'Node.js'
    if (-not (Have 'node')) {
        Die 'Node.js was installed but is not on PATH yet. Close this window, open a new PowerShell, and run the command again.'
    }
    Say ('    Node.js ' + (node --version) + ' installed')
}

# --- Git -------------------------------------------------------------------
if (-not (Have 'git')) {
    Install-Package 'Git.Git' 'Git'
    if (-not (Have 'git')) {
        Die 'Git was installed but is not on PATH yet. Close this window, open a new PowerShell, and run the command again.'
    }
}
Say ('    Git ' + ((git --version) -replace 'git version ', '') + ' - ok')

# --- Get the code ----------------------------------------------------------
$gitDir = Join-Path $Dir '.git'
if (Test-Path $gitDir) {
    Step ('Already installed at ' + $Dir + ' - checking for updates')
    Push-Location $Dir
    $dirty = git status --porcelain
    if ($dirty) {
        Warn 'You have local changes - keeping them, skipping the update'
    }
    else {
        git pull --ff-only 2>&1 | Out-Null
    }
}
else {
    if (Test-Path $Dir) {
        Die ($Dir + ' exists but is not a copy of the project. Rename it and run this again.')
    }
    Step ('Downloading the code to ' + $Dir)
    git clone --depth 1 $Repo $Dir 2>&1 | Out-Null
    Push-Location $Dir
}

# --- Dependencies + setup --------------------------------------------------
Step 'Installing dependencies (a few minutes)'
Npm @('install','--no-audit','--no-fund')
if ($LASTEXITCODE -ne 0) { Pop-Location ; Die 'Dependency install failed.' }

Step 'Running setup'
Say '    You will be asked for Administrator once - only to add the spent.local address.'
Npm @('run','setup')
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) { Die 'Setup failed. Copy the error above and send it over.' }

Say ''
Write-Host '  Done. Open:  http://spent.local:41234' -ForegroundColor Green
Write-Host '  (or http://127.0.0.1:41234 if that address does not resolve)'
Say ('  Code is at: ' + $Dir)
Say ''
