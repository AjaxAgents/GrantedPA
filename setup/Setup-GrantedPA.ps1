<#
.SYNOPSIS
  GrantedPA set-up, part 1 of 2: builds the SharePoint side and a ready-to-import solution file.

.DESCRIPTION
  Run it once, as an IT admin, on a PC with PowerShell 7.4 or later (Windows, Mac or Linux),
  from the repository folder:

      pwsh ./setup/Setup-GrantedPA.ps1

  It asks six questions, then:
    1. installs PnP PowerShell if it's missing and registers its sign-in app (one admin consent)
    2. creates the "Granted" SharePoint site (guest sharing on for this site only)
    3. creates the 18 lists and 2 libraries with owners-only permissions and starter data
    4. stores your settings (support email, company email domain, time zone)
    5. uploads the rules engine (GrantedEngine.osts) and the workbook it runs in (QR-Runner.xlsx)
    6. stores the admin set-up code as a one-way hash (the code itself is never saved)
    7. publishes the Welcome page that new guests are sent to
    8. creates the "Granted Users" group (the app is shared with it) with you and the Granted account in it
    9. writes GrantedPA-ready.zip: the app and its 17 flows, already pointed at this site
  Part 2 (import the zip in Power Apps) is in START-HERE.md and the set-up guide PDF.

  Safe to run again: anything that exists is left alone (give a new admin code to replace it).

  Roles needed: SharePoint Administrator, and Application Administrator or Global Administrator
  for the one-time sign-in app consent. The Granted account must already exist with a mailbox.

.PARAMETER DeviceLogin
  Sign in with a code on another device (for a PC without a browser).
#>
[CmdletBinding()]
param(
  [string] $Tenant = '',            # the part before .sharepoint.com, e.g. contoso
  [string] $SitePath = 'Granted',
  [string] $ServiceAccount = '',    # the Granted account: owns the flows and sends the emails
  [string] $HomeDomain = '',        # your company's email domain, e.g. contoso.com
  [string] $SupportEmail = '',
  [string] $TimeZone = 'Central Standard Time',
  [string] $ClientId = '',
  [switch] $SampleProject,
  [switch] $DeviceLogin
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'AdminCodeHash.ps1')
. (Join-Path $PSScriptRoot 'SolutionFile.ps1')
$steps = 9
function Step($n, $text) { Write-Host "`n[$n/$steps] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ✓ $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow; $script:warnings.Add($text) }
function Ask($prompt, $default) {
  $a = Read-Host ("  $prompt" + ($(if ($default) { " [$default]" } else { '' })))
  if ([string]::IsNullOrWhiteSpace($a)) { return $default } else { return $a.Trim() }
}
$warnings = [System.Collections.Generic.List[string]]::new()

Write-Host @'

  ┌──────────────────────────────────────────────────────────┐
  │  GRANTED (Power Apps)  ·  set-up, part 1 of 2            │
  │  No approved delivery, no gate access.                   │
  └──────────────────────────────────────────────────────────┘
'@
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw "PowerShell 7.4 or later is needed (this is $($PSVersionTable.PSVersion)). Install it from https://aka.ms/powershell, then run: pwsh ./setup/Setup-GrantedPA.ps1" }
$solutionZip = Join-Path $repo 'solution/GrantedPA.zip'
if (-not (Test-Path $solutionZip)) { throw "solution/GrantedPA.zip is missing. Download the repository again (Code → Download ZIP)." }

