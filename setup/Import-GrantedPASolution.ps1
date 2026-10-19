<#
.SYNOPSIS
  Imports the ready-made GrantedPA solution (the app and all the flows) into a Power Platform
  environment, once someone has built it and saved the export in solution/.

.DESCRIPTION
  Until solution/GrantedPA_managed.zip exists, the flows and the app are built by hand from
  powerautomate/ and powerapps/ (docs/06-build-guide.md). After one build, export it
  (solution/README.md) and every later installation is this script: about 30 minutes.

  Needs the Power Platform CLI (pac):  https://aka.ms/PowerPlatformCLI
  Run as the service account (or as an environment admin, then share connections with it).

.EXAMPLE
  pwsh ./setup/Import-GrantedPASolution.ps1 -EnvironmentUrl https://granted.crm.dynamics.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $EnvironmentUrl,
  [string] $SolutionZip = '',
  [string] $SettingsFile = ''
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $SolutionZip) { $SolutionZip = Join-Path $repo 'solution/GrantedPA_managed.zip' }
if (-not $SettingsFile) { $SettingsFile = Join-Path $repo 'solution/deployment-settings.json' }

if (-not (Test-Path $SolutionZip)) {
  throw "There's no solution export yet ($SolutionZip). Build the flows and the app by hand once (docs/06-build-guide.md), then export it as described in solution/README.md."
}
if (-not (Get-Command pac -ErrorAction SilentlyContinue)) { throw 'The Power Platform CLI (pac) is needed: https://aka.ms/PowerPlatformCLI' }

Write-Host "Signing in to $EnvironmentUrl" -ForegroundColor Cyan
pac auth create --environment $EnvironmentUrl
if ($LASTEXITCODE) { throw 'Sign-in failed.' }

if (-not (Test-Path $SettingsFile)) {
  pac solution create-settings --solution-zip $SolutionZip --settings-file $SettingsFile
  Write-Host "`nCreated $SettingsFile." -ForegroundColor Yellow
  Write-Host 'Fill in the connection IDs (make.powerapps.com → Connections, as the service account) and the'
  Write-Host 'environment variables (the Granted site URL and the service account), then run this script again.'
  return
}

Write-Host 'Importing the solution (10–20 minutes)...' -ForegroundColor Cyan
pac solution import --path $SolutionZip --settings-file $SettingsFile --activate-plugins --publish-changes --async --max-async-wait-time 60
if ($LASTEXITCODE) { throw 'The import failed (see above).' }
Write-Host @'

Imported. Last steps (15 minutes):
  1. make.powerapps.com → Solutions → Granted → Cloud flows: check every flow is On.
  2. Apps → Granted → Share → the "Granted Users" group (User permission).
  3. Copy the app's web link into SharePoint → AppSettings → AppLink, and onto the Welcome page.
  4. Run the scenario test in docs/07-test-plan.md.
'@ -ForegroundColor Green
