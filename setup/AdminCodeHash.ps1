# Makes the SecureSettings > AdminCodeHash value from the admin set-up code, in PowerShell.
# Same format as tools/admin-code-hash.mjs, checked by officescripts/CheckAdminCode.ts:
#   sha256i$<iterations>$<salt>$<hex>, where hex = sha256("granted-admin-v1:" + salt + ":" + CODE),
#   then sha256 of the hex text, repeated until there are <iterations> rounds in total.
# Dot-source it:  . ./setup/AdminCodeHash.ps1;  New-GrantedAdminCodeHash -Code (Read-Host -AsSecureString)

function ConvertTo-GrantedAdminCode([string] $Code) {
  return ($Code.ToUpperInvariant() -replace '[^A-Z0-9-]', '')
}

function New-GrantedAdminCodeHash {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [object] $Code,     # a string or a SecureString
    [int] $Iterations = 100000,
    [string] $Salt = ''                         # leave empty for a random salt (tests give one)
  )
  if ($Code -is [System.Security.SecureString]) { $Code = [System.Net.NetworkCredential]::new('', $Code).Password }
  $norm = ConvertTo-GrantedAdminCode ([string] $Code)
  if (-not $norm) { throw 'The admin code needs letters or numbers.' }
  if (-not $Salt) {
    $bytes = [byte[]]::new(12)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $Salt = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $utf8 = [System.Text.Encoding]::UTF8
  try {
    $h = [Convert]::ToHexString($sha.ComputeHash($utf8.GetBytes("granted-admin-v1:${Salt}:${norm}"))).ToLowerInvariant()
    for ($i = 1; $i -lt $Iterations; $i++) { $h = [Convert]::ToHexString($sha.ComputeHash($utf8.GetBytes($h))).ToLowerInvariant() }
  } finally { $sha.Dispose() }
  return "sha256i`$$Iterations`$$Salt`$$h"
}
