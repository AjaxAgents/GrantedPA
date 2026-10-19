<#
.SYNOPSIS
  Creates every SharePoint list, column, index, permission and starter row for GrantedPA.

.DESCRIPTION
  Reads sharepoint/list-schema.json (the single definition of the data model) and builds it on an
  existing SharePoint site. Safe to run more than once: anything that already exists is left alone.

  Access model: people never open these lists. The Granted app calls flows, which run as the
  service account. So every list is limited to the site owners (the service account and the
  Granted Owners group, Ajax IT), and SecureSettings is limited to the service account alone.

  Run it as a SharePoint admin or site owner, against a TEST site first.

.PREREQUISITES
  1. PowerShell 7.4+ and PnP PowerShell 3.x:   Install-Module PnP.PowerShell -Scope CurrentUser
  2. An Entra ID app registration for PnP interactive sign-in (PnP no longer ships a shared one):
        Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP Granted" -Tenant <tenant>.onmicrosoft.com
     Use the Client ID it prints for -ClientId below. IT may prefer to do this step.
  3. An empty communication site, e.g. https://<tenant>.sharepoint.com/sites/Granted,
     with the service account (e.g. svc-granted@ajaxbuilding.com) as a site owner.
     Do NOT use a Team site: its Microsoft 365 group members would get access to the lists.

.NOTES
  Easiest: run setup/Setup-GrantedPA.ps1, which creates the site, signs in, runs this script and
  does the remaining SharePoint steps (QR runner, admin code, Welcome page, Granted Users).

.EXAMPLE
  ./provision.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/Granted -ClientId <client id> -ServiceAccount svc-granted@ajaxbuilding.com

.EXAMPLE
  ./provision.ps1 -SiteUrl ... -ClientId ... -ServiceAccount ... -SampleProject   # also adds a sample project to test with
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $SiteUrl,
  [string] $ClientId = '',
  [Parameter(Mandatory)] [string] $ServiceAccount,
  [string] $BreakGlassAdmin = '',
  [switch] $SkipPermissions,
  [switch] $SkipSeedData,
  [switch] $SampleProject,
  # Sign in with a code on another device (Azure Cloud Shell, or a PC without a browser).
  [switch] $DeviceLogin,
  # Used by setup/Setup-GrantedPA.ps1, which has already signed in to this site.
  [switch] $UseExistingConnection
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$schema = Get-Content (Join-Path $PSScriptRoot 'list-schema.json') -Raw | ConvertFrom-Json

if (-not $UseExistingConnection) {
  if (-not $ClientId) { throw 'Give -ClientId (the PnP app registration), or run setup/Setup-GrantedPA.ps1, which makes one.' }
  if ($DeviceLogin) { Connect-PnPOnline -Url $SiteUrl -DeviceLogin -ClientId $ClientId -Tenant (([Uri]$SiteUrl).Host -replace '\.sharepoint\.com$', '.onmicrosoft.com') }
  else { Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId }
}
Write-Host "Connected to $SiteUrl" -ForegroundColor Cyan

