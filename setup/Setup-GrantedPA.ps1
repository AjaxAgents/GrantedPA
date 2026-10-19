<#
.SYNOPSIS
  GrantedPA one-script SharePoint set-up: everything that can be done before the flows and the app.

.DESCRIPTION
  Run it once, as an IT admin, on a PC with PowerShell 7.4 or later (Windows, Mac or Linux):

      git clone https://github.com/AjaxAgents/GrantedPA
      cd GrantedPA
      pwsh ./setup/Setup-GrantedPA.ps1

  (No git? On GitHub choose Code → Download ZIP, unzip it, and run the same command in that folder.)

  It asks for your SharePoint name, the service account, a support email and the admin set-up
  code, then:
    1. installs PnP PowerShell if it's missing, and registers a sign-in app for it (one consent prompt)
    2. creates the "Granted" communication site, with the service account as an owner and guest
       sharing on (only this site)
    3. creates the 18 lists and 2 libraries, with columns, indexes, colours and owners-only permissions
       (sharepoint/provision.ps1), plus reason codes, app settings and, if you like, a sample project
    4. uploads QR-Runner.xlsx (the workbook the Office Scripts run in)
    5. stores the admin set-up code as a one-way hash in SecureSettings (the code itself is never saved)
    6. creates the Welcome page that new guests are sent to
    7. creates the "Granted Users" group (the app is shared with it), with the service account as owner
  and writes GrantedPA-setup-summary.txt with what it made and what's left.

  Safe to run again: anything that exists is left alone (give a new admin code to replace it).

  Roles needed: SharePoint Administrator (site, sharing), and Application Administrator or Global
  Administrator for the one-time sign-in app consent. The service account must already exist.

.PARAMETER DeviceLogin
  Sign in with a code on another device (for Azure Cloud Shell or a PC without a browser).

.EXAMPLE
  pwsh ./setup/Setup-GrantedPA.ps1
.EXAMPLE
  pwsh ./setup/Setup-GrantedPA.ps1 -Tenant ajaxbuilding -ServiceAccount svc-granted@ajaxbuilding.com -SupportEmail granted@ajaxbuilding.com -SampleProject
#>
[CmdletBinding()]
param(
  [string] $Tenant = '',            # the part before .sharepoint.com, e.g. ajaxbuilding
  [string] $SitePath = 'Granted',   # https://<tenant>.sharepoint.com/sites/<SitePath>
  [string] $ServiceAccount = '',
  [string] $SupportEmail = '',
  [string] $TimeZone = 'Central Standard Time',
  [string] $ClientId = '',          # an existing PnP sign-in app; leave empty to make one
  [switch] $SampleProject,
  [switch] $DeviceLogin,
  [switch] $SkipGroup
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'AdminCodeHash.ps1')
$done = [System.Collections.Generic.List[string]]::new()
$todo = [System.Collections.Generic.List[string]]::new()

function Step($n, $text) { Write-Host "`n[$n/7] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ✓ $text" -ForegroundColor Green; $script:done.Add($text) }
function Todo($text) { Write-Host "  → $text" -ForegroundColor Yellow; $script:todo.Add($text) }
function Ask($prompt, $default) {
  $a = Read-Host ("  $prompt" + ($(if ($default) { " [$default]" } else { '' })))
  if ([string]::IsNullOrWhiteSpace($a)) { return $default } else { return $a.Trim() }
}

Write-Host @'

  ┌──────────────────────────────────────────────────────────┐
  │  GRANTED (Power Apps)  ·  SharePoint set-up              │
  │  No approved delivery, no gate access.                   │
  └──────────────────────────────────────────────────────────┘
'@

if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw "PowerShell 7.4 or later is needed (this is $($PSVersionTable.PSVersion)). Install it from https://aka.ms/powershell, then run: pwsh ./setup/Setup-GrantedPA.ps1" }

