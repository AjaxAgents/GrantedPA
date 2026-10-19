# Writes a copy of the GrantedPA solution with its environment variables filled in, so the
# import wizard has nothing to ask except the connections.
#   . ./setup/SolutionFile.ps1; Set-GrantedSolutionValues -Source solution/GrantedPA.zip -Destination ready.zip -Values @{ gr_SiteUrl = '...' }

function Set-GrantedSolutionValues {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $Source,
    [Parameter(Mandatory)] [string] $Destination,
    [Parameter(Mandatory)] [System.Collections.IDictionary] $Values
  )
  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
  $zip = [System.IO.Compression.ZipFile]::Open((Resolve-Path -LiteralPath $Destination), 'Update')
  try {
    foreach ($name in $Values.Keys) {
      $path = "environmentvariabledefinitions/$name/environmentvariabledefinition.xml"
      $entry = $zip.GetEntry($path)
      if (-not $entry) { throw "The solution has no environment variable $name." }
      $reader = [System.IO.StreamReader]::new($entry.Open())
      $xml = $reader.ReadToEnd(); $reader.Close()
      $value = [System.Security.SecurityElement]::Escape([string] $Values[$name])
      $xml = [regex]::Replace($xml, '<defaultvalue\s*/>|<defaultvalue>[\s\S]*?</defaultvalue>', "<defaultvalue>$value</defaultvalue>")
      $entry.Delete()
      $writer = [System.IO.StreamWriter]::new($zip.CreateEntry($path).Open(), [System.Text.UTF8Encoding]::new($false))
      $writer.Write($xml); $writer.Close()
    }
  } finally { $zip.Dispose() }
}