# ---------------------------------------------------------------- questions
$memo = Join-Path $repo '.granted-setup.json'
if (Test-Path $memo) {
  $m = Get-Content $memo -Raw | ConvertFrom-Json
  foreach ($k in 'Tenant', 'ClientId', 'ServiceAccount', 'HomeDomain', 'SupportEmail') { if (-not (Get-Variable $k -ValueOnly) -and $m.$k) { Set-Variable $k $m.$k } }
  Write-Host "`nUsing the answers from the last run ($memo). Delete that file to start over."
}
Write-Host "`nSix questions (press Enter to accept the suggestion in brackets)"
if (-not $Tenant) { $Tenant = Ask '1. SharePoint name (the part before .sharepoint.com)' '' }
$Tenant = ($Tenant -replace '^https?://', '' -replace '(-admin)?\.sharepoint\.com.*$', '').Trim()
if ($Tenant -notmatch '^[A-Za-z0-9-]+$') { throw "That doesn't look like a SharePoint name: $Tenant" }
if (-not $ServiceAccount) { $ServiceAccount = Ask '2. The Granted account (sends the emails, owns the flows)' "granted@$Tenant.com" }
$ServiceAccount = $ServiceAccount.ToLowerInvariant()
if (-not $HomeDomain) { $HomeDomain = Ask '3. Your company email domain (staff with it can become admins)' ($ServiceAccount -split '@')[-1] }
$HomeDomain = $HomeDomain.TrimStart('@').ToLowerInvariant()
if (-not $SupportEmail) { $SupportEmail = Ask '4. Support email shown to users' $ServiceAccount }
if (-not $PSBoundParameters.ContainsKey('SampleProject')) { $SampleProject = (Ask '5. Add a sample project to try it with? (y/n)' 'n') -match '^[Yy]' }
Write-Host "`n  6. Admin set-up code: staff with an @$HomeDomain email type it as a project code to become"
Write-Host "     admins who can create projects. Only a one-way hash is stored. Empty on a re-run keeps the current one."
$c1 = Read-Host '     Admin set-up code' -AsSecureString
$codeHash = ''
if ($c1.Length -gt 0) {
  $c2 = Read-Host '     Type it again' -AsSecureString
  $p1 = [System.Net.NetworkCredential]::new('', $c1).Password; $p2 = [System.Net.NetworkCredential]::new('', $c2).Password
  if ($p1 -ne $p2) { throw 'The two codes did not match. Run the script again.' }
  Write-Host '     Hashing the code (a few seconds)...'
  $codeHash = New-GrantedAdminCodeHash -Code $p1
  $p1 = $null; $p2 = $null
}
$tenantDomain = "$Tenant.onmicrosoft.com"
$spHost = "$Tenant.sharepoint.com"
$adminUrl = "https://$Tenant-admin.sharepoint.com"
$siteUrl = "https://$spHost/sites/$SitePath"
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
  $reg = @{ ApplicationName = 'Granted Setup (PnP)'; Tenant = $tenantDomain; SharePointDelegatePermissions = 'AllSites.FullControl'; GraphDelegatePermissions = @('Group.ReadWrite.All', 'User.Read.All', 'Sites.Read.All') }
  if ($DeviceLogin) { $reg.DeviceLogin = $true } else { $reg.Interactive = $true }
  $r = Register-PnPEntraIDAppForInteractiveLogin @reg
  $ClientId = @($r.'AzureAppId/ClientId', $r.ClientId, $r.AzureAppId) | Where-Object { $_ } | Select-Object -First 1
  if (-not $ClientId) { throw 'The sign-in app was registered but its Client ID was not returned. Run again with -ClientId <id from Entra → App registrations → Granted Setup (PnP)>.' }
}
Ok "Sign-in app $ClientId"
[ordered]@{ Tenant = $Tenant; ClientId = $ClientId; ServiceAccount = $ServiceAccount; HomeDomain = $HomeDomain; SupportEmail = $SupportEmail } | ConvertTo-Json | Set-Content -Path $memo -Encoding utf8

# ---------------------------------------------------------------- 2. the site
Step 2 "The Granted site ($siteUrl)"
Connect-To $adminUrl
if (-not (Get-PnPTenantSite -Identity $siteUrl -ErrorAction SilentlyContinue)) {
  Write-Host '  Creating the communication site (a minute)...'
  New-PnPSite -Type CommunicationSite -Title 'Granted' -Url $siteUrl -Description 'Granted delivery booking and gate control. The lists belong to the Granted app; please do not edit them by hand.' -Wait | Out-Null
  Ok 'Created the site'
} else { Ok 'Site already exists' }
try { Set-PnPTenantSite -Identity $siteUrl -SharingCapability ExternalUserSharingOnly; Ok 'Guest sharing on for this site only' }
catch { Warn "Turn on guest sharing for the Granted site (SharePoint admin center → Sites → Granted → Sharing → New and existing guests): $($_.Exception.Message)" }
Connect-To $siteUrl
$owners = Get-PnPGroup -AssociatedOwnerGroup
try { Add-PnPGroupMember -LoginName $ServiceAccount -Group $owners.Title -ErrorAction Stop; Ok "$ServiceAccount is a site owner" }
catch { if ($_.Exception.Message -match 'already') { Ok "$ServiceAccount is a site owner" } else { throw "Couldn't make $ServiceAccount a site owner. Does the account exist? ($($_.Exception.Message))" } }