# ---------------------------------------------------------------- questions
# Answers from an earlier run (nothing secret: names, emails and the sign-in app's ID).
$memo = Join-Path $repo '.granted-setup.json'
if (Test-Path $memo) {
  $m = Get-Content $memo -Raw | ConvertFrom-Json
  if (-not $Tenant) { $Tenant = $m.Tenant }; if (-not $ClientId) { $ClientId = $m.ClientId }
  if (-not $ServiceAccount) { $ServiceAccount = $m.ServiceAccount }; if (-not $SupportEmail) { $SupportEmail = $m.SupportEmail }
  Write-Host "`nUsing the answers from the last run ($memo). Delete that file to start over."
}
Write-Host "`nA few questions (press Enter to accept the suggestion in brackets)"
if (-not $Tenant) { $Tenant = Ask 'SharePoint name (the part before .sharepoint.com)' '' }
$Tenant = ($Tenant -replace '^https?://', '' -replace '(-admin)?\.sharepoint\.com.*$', '').Trim()
if ($Tenant -notmatch '^[A-Za-z0-9-]+$') { throw "That doesn't look like a SharePoint name: $Tenant" }
if (-not $ServiceAccount) { $ServiceAccount = Ask 'Service account the flows run as' "svc-granted@$Tenant.com" }
if (-not $SupportEmail) { $SupportEmail = Ask 'Support email shown to users' "granted@$Tenant.com" }
if (-not $PSBoundParameters.ContainsKey('SampleProject')) { $SampleProject = (Ask 'Add a sample project to test with? (y/n)' 'y') -match '^[Yy]' }
Write-Host "`n  Admin set-up code: Ajax staff type this as a project code to become admins who can"
Write-Host "  create projects. Only a one-way hash is stored. Leave empty on a re-run to keep the current one."
$c1 = Read-Host '  Admin set-up code' -AsSecureString
$codeHash = ''
if ($c1.Length -gt 0) {
  $c2 = Read-Host '  Type it again' -AsSecureString
  $p1 = [System.Net.NetworkCredential]::new('', $c1).Password; $p2 = [System.Net.NetworkCredential]::new('', $c2).Password
  if ($p1 -ne $p2) { throw 'The two codes did not match. Run the script again.' }
  if ((ConvertTo-GrantedAdminCode $p1).Length -lt 8) { Write-Host '  (A longer code is harder to guess from its hash. 12+ characters is better.)' -ForegroundColor Yellow }
  Write-Host '  Hashing the code (a few seconds)...'
  $codeHash = New-GrantedAdminCodeHash -Code $p1
  $p1 = $null; $p2 = $null
}
$tenantDomain = "$Tenant.onmicrosoft.com"
$adminUrl = "https://$Tenant-admin.sharepoint.com"
$siteUrl = "https://$Tenant.sharepoint.com/sites/$SitePath"

function Connect-To($url) {
  if ($DeviceLogin) { Connect-PnPOnline -Url $url -DeviceLogin -ClientId $script:ClientId -Tenant $tenantDomain }
  else { Connect-PnPOnline -Url $url -Interactive -ClientId $script:ClientId }
}

# ---------------------------------------------------------------- 1. PnP PowerShell + sign-in app
Step 1 'PnP PowerShell and its sign-in app'
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host '  Installing PnP.PowerShell for your account (a minute)...'
  Install-Module PnP.PowerShell -Scope CurrentUser -Force -AllowClobber
}
Import-Module PnP.PowerShell
Ok "PnP PowerShell $((Get-Module PnP.PowerShell).Version)"
if (-not $ClientId) {
  Write-Host '  Registering the "Granted Setup (PnP)" sign-in app. Approve the consent prompt (admin).'
  $reg = @{ ApplicationName = 'Granted Setup (PnP)'; Tenant = $tenantDomain; SharePointDelegatePermissions = 'AllSites.FullControl'; GraphDelegatePermissions = @('Group.ReadWrite.All', 'User.Read.All') }
  if ($DeviceLogin) { $reg.DeviceLogin = $true } else { $reg.Interactive = $true }
  $r = Register-PnPEntraIDAppForInteractiveLogin @reg
  $ClientId = @($r.'AzureAppId/ClientId', $r.ClientId, $r.AzureAppId) | Where-Object { $_ } | Select-Object -First 1
  if (-not $ClientId) { throw 'The sign-in app was registered but its Client ID was not returned. Run again with -ClientId <id from Entra → App registrations → Granted Setup (PnP)>.' }
}
Ok "Sign-in app $ClientId"
[ordered]@{ Tenant = $Tenant; ClientId = $ClientId; ServiceAccount = $ServiceAccount; SupportEmail = $SupportEmail } | ConvertTo-Json | Set-Content -Path $memo -Encoding utf8