# ---------------------------------------------------------------- helpers
function Get-FieldXml($f) {
  $attrs = "Name=`"$($f.name)`" StaticName=`"$($f.name)`" DisplayName=`"$($f.display)`""
  if ($f.required) { $attrs += ' Required="TRUE"' }
  if ($f.indexed -or $f.unique) { $attrs += ' Indexed="TRUE"' }
  if ($f.unique) { $attrs += ' EnforceUniqueValues="TRUE"' }
  switch ($f.type) {
    'Text'     { return "<Field Type=`"Text`" $attrs MaxLength=`"255`" />" }
    'Note'     { return "<Field Type=`"Note`" $attrs NumLines=`"6`" RichText=`"FALSE`" AppendOnly=`"FALSE`" />" }
    'Number'   { $dec = if ($null -ne $f.decimals) { " Decimals=`"$($f.decimals)`"" } else { '' }; return "<Field Type=`"Number`" $attrs$dec />" }
    'DateOnly' { return "<Field Type=`"DateTime`" $attrs Format=`"DateOnly`" />" }
    'DateTime' { return "<Field Type=`"DateTime`" $attrs Format=`"DateTime`" />" }
    'Boolean'  { $def = if ($f.default) { $f.default } else { '0' }; return "<Field Type=`"Boolean`" $attrs><Default>$def</Default></Field>" }
    'Choice'   {
      $choices = ($f.choices | ForEach-Object { "<CHOICE>$([System.Security.SecurityElement]::Escape($_))</CHOICE>" }) -join ''
      $def = if ($f.default) { "<Default>$($f.default)</Default>" } else { '' }
      return "<Field Type=`"Choice`" $attrs Format=`"Dropdown`" FillInChoice=`"FALSE`">$def<CHOICES>$choices</CHOICES></Field>"
    }
    default    { throw "Unknown field type $($f.type) on $($f.name)" }
  }
}

function Ensure-List($def, [string] $template) {
  $list = Get-PnPList -Identity $def.title -ErrorAction SilentlyContinue
  if (-not $list) {
    $list = New-PnPList -Title $def.title -Template $template -EnableVersioning -OnQuickLaunch
    Write-Host "Created $template $($def.title)" -ForegroundColor Green
  } else { Write-Host "Exists  $($def.title)" }
  if ($def.description) { Set-PnPList -Identity $def.title -Description $def.description | Out-Null }
  return $list
}

# ---------------------------------------------------------------- lists and columns
foreach ($l in $schema.lists) {
  Ensure-List $l 'GenericList' | Out-Null
  if ($l.titleDisplay) { Set-PnPField -List $l.title -Identity 'Title' -Values @{ Title = $l.titleDisplay } | Out-Null }
  if ($l.titleUnique)  { Set-PnPField -List $l.title -Identity 'Title' -Values @{ Indexed = $true; EnforceUniqueValues = $true } | Out-Null }
  Set-PnPList -Identity $l.title -EnableAttachments ([bool]$l.attachments) | Out-Null

  $existing = (Get-PnPField -List $l.title).InternalName
  foreach ($f in $l.fields) {
    if ($existing -contains $f.name) { continue }
    Add-PnPFieldFromXml -List $l.title -FieldXml (Get-FieldXml $f) | Out-Null
    Write-Host "  + $($f.name) ($($f.type))"
  }

  # Default view shows every column
  $viewFields = @('Title') + ($l.fields | ForEach-Object { $_.name })
  $view = Get-PnPView -List $l.title | Where-Object { $_.DefaultView } | Select-Object -First 1
  if ($view) { Set-PnPView -List $l.title -Identity $view.Id -Fields $viewFields | Out-Null }

}

foreach ($lib in $schema.libraries) { Ensure-List $lib 'DocumentLibrary' | Out-Null }

# ---------------------------------------------------------------- status colours
$fmt = Join-Path $PSScriptRoot 'formatting'
Set-PnPField -List 'DeliveryRequests' -Identity 'Status' -Values @{ CustomFormatter = (Get-Content (Join-Path $fmt 'request-status.json') -Raw) } | Out-Null
Set-PnPField -List 'GatePasses'       -Identity 'Status' -Values @{ CustomFormatter = (Get-Content (Join-Path $fmt 'pass-status.json') -Raw) } | Out-Null
Set-PnPField -List 'GateLog'          -Identity 'Result' -Values @{ CustomFormatter = (Get-Content (Join-Path $fmt 'gate-result.json') -Raw) } | Out-Null

# ---------------------------------------------------------------- permissions
if (-not $SkipPermissions) {
  $owners = Get-PnPGroup -AssociatedOwnerGroup
  # Nobody but the owners: remove the default Members and Visitors groups from every list.
  $members = Get-PnPGroup -AssociatedMemberGroup; $visitors = Get-PnPGroup -AssociatedVisitorGroup
  foreach ($l in @($schema.lists) + @($schema.libraries)) {
    Set-PnPList -Identity $l.title -BreakRoleInheritance -ClearSubscopes | Out-Null
    foreach ($g in @($members, $visitors)) { if ($g) { Set-PnPListPermission -Identity $l.title -Group $g.Title -RemoveRole 'Edit' -ErrorAction SilentlyContinue | Out-Null; Set-PnPListPermission -Identity $l.title -Group $g.Title -RemoveRole 'Read' -ErrorAction SilentlyContinue | Out-Null } }
    if ($l.restricted) {
      # SecureSettings: only the service account (and an optional named break-glass admin).
      Set-PnPListPermission -Identity $l.title -Group $owners.Title -RemoveRole 'Full Control' | Out-Null
      Set-PnPListPermission -Identity $l.title -User $ServiceAccount -AddRole 'Full Control' | Out-Null
      if ($BreakGlassAdmin) { Set-PnPListPermission -Identity $l.title -User $BreakGlassAdmin -AddRole 'Read' | Out-Null }
      Write-Host "Restricted $($l.title) to $ServiceAccount" -ForegroundColor Yellow
    } else {
      Set-PnPListPermission -Identity $l.title -Group $owners.Title -AddRole 'Full Control' | Out-Null
    }
  }
  Write-Host "Lists are limited to site owners. Add the service account and Ajax IT to the site's Owners group only." -ForegroundColor Yellow
}

# ---------------------------------------------------------------- starter rows
if (-not $SkipSeedData) {
  $settings = Get-Content (Join-Path $root 'config/settings.json') -Raw
  $app = [ordered]@{
    ServiceAccount = $ServiceAccount
    SupportEmail = '<support@ajaxbuilding.com>'
    AppLink = '<link to the Granted app in Power Apps, or the wrapped app>'
    SignUpFormLink = '<link to the Granted sign-up Microsoft Form>'
    AjaxDomain = 'ajaxbuilding.com'
    DefaultTimeZone = 'Central Standard Time'
    DefaultSettingsJson = ($settings -replace '\s+', ' ')
    InviteDays = '7'
  }
  $have = (Get-PnPListItem -List 'AppSettings' -PageSize 500).FieldValues.Title
  foreach ($k in $app.Keys) { if ($have -notcontains $k) { Add-PnPListItem -List 'AppSettings' -Values @{ Title = $k; Value = [string]$app[$k] } | Out-Null } }
  if (-not (Get-PnPListItem -List 'SecureSettings' -PageSize 50 | Where-Object { $_['Title'] -eq 'AdminCodeHash' })) {
    Add-PnPListItem -List 'SecureSettings' -Values @{ Title = 'AdminCodeHash'; Value = 'not set'; Description = 'Paste the output of: node tools/admin-code-hash.mjs. Never the code itself.' } | Out-Null
  }
  $codes = Get-Content (Join-Path $root 'config/reason-codes.json') -Raw | ConvertFrom-Json
  $haveCodes = (Get-PnPListItem -List 'ReasonCodes' -PageSize 500).FieldValues.Title
  foreach ($c in $codes) {
    if ($haveCodes -contains $c.code) { continue }
    Add-PnPListItem -List 'ReasonCodes' -Values @{ Title = $c.code; Key = $c.key; Outcome = $c.outcome; Message = $c.title; Remedy = $c.remedy } | Out-Null
  }
  Write-Host "App settings, reason codes and the AdminCodeHash placeholder loaded. Fill in the <placeholders> in AppSettings." -ForegroundColor Yellow
}

# ---------------------------------------------------------------- optional sample project (for testing)
if ($SampleProject) {
  $projId = 'p-sample1'
  if (-not (Get-PnPListItem -List 'Projects' -Query "<View><Query><Where><Eq><FieldRef Name='ProjectId'/><Value Type='Text'>$projId</Value></Eq></Where></Query></View>")) {
    $settings = (Get-Content (Join-Path $root 'config/settings.json') -Raw | ConvertFrom-Json); $settings.passPrefix = 'SMPL'
    Add-PnPListItem -List 'Projects' -Values @{ Title = 'Sample project'; ProjectId = $projId; ProjectCode = 'SMPL-7HKQ'; PassPrefix = 'SMPL'; Location = 'Test'; TimeZone = 'Central Standard Time'; SettingsJson = ($settings | ConvertTo-Json -Compress); Deleted = $false; CreatedByEmail = $ServiceAccount } | Out-Null
    foreach ($row in Import-Csv (Join-Path $root 'config/sample-data/gates.csv')) {
      Add-PnPListItem -List 'Gates' -Values @{ Title = $row.Name; Key = "$projId|$($row.GateId)"; ProjectId = $projId; GateId = $row.GateId; CapacityPerSlot = [int]$row.CapacityPerSlot; Active = $true; SortOrder = [int]$row.SortOrder } | Out-Null
    }
    foreach ($row in Import-Csv (Join-Path $root 'config/sample-data/staging-zones.csv')) {
      Add-PnPListItem -List 'StagingZones' -Values @{ Title = $row.Name; Key = "$projId|$($row.ZoneId)"; ProjectId = $projId; ZoneId = $row.ZoneId; CapacityPallets = [int]$row.CapacityPallets; Active = $true } | Out-Null
    }
    Write-Host "Sample project added (code SMPL-7HKQ). Add yourself as its Admin in ProjectMembers to test: Title '$projId|<your email>', Role Admin, Status Active." -ForegroundColor Yellow
  }
}

Write-Host "Done." -ForegroundColor Cyan
