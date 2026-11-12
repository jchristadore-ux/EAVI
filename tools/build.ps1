# Release build for AV ENVIRONMENT INTELLIGENCE. No Node, npm or bundler is required.
#   1. Writes app\sw.js (service worker with the exact file list and a content-hash version).
#   2. dist\site\                      - the deployable static site (copy of app\). Upload this folder to any HTTPS static host.
#   3. dist\av-environment-intelligence-site.zip    - the same site, zipped for upload.
#   4. dist\artifact\av-environment-intelligence.html - single self-contained page (all CSS and JS inline) for hosts that take one file.
#   5. dist\av-environment-intelligence-source.zip  - full source package (app, supabase, deploy, tools, tests, docs).
#
# -SyncOrigin  Optional. By default the site is DEVICE-ONLY: its Content-Security-Policy is connect-src 'self', so the
#              browser refuses every connection to any other server. To enable cloud sync for ONE approved workspace:
#                  tools\build.ps1 -SyncOrigin https://<project>.supabase.co
#              which adds exactly that origin to connect-src in dist\site\index.html. Nothing else is opened.
param([string]$Root = (Join-Path $PSScriptRoot '..'), [string]$SyncOrigin = '')
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$SyncOrigin = $SyncOrigin.Trim().TrimEnd('/')
if ($SyncOrigin -and $SyncOrigin -notmatch '^https://[A-Za-z0-9.-]+(:\d+)?$') { throw "SyncOrigin must be a bare https origin, for example https://abcd1234.supabase.co" }
$app = Join-Path $Root 'app'
$dist = Join-Path $Root 'dist'
$utf8 = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Writes a ZIP whose entry names use forward slashes, as the ZIP format requires. (On .NET Framework,
# ZipFile.CreateFromDirectory writes backslashes, and such an archive unpacks into wrongly named files on Linux or macOS.)
function New-PortableZip([string]$SourceDir, [string]$ZipPath) {
  $SourceDir = [IO.Path]::GetFullPath($SourceDir).TrimEnd('\')
  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  $zip = [IO.Compression.ZipFile]::Open($ZipPath, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in (Get-ChildItem $SourceDir -Recurse -File -Force | Sort-Object FullName)) {
      $name = $f.FullName.Substring($SourceDir.Length + 1).Replace('\', '/')
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $zip.Dispose() }
}

# ---- 1. service worker
$files = Get-ChildItem $app -Recurse -File | Where-Object { $_.Name -ne 'sw.js' } | Sort-Object FullName
$rel = $files | ForEach-Object { './' + $_.FullName.Substring($app.Length + 1).Replace('\', '/') }
$sha = [Security.Cryptography.SHA256]::Create()
$all = New-Object IO.MemoryStream
foreach ($f in $files) { $h = $sha.ComputeHash([IO.File]::ReadAllBytes($f.FullName)); $all.Write($h, 0, $h.Length) }
$so = [Text.Encoding]::UTF8.GetBytes($SyncOrigin); $all.Write($so, 0, $so.Length)   # a different sync origin is a different build
$version = -join ($sha.ComputeHash($all.ToArray())[0..5] | ForEach-Object { $_.ToString('x2') })
$list = "[`n  './',`n" + (($rel | ForEach-Object { "  '$_'" }) -join ",`n") + "`n]"
$sw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'sw.template.js'), $utf8).Replace("'__VERSION__'", "'$version'").Replace('__FILES__', $list)
[IO.File]::WriteAllText((Join-Path $app 'sw.js'), $sw, $utf8)
"service worker: version $version, $($rel.Count) files pre-cached"

# ---- 2/3. static site
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Force (Join-Path $dist 'site'), (Join-Path $dist 'artifact') | Out-Null
Copy-Item (Join-Path $app '*') (Join-Path $dist 'site') -Recurse -Force
$siteIndex = Join-Path $dist 'site\index.html'
$html = [IO.File]::ReadAllText($siteIndex, $utf8)
$needle = "connect-src 'self';"
if (-not $html.Contains($needle)) { throw "index.html: `"$needle`" not found - the Content-Security-Policy line has changed; update tools\build.ps1." }
if ($SyncOrigin) {
  [IO.File]::WriteAllText($siteIndex, $html.Replace($needle, "connect-src 'self' $SyncOrigin;"), $utf8)
  "network policy: SYNC-ENABLED build - the browser may connect to $SyncOrigin and nowhere else"
} else {
  "network policy: DEVICE-ONLY build - connect-src 'self', the browser refuses every outside connection"
}
$siteZip = Join-Path $dist 'av-environment-intelligence-site.zip'
New-PortableZip (Join-Path $dist 'site') $siteZip
"site: dist\site ($((Get-ChildItem (Join-Path $dist 'site') -Recurse -File).Count) files), zip {0:N0} bytes" -f (Get-Item $siteZip).Length

# ---- 4. single-file page (document fragment: title, style, markup, scripts - no <html>/<head>/<body> wrapper)
$index = [IO.File]::ReadAllText((Join-Path $app 'index.html'), $utf8)
$scripts = [regex]::Matches($index, '<script src="([^"]+)"></script>') | ForEach-Object { $_.Groups[1].Value }
$css = [IO.File]::ReadAllText((Join-Path $app 'css\app.css'), $utf8)
$sb = New-Object Text.StringBuilder
[void]$sb.AppendLine('<title>AV Environment Intelligence</title>')
[void]$sb.AppendLine('<meta name="claude:viewport-fit-sides" content="cover">')
[void]$sb.AppendLine('<meta name="robots" content="noindex, nofollow">')
[void]$sb.AppendLine('<style>')
[void]$sb.AppendLine($css)
[void]$sb.AppendLine('</style>')
[void]$sb.AppendLine('<div id="app"><div class="boot">AV Environment Intelligence</div></div>')
# The demonstration page (and only it) also carries the synthetic demo environment, loaded right after roomimport.js.
$demoSeed = Join-Path $Root 'demo\seed.js'
$inlined = 0
foreach ($s in $scripts) {
  $code = [IO.File]::ReadAllText((Join-Path $app ($s.Replace('/', '\'))), $utf8)
  if ($s -eq 'js/roomimport.js' -and (Test-Path $demoSeed)) { $code = $code + "`n" + [IO.File]::ReadAllText($demoSeed, $utf8); $inlined++ }
  if ($code -match '</script') { throw "Script $s contains a closing script tag and cannot be inlined safely." }
  [void]$sb.AppendLine("<script>/* $s */")
  [void]$sb.AppendLine($code)
  [void]$sb.AppendLine('</script>')
}
if ($inlined -ne 1) { throw "demo\seed.js was inlined $inlined times into the demonstration page, expected exactly 1" }
$single = Join-Path $dist 'artifact\av-environment-intelligence.html'
[IO.File]::WriteAllText($single, $sb.ToString(), $utf8)
"single file: dist\artifact\av-environment-intelligence.html, {0:N0} bytes, $($scripts.Count) scripts inlined" -f (Get-Item $single).Length

# ---- 5. source package
$srcZip = Join-Path $dist 'av-environment-intelligence-source.zip'
$stage = Join-Path $env:TEMP ('avei_src_' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $stage | Out-Null
foreach ($d in 'app', 'demo', 'supabase', 'deploy', 'tools', 'tests', 'docs', '.github') { if (Test-Path (Join-Path $Root $d)) { Copy-Item (Join-Path $Root $d) (Join-Path $stage $d) -Recurse -Force } }
foreach ($f in 'README.md', 'CLAUDE.md', '.gitignore', '.gitattributes') { if (Test-Path (Join-Path $Root $f)) { Copy-Item (Join-Path $Root $f) $stage -Force } }
New-PortableZip $stage $srcZip
Remove-Item -Recurse -Force $stage
"source package: {0:N0} bytes" -f (Get-Item $srcZip).Length