# ---------------------------------------------------------------- 2. the site
Step 2 "The Granted site ($siteUrl)"
Connect-To $adminUrl
$site = Get-PnPTenantSite -Identity $siteUrl -ErrorAction SilentlyContinue
if (-not $site) {
  Write-Host '  Creating the communication site (a minute)...'
  New-PnPSite -Type CommunicationSite -Title 'Granted' -Url $siteUrl -Description 'Granted delivery booking and gate control. The lists are used by the Granted app; please do not edit them by hand.' -Wait | Out-Null
  Ok 'Created the communication site'
} else { Ok 'Site already exists' }
try {
  Set-PnPTenantSite -Identity $siteUrl -SharingCapability ExternalUserSharingOnly
  Ok 'Guest sharing on for this site only (new and existing guests)'
} catch { Todo "Turn on guest sharing for $siteUrl (SharePoint admin center → Sites → Granted → Sharing → New and existing guests). The organisation-wide setting must allow it: $($_.Exception.Message)" }

Connect-To $siteUrl
$owners = Get-PnPGroup -AssociatedOwnerGroup
try { Add-PnPGroupMember -LoginName $ServiceAccount -Group $owners.Title -ErrorAction Stop; Ok "$ServiceAccount is a site owner" }
catch { if ($_.Exception.Message -match 'already') { Ok "$ServiceAccount is a site owner" } else { Todo "Add $ServiceAccount to the site's Owners group (it couldn't be added: $($_.Exception.Message))" } }

# ---------------------------------------------------------------- 3. lists, libraries, permissions, starter rows
Step 3 'Lists, libraries, permissions and starter data'
$prov = @{ SiteUrl = $siteUrl; ServiceAccount = $ServiceAccount; UseExistingConnection = $true }
if ($SampleProject) { $prov.SampleProject = $true }
& (Join-Path $repo 'sharepoint/provision.ps1') @prov
Ok '18 lists and 2 libraries with columns, indexes, status colours and owners-only permissions'

function Set-Setting($list, $key, $value) {
  $item = Get-PnPListItem -List $list -PageSize 500 | Where-Object { $_['Title'] -eq $key } | Select-Object -First 1
  if ($item) { Set-PnPListItem -List $list -Identity $item.Id -Values @{ Value = $value } | Out-Null }
  else { Add-PnPListItem -List $list -Values @{ Title = $key; Value = $value } | Out-Null }
}
Set-Setting 'AppSettings' 'SupportEmail' $SupportEmail
Set-Setting 'AppSettings' 'DefaultTimeZone' $TimeZone
Ok "App settings: support $SupportEmail, time zone $TimeZone"
Todo 'After the app and sign-up form exist, fill in AppSettings → AppLink and SignUpFormLink'

# ---------------------------------------------------------------- 4. QR runner workbook
Step 4 'QR-Runner.xlsx (where the Office Scripts run)'
Add-PnPFile -Path (Join-Path $repo 'officescripts/QR-Runner.xlsx') -Folder 'QRRunner' -Values @{} | Out-Null
Ok 'Uploaded to the QRRunner library'
Todo 'Signed in as the service account, open QR-Runner.xlsx in Excel for the web → Automate → New script: paste officescripts/GenerateGatePassQR.ts (save as GenerateGatePassQR) and officescripts/CheckAdminCode.ts (save as CheckAdminCode). 15 minutes.'

