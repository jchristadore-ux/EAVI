# Local development / test server for AV ENVIRONMENT INTELLIGENCE.
# Static file server on http://localhost:<Port>/ rooted at the project folder.
# Dev-only endpoint: POST /__save?name=<file> writes the request body to .testout\ (used by the
# in-browser test suite to hand generated ZIP / XLSX / PDF files to disk for validation).
# Never deploy this script; production hosting is any static HTTPS host serving the app\ folder.
param(
  [int]$Port = 5173,
  [string]$Root = (Join-Path $PSScriptRoot '..'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\.testout')
)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
$OutDir = [IO.Path]::GetFullPath($OutDir)
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.md' = 'text/markdown; charset=utf-8'; '.sql' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.csv' = 'text/csv; charset=utf-8'; '.pdf' = 'application/pdf'; '.zip' = 'application/zip'
  '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/  (Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      $res.Headers['Cache-Control'] = 'no-store'
      if ($req.HttpMethod -eq 'POST' -and $path -eq '/__save') {
        # Only pages served by this server may write, and only the file types the test suite produces.
        # (A page on another site cannot set a matching Origin header, so it cannot plant a file here.)
        $name = ($req.QueryString['name'] -replace '[^A-Za-z0-9._-]', '_')
        if ($req.Headers['Origin'] -ne "http://localhost:$Port") { $res.StatusCode = 403 }
        elseif ($name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|xlsx|pdf|csv|json|md|sql|png)$') { $res.StatusCode = 400 }
        else {
          New-Item -ItemType Directory -Force $OutDir | Out-Null
          $fs = [IO.File]::Create((Join-Path $OutDir $name))
          try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
          $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
          $res.ContentType = 'application/json'; $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      }
      else {
        if ($path.EndsWith('/')) { $path += 'index.html' }
        $full = [IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/') -replace '/', '\')))
        if (-not $full.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403 }
        elseif ($full.StartsWith($OutDir.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403 }   # test output is written, never served
        elseif (Test-Path -LiteralPath $full -PathType Leaf) {
          $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
          $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
          $res.ContentType = $ct
          $res.Headers['X-Content-Type-Options'] = 'nosniff'
          if ([IO.Path]::GetFileName($full) -eq 'sw.js') { $res.Headers['Service-Worker-Allowed'] = '/' }
          $bytes = [IO.File]::ReadAllBytes($full)
          $res.ContentLength64 = $bytes.Length
          if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
        }
        else {
          $res.StatusCode = 404
          $bytes = [Text.Encoding]::UTF8.GetBytes("Not found: $path")
          $res.ContentType = 'text/plain'; $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      }
    }
    catch { try { $res.StatusCode = 500 } catch {} ; Write-Host "ERR $($_.Exception.Message)" }
    finally { try { $res.Close() } catch {} }
  }
}
finally { $listener.Stop() }