# ---------------------------------------------------------------- 3. lists
Step 3 'Lists, libraries and permissions'
$prov = @{ SiteUrl = $siteUrl; ServiceAccount = $ServiceAccount; UseExistingConnection = $true }
if ($SampleProject) { $prov.SampleProject = $true }
& (Join-Path $repo 'sharepoint/provision.ps1') @prov
Ok '18 lists and 2 libraries, owners only'

# ---------------------------------------------------------------- 4. settings
Step 4 'Settings'
function Set-Setting($list, $key, $value) {
  $item = Get-PnPListItem -List $list -PageSize 500 | Where-Object { $_['Title'] -eq $key } | Select-Object -First 1
  if ($item) { Set-PnPListItem -List $list -Identity $item.Id -Values @{ Value = $value } | Out-Null }
  else { Add-PnPListItem -List $list -Values @{ Title = $key; Value = $value } | Out-Null }
}
Set-Setting 'AppSettings' 'SupportEmail' $SupportEmail
Set-Setting 'AppSettings' 'AjaxDomain' $HomeDomain
Set-Setting 'AppSettings' 'ServiceAccount' $ServiceAccount
Set-Setting 'AppSettings' 'DefaultTimeZone' $TimeZone
Ok "Support $SupportEmail · company domain @$HomeDomain · $TimeZone"

# ---------------------------------------------------------------- 5. rules engine
Step 5 'Rules engine (Office Script) and its workbook'
Add-PnPFile -Path (Join-Path $repo 'officescripts/QR-Runner.xlsx') -Folder 'QRRunner' -Values @{} | Out-Null
Add-PnPFile -Path (Join-Path $repo 'officescripts/GrantedEngine.osts') -Folder 'QRRunner' -Values @{} | Out-Null
Ok 'QR-Runner.xlsx and GrantedEngine.osts are in the QRRunner library'

# ---------------------------------------------------------------- 6. admin set-up code
Step 6 'Admin set-up code'
$cur = Get-PnPListItem -List 'SecureSettings' -PageSize 50 | Where-Object { $_['Title'] -eq 'AdminCodeHash' } | Select-Object -First 1
if ($codeHash) { Set-Setting 'SecureSettings' 'AdminCodeHash' $codeHash; $codeHash = $null; Ok 'Stored as a one-way hash' }
elseif ($cur -and $cur['Value'] -like 'sha256i$*') { Ok 'Already set (kept)' }
else { Warn 'No admin set-up code yet. Run this script again and type one: nobody can create projects until then.' }

# ---------------------------------------------------------------- 7. Welcome page
Step 7 'Welcome page for new guests'
if (-not (Get-PnPPage -Identity 'Welcome' -ErrorAction SilentlyContinue)) {
  Add-PnPPage -Name 'Welcome' -Title 'Welcome to Granted' -LayoutType Article -HeaderLayoutType NoImage | Out-Null
  Add-PnPPageTextPart -Page 'Welcome' -Text @"
<h2>Welcome to Granted</h2>
<p><strong>No approved delivery, no gate access.</strong> Granted is how deliveries are booked and checked in on our jobsites.</p>
<ol>
<li>Install <strong>Power Apps</strong> from the App Store or Google Play, or open Power Apps in a browser.</li>
<li>Sign in with the email you were invited with. If you belong to several organisations, switch to the one that invited you.</li>
<li>Open <strong>Granted</strong> and set up your profile. Your project access is already waiting.</li>
</ol>
<p>Help: <a href="mailto:$SupportEmail">$SupportEmail</a></p>
"@ | Out-Null
  Set-PnPPage -Identity 'Welcome' -Publish | Out-Null
  Ok 'Published SitePages/Welcome.aspx'
} else { Ok 'Welcome page already exists' }