# ---------------------------------------------------------------- 5. admin set-up code
Step 5 'Admin set-up code'
$cur = Get-PnPListItem -List 'SecureSettings' -PageSize 50 | Where-Object { $_['Title'] -eq 'AdminCodeHash' } | Select-Object -First 1
if ($codeHash) {
  Set-Setting 'SecureSettings' 'AdminCodeHash' $codeHash
  $codeHash = $null
  Ok 'Stored as a one-way hash in SecureSettings (only the service account and site collection admins can read it)'
} elseif ($cur -and $cur['Value'] -like 'sha256i$*') { Ok 'Already set (kept)' }
else { Todo 'No admin code yet: run this script again and type one, or paste the output of node tools/admin-code-hash.mjs into SecureSettings → AdminCodeHash' }

# ---------------------------------------------------------------- 6. Welcome page
Step 6 'Welcome page for new guests'
if (-not (Get-PnPPage -Identity 'Welcome' -ErrorAction SilentlyContinue)) {
  Add-PnPPage -Name 'Welcome' -Title 'Welcome to Granted' -LayoutType Article -HeaderLayoutType NoImage | Out-Null
  $html = @"
<h2>Welcome to Granted</h2>
<p><strong>No approved delivery, no gate access.</strong> Granted is how deliveries are booked and checked in at Ajax Building Company jobsites.</p>
<h3>Get started</h3>
<ol>
<li>Install <strong>Power Apps</strong> from the App Store or Google Play (or use a browser).</li>
<li>Sign in with the email address you were invited with. If you have more than one organisation, switch to <strong>Ajax Building Company</strong>.</li>
<li>Open <strong>Granted</strong>. Your project and your access are already set up.</li>
</ol>
<p>Help: <a href="mailto:$SupportEmail">$SupportEmail</a></p>
"@
  Add-PnPPageTextPart -Page 'Welcome' -Text $html | Out-Null
  Set-PnPPage -Identity 'Welcome' -Publish | Out-Null
  Ok 'Welcome page published (SitePages/Welcome.aspx)'
} else { Ok 'Welcome page already exists' }
Todo 'Once the app is published, add its link to the Welcome page'

# ---------------------------------------------------------------- 7. Granted Users group
Step 7 'Granted Users group (the app is shared with it)'
if ($SkipGroup) { Todo 'Create a security-enabled Microsoft 365 group "Granted Users" with the service account as owner' }
else {
  try {
    $g = Invoke-PnPGraphMethod -Url "v1.0/groups?`$filter=displayName eq 'Granted Users'&`$select=id,displayName" -Method Get
    if ($g.value.Count -gt 0) { Ok 'Granted Users already exists' }
    else {
      $body = @{
        displayName = 'Granted Users'; mailNickname = 'granted-users'; description = 'People who can open the Granted app. Managed by the Granted flows.'
        groupTypes = @('Unified'); mailEnabled = $true; securityEnabled = $true; visibility = 'Private'
        'owners@odata.bind' = @("https://graph.microsoft.com/v1.0/users/$ServiceAccount")
      }
      Invoke-PnPGraphMethod -Url 'v1.0/groups' -Method Post -Content $body | Out-Null
      Ok 'Created Granted Users (security-enabled Microsoft 365 group, private), owned by the service account'
    }
  } catch { Todo "Create a security-enabled Microsoft 365 group ""Granted Users"", private, with $ServiceAccount as an owner (couldn't create it here: $($_.Exception.Message))" }
}

# ---------------------------------------------------------------- the rest
$todo.Add('IT checklist in docs/04-security-and-compliance.md §6: Power Platform environment "Granted", DLP policy, service account licence and mailbox, guest one-time passcode, Conditional Access')
$todo.Add('Build the flows (powerautomate/) and the app (powerapps/) in a solution, or import the ready-made solution if one is in solution/ (see START-HERE.md)')
$summary = @"
GrantedPA set-up summary ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))
Site:            $siteUrl
Service account: $ServiceAccount
Support email:   $SupportEmail
PnP sign-in app: $ClientId

Done
$(($done | ForEach-Object { "  [x] $_" }) -join "`n")

Still to do
$(($todo | ForEach-Object { "  [ ] $_" }) -join "`n")
"@
$out = Join-Path (Get-Location) 'GrantedPA-setup-summary.txt'
Set-Content -Path $out -Value $summary -Encoding utf8
Write-Host "`n$summary"
Write-Host "`nSaved to $out" -ForegroundColor Cyan
