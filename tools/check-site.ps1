# Checks that dist\site (the deployable site) carries no demo seed. Run after tools\build.ps1.
# Prints every finding and exits 1 if there is any, 0 otherwise. Used by .github/workflows/deploy.yml.
param([string]$Root = (Join-Path $PSScriptRoot '..'))
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$site = Join-Path $Root 'dist\site'
if (-not (Test-Path $site)) { Write-Output "FAIL: $site does not exist - run tools\build.ps1 first"; exit 1 }

$found = 0
$seedFile = Join-Path $site 'js\seed.js'
if (Test-Path $seedFile) { Write-Output "FAIL: $seedFile exists"; $found++ }

$utf8 = New-Object Text.UTF8Encoding($false)
$index = [IO.File]::ReadAllText((Join-Path $site 'index.html'), $utf8)
if ($index -match 'seed\.js') { Write-Output "FAIL: index.html refers to seed.js"; $found++ }

$patterns = @('EV\.seed\s*=', 'Demonstration Plaza')
$files = Get-ChildItem $site -Recurse -File | Where-Object { $_.Extension -eq '.js' -or $_.Extension -eq '.html' }
foreach ($f in $files) {
  $lines = [IO.File]::ReadAllLines($f.FullName, $utf8)
  for ($i = 0; $i -lt $lines.Length; $i++) {
    foreach ($p in $patterns) {
      if ($lines[$i] -match $p) {
        $text = $lines[$i].Trim()
        if ($text.Length -gt 160) { $text = $text.Substring(0, 160) }
        Write-Output ("FAIL: {0}:{1} matches '{2}': {3}" -f $f.FullName.Substring($site.Length + 1), ($i + 1), $p, $text)
        $found++
      }
    }
  }
}

if ($found -gt 0) { Write-Output "$found finding(s): dist\site must not contain the demo seed"; exit 1 }
Write-Output "OK: dist\site carries no demo seed ($($files.Count) .js/.html files checked)"
exit 0
