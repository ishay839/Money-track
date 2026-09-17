# One-line installer for Windows.
#
#   irm https://raw.githubusercontent.com/ishay839/money-track/main/install.ps1 | iex
#
# Installs what is missing (Node.js, Git) via winget, clones the repo, and runs
# the normal `npm run setup`. Everything here is what the README tells you to do
# by hand; this just saves the typing.

$ErrorActionPreference = 'Stop'

$Repo    = 'https://github.com/ishay839/money-track.git'
$Dir     = Join-Path $env:USERPROFILE 'money-track'
$MinNode = 22

function Say  { param($m) Write-Host $m }
function Step { param($m) Write-Host '' ; Write-Host ('==> ' + $m) -ForegroundColor Cyan }
function Warn { param($m) Write-Host ('    ' + $m) -ForegroundColor Yellow }
function Die  { param($m) Write-Host '' ; Write-Host ('ההתקנה נעצרה: ' + $m) -ForegroundColor Red ; exit 1 }

function Have { param($c) return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

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
        Die ($Label + ' חסר ו-winget לא זמין במחשב הזה. התקן ידנית והרץ שוב.')
    }
    Step ('מתקין ' + $Label)
    winget install --id $Id --accept-package-agreements --accept-source-agreements --silent -e | Out-Null
    Update-PathFromRegistry
}

Say ''
Say '  Spent - מעקב כלכלי מקומי'
Say '  --------------------------'

# --- Node.js ---------------------------------------------------------------
$nodeOk = $false
if (Have 'node') {
    $ver = (node --version) -replace '^v', ''
    $major = [int](($ver -split '\.')[0])
    if ($major -ge $MinNode) {
        $nodeOk = $true
        Say ''
        Say ('    Node.js ' + $ver + ' - תקין')
    }
    else {
        Warn ('Node.js ' + $ver + ' ישן מדי, צריך ' + $MinNode + ' ומעלה')
    }
}
if (-not $nodeOk) {
    Install-Package 'OpenJS.NodeJS.LTS' 'Node.js'
    if (-not (Have 'node')) {
        Die 'Node.js הותקן אך לא נמצא. סגור את החלון, פתח PowerShell חדש והרץ שוב.'
    }
    Say ('    Node.js ' + (node --version) + ' הותקן')
}

# --- Git -------------------------------------------------------------------
if (-not (Have 'git')) {
    Install-Package 'Git.Git' 'Git'
    if (-not (Have 'git')) {
        Die 'Git הותקן אך לא נמצא. סגור את החלון, פתח PowerShell חדש והרץ שוב.'
    }
}
Say ('    Git ' + ((git --version) -replace 'git version ', '') + ' - תקין')

# --- Get the code ----------------------------------------------------------
$gitDir = Join-Path $Dir '.git'
if (Test-Path $gitDir) {
    Step ('כבר מותקן ב-' + $Dir + ' - בודק עדכונים')
    Push-Location $Dir
    $dirty = git status --porcelain
    if ($dirty) {
        Warn 'יש שינויים מקומיים - משאיר אותם, מדלג על העדכון'
    }
    else {
        git pull --ff-only 2>&1 | Out-Null
    }
}
else {
    if (Test-Path $Dir) {
        Die ('התיקייה ' + $Dir + ' קיימת אך אינה עותק של הפרויקט. שנה לה שם והרץ שוב.')
    }
    Step ('מוריד את הקוד אל ' + $Dir)
    git clone --depth 1 $Repo $Dir 2>&1 | Out-Null
    Push-Location $Dir
}

# --- Dependencies + setup --------------------------------------------------
Step 'מתקין ספריות - כמה דקות'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location ; Die 'התקנת הספריות נכשלה.' }

Step 'מריץ את ההתקנה'
Say '    תתבקש פעם אחת אישור מנהל - זה בשביל הכתובת spent.local בלבד.'
npm run setup
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) { Die 'ההתקנה נכשלה. העתק את השגיאה שמעל ושלח אותה.' }

Say ''
Write-Host '  מוכן. פתח בדפדפן:  http://spent.local:41234' -ForegroundColor Green
Say ('  הקוד נמצא ב: ' + $Dir)
Say ''