# ---------------------------------------------------------------- 8. Granted Users group
Step 8 'Granted Users group'
$groupId = ''
try {
  $g = Invoke-PnPGraphMethod -Url "v1.0/groups?`$filter=displayName eq 'Granted Users'&`$select=id" -Method Get
  if ($g.value.Count -gt 0) { $groupId = $g.value[0].id; Ok 'Granted Users already exists' }
  else {
    $new = Invoke-PnPGraphMethod -Url 'v1.0/groups' -Method Post -Content @{
      displayName = 'Granted Users'; mailNickname = 'granted-users'; description = 'People who can open the Granted app. Managed by the Granted flows.'
      groupTypes = @('Unified'); mailEnabled = $true; securityEnabled = $true; visibility = 'Private'
      'owners@odata.bind' = @("https://graph.microsoft.com/v1.0/users/$ServiceAccount")
    }
    $groupId = $new.id; Ok 'Created Granted Users, owned by the Granted account'
  }
  $me = Invoke-PnPGraphMethod -Url 'v1.0/me?$select=id,userPrincipalName' -Method Get
  foreach ($who in @($me.userPrincipalName, $ServiceAccount) | Select-Object -Unique) {
    try { Invoke-PnPGraphMethod -Url "v1.0/groups/$groupId/members/`$ref" -Method Post -Content @{ '@odata.id' = "https://graph.microsoft.com/v1.0/users/$who" } | Out-Null; Ok "Added $who" }
    catch { if ($_.Exception.Message -match 'already exist') { Ok "$who is already in it" } else { Warn "Add $who to Granted Users by hand: $($_.Exception.Message)" } }
  }
} catch { throw "Couldn't create the Granted Users group: $($_.Exception.Message)" }

# ---------------------------------------------------------------- 9. the ready-to-import solution
Step 9 'GrantedPA-ready.zip (the app and its flows, pointed at this site)'
$site = Invoke-PnPGraphMethod -Url "v1.0/sites/${spHost}:/sites/$SitePath" -Method Get
$drive = (Invoke-PnPGraphMethod -Url "v1.0/sites/$($site.id)/drives" -Method Get).value | Where-Object { $_.name -eq 'QRRunner' } | Select-Object -First 1
if (-not $drive) { throw 'The QRRunner library was not found through Microsoft Graph.' }
$workbook = Invoke-PnPGraphMethod -Url "v1.0/drives/$($drive.id)/root:/QR-Runner.xlsx" -Method Get
$script = Invoke-PnPGraphMethod -Url "v1.0/drives/$($drive.id)/root:/GrantedEngine.osts" -Method Get
$values = [ordered]@{
  gr_SiteUrl = $siteUrl; gr_ExcelDrive = $drive.id
  gr_ExcelWorkbook = $workbook.id; gr_EngineScript = $script.id; gr_UsersGroupId = $groupId
}
$ready = Join-Path $repo 'GrantedPA-ready.zip'
Set-GrantedSolutionValues -Source $solutionZip -Destination $ready -Values $values
Ok "Wrote $ready"

# ---------------------------------------------------------------- what's left
$next = @"

  ┌──────────────────────────────────────────────────────────┐
  │  Part 1 done. Part 2 (about 15 minutes):                 │
  └──────────────────────────────────────────────────────────┘

  A. Power Platform admin center (admin.powerplatform.microsoft.com) → Environments → + New
     Name: Granted · Type: Production · Add a Dataverse data store: Yes → Save.
     Then open it → Users → + Add user → $ServiceAccount → System Administrator.

  B. Sign in to make.powerapps.com as $ServiceAccount, pick the Granted environment →
     Solutions → Import solution → $ready → Next.
     On "Connections", make each of the 4 connections (+ New connection, sign in) → Import.

  C. Apps → Granted → Share → "Granted Users" → Share.

  D. Open Granted, set up your profile, then type the admin set-up code as a project code.
     Create your project and invite your team from Team & Invites.
"@
Write-Host $next
if ($warnings.Count) { Write-Host "`nFix these too:" -ForegroundColor Yellow; $warnings | ForEach-Object { Write-Host "  ! $_" -ForegroundColor Yellow } }
Set-Content -Path (Join-Path $repo 'GrantedPA-setup-summary.txt') -Value ("Site: $siteUrl`nGranted account: $ServiceAccount`nCompany domain: $HomeDomain`nSolution file: $ready`n$next`n" + (($warnings | ForEach-Object { "! $_" }) -join "`n")) -Encoding utf8
