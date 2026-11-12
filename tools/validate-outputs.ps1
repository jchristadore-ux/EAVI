# Independent validation of the files produced by the in-browser test suite (written to .testout by tools/serve.ps1).
#   ZIP  - read with .NET System.IO.Compression (not the application's own ZIP code); manifest vs. contents.
#   XLSX - opened with Microsoft Excel through COM automation: must open without repair; tabs, tables, formulas checked.
#   PDF  - structural check (header, page objects, xref, trailer).
param([string]$Dir = (Join-Path $PSScriptRoot '..\.testout'), [switch]$SkipExcel)
$ErrorActionPreference = 'Stop'
$Dir = [IO.Path]::GetFullPath($Dir)
$fail = 0
function Ok($m) { Write-Host "  PASS  $m" }
function Bad($m) { Write-Host "  FAIL  $m"; $script:fail++ }

Write-Host "== ZIP: daily_export_full.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Join-Path $Dir 'daily_export_full.zip'
if (-not (Test-Path $zipPath)) { Bad "missing $zipPath" } else {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $names = @{}; foreach ($e in $zip.Entries) { $names[$e.FullName] = $e }
    Ok ("archive opens with .NET: {0} entries, {1:N0} bytes" -f $zip.Entries.Count, (Get-Item $zipPath).Length)
    function ReadEntry($n) { $s = $names[$n].Open(); $r = New-Object IO.StreamReader($s, [Text.Encoding]::UTF8); try { $r.ReadToEnd() } finally { $r.Close() } }
    $manifest = ReadEntry 'audit_manifest.json' | ConvertFrom-Json
    Ok ("manifest: export {0}, format {1}, generated {2}" -f $manifest.export_id, $manifest.format_version, $manifest.generated_at)
    foreach ($req in 'audit_manifest.json','buildings.csv','floors.csv','rooms.csv','room_audits.csv','devices.csv','functional_tests.csv','findings.csv','backlog.csv','it_coordination.csv','infrastructure.csv','spare_inventory.csv','audit_notes.csv','activity_log.csv','claude_analysis_instructions.md') {
      if (-not $names.ContainsKey($req)) { Bad "required file missing: $req" }
    }
    $tmp = Join-Path $env:TEMP ("avei_val_" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $mismatch = 0; $rows = 0
    foreach ($f in $manifest.files) {
      if (-not $f.columns) { continue }
      if (-not $names.ContainsKey($f.path)) { Bad "listed in manifest but absent: $($f.path)"; continue }
      $p = Join-Path $tmp $f.path
      [IO.File]::WriteAllText($p, (ReadEntry $f.path), (New-Object Text.UTF8Encoding($false)))
      $n = @(Import-Csv -LiteralPath $p).Count
      $rows += $n
      if ($n -ne $f.record_count) { $mismatch++; Bad ("{0}: {1} rows read, manifest says {2}" -f $f.path, $n, $f.record_count) }
    }
    if (-not $mismatch) { Ok ("all {0} CSV files parse with Import-Csv and match the manifest row counts ({1} rows)" -f @($manifest.files | Where-Object { $_.columns }).Count, $rows) }
    $idx = Import-Csv -LiteralPath (Join-Path $tmp 'photo_index.csv')
    $missing = @($idx | Where-Object { $_.file_path -and -not $names.ContainsKey($_.file_path) })
    if ($missing.Count) { Bad "$($missing.Count) photographs referenced in photo_index.csv are not in the archive" } else { Ok ("all {0} photograph paths in photo_index.csv resolve to files in the archive" -f @($idx | Where-Object { $_.file_path }).Count) }
    $first = @($idx | Where-Object { $_.file_path })[0]
    if ($first) {
      $s = $names[$first.file_path].Open(); $buf = New-Object byte[] 3; [void]$s.Read($buf, 0, 3); $s.Close()
      if ($buf[0] -eq 0xFF -and $buf[1] -eq 0xD8) { Ok "photograph file is a valid JPEG stream ($($first.file_path))" } else { Bad "photograph is not a JPEG" }
    }
    $devs = Import-Csv -LiteralPath (Join-Path $tmp 'devices.csv')
    $rooms = @{}; Import-Csv -LiteralPath (Join-Path $tmp 'rooms.csv') | ForEach-Object { $rooms[$_.id] = 1 }
    $dangling = @($devs | Where-Object { $_.room_id -and -not $rooms.ContainsKey($_.room_id) })
    if ($dangling.Count) { Bad "$($dangling.Count) devices reference a room that is not in rooms.csv" } else { Ok ("devices.csv -> rooms.csv relationships resolve ({0} devices)" -f $devs.Count) }
    $inc = @($devs | Where-Object { $_.is_incomplete -eq 'true' })
    Ok ("{0} devices flagged incomplete with reasons, e.g. '{1}'" -f $inc.Count, $inc[0].incomplete_reasons)
    Remove-Item -Recurse -Force $tmp
  } finally { $zip.Dispose() }
}

Write-Host "== PDF"
foreach ($pdf in Get-ChildItem $Dir -Filter *.pdf) {
  $b = [IO.File]::ReadAllBytes($pdf.FullName)
  $t = [Text.Encoding]::GetEncoding(28591).GetString($b)
  $pages = ([regex]::Matches($t, '/Type /Page[^s]')).Count
  $imgs = ([regex]::Matches($t, '/Subtype /Image')).Count
  $m = [regex]::Match($t, 'startxref\n(\d+)\n%%EOF\n$')
  if ($t.StartsWith('%PDF-1.4') -and $m.Success -and $t.Substring([int]$m.Groups[1].Value, 4) -eq 'xref' -and $pages -ge 1) {
    Ok ("{0}: {1:N0} bytes, {2} pages, {3} embedded images, xref table located" -f $pdf.Name, $b.Length, $pages, $imgs)
  } else { Bad "$($pdf.Name): structure invalid" }
}

if (-not $SkipExcel) {
  Write-Host "== XLSX (Microsoft Excel via COM)"
  $xl = $null
  try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false
    try { $xl.AutomationSecurity = 3 } catch {}
    foreach ($x in Get-ChildItem $Dir -Filter *.xlsx) {
      try {
        # CorruptLoad = 0 (xlNormalLoad): a file needing repair raises an error instead of being silently repaired
        # With DisplayAlerts off, Excel refuses (throws) rather than repairs a damaged workbook - verified against a deliberately corrupted file.
        $wb = $xl.Workbooks.Open($x.FullName, 0, $true)
        $tables = 0; $sheetNames = @()
        foreach ($ws in @($wb.Worksheets)) { $tables += [int]$ws.ListObjects.Count; $sheetNames += [string]$ws.Name }
        $caption = $xl.ActiveWindow.Caption
        if ($caption -match 'Repaired') { Bad "$($x.Name): Excel repaired the file" }
        else { Ok ("{0}: opens without repair - {1} sheets, {2} tables" -f $x.Name, $sheetNames.Count, $tables) }
        if ($x.Name -eq 'master_workbook.xlsx') {
          $d = $wb.Worksheets.Item('Executive Dashboard')
          $vals = @{}; $errs = 0; $formulas = 0
          for ($r = 1; $r -le 70; $r++) {
            $c = $d.Cells.Item($r, 2)
            if ($c.HasFormula) { $formulas++; $v = $c.Value2; if ($v -is [int] -and $v -lt 0) { $errs++ } elseif ($v -isnot [double] -and $v -isnot [int]) { $errs++; Write-Host ("        row {0}: {1} = {2}" -f $r, $d.Cells.Item($r, 1).Text, $c.Text) } else { $vals[$d.Cells.Item($r, 1).Text] = $v } }
          }
          if ($errs) { Bad "dashboard: $errs formulas did not evaluate to a number" } else { Ok "dashboard: $formulas formulas evaluate to numbers" }
          $rr = $wb.Worksheets.Item('Room Register').ListObjects.Item(1).ListRows.Count
          $di = $wb.Worksheets.Item('Device Inventory').ListObjects.Item(1).ListRows.Count
          $bl = $wb.Worksheets.Item('Improvement Backlog').ListObjects.Item(1).ListRows.Count
          if ($vals['Spaces (all)'] -eq $rr) { Ok "dashboard 'Spaces (all)' = $rr = rows in Room Register" } else { Bad "dashboard Spaces $($vals['Spaces (all)']) <> Room Register rows $rr" }
          if ($vals['Devices inventoried'] -eq $di) { Ok "dashboard 'Devices inventoried' = $di = rows in Device Inventory" } else { Bad "dashboard Devices $($vals['Devices inventoried']) <> Device Inventory rows $di" }
          Ok ("dashboard sample: buildings={0}, floors={1}, rooms completed={2}, incomplete identification={3}, open backlog={4}, P1 open={5}, IT outstanding={6}, audit completion={7:P0}" -f $vals['Buildings'], $vals['Floors'], $vals['Rooms completed'], $vals['Devices with incomplete identification'], $vals['Open backlog items'], $vals['P1 open'], $vals['Outstanding Client IT dependencies'], $vals['Audit completion'])
          $ws = $wb.Worksheets.Item('Improvement Backlog')
          $dv = 0; try { $dv = $ws.Range('C2').Validation.Type } catch {}
          if ($dv -eq 3) { Ok "Improvement Backlog: Priority column has a dropdown list" } else { Bad "Improvement Backlog: no dropdown on Priority" }
          if ($ws.Range('C2').FormatConditions.Count -ge 1) { Ok "Improvement Backlog: conditional formatting present on Priority" } else { Bad "no conditional formatting on Priority" }
          $frozen = $true
          foreach ($n in 'Room Register','Device Inventory','Findings') { $wb.Worksheets.Item($n).Activate(); if (-not $xl.ActiveWindow.FreezePanes) { $frozen = $false } }
          if ($frozen) { Ok "header rows are frozen on the data tabs" } else { Bad "header rows not frozen" }
          Ok ("tabs: " + ($sheetNames -join ' | '))
        }
        $wb.Close($false)
      } catch { Bad ("{0}: {1}" -f $x.Name, $_.Exception.Message) }
    }
  } catch { Bad ("Excel automation unavailable: " + $_.Exception.Message) }
  finally {
    if ($xl) { try { $xl.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  }
}
Write-Host ""
if ($fail) { Write-Host "RESULT: $fail check(s) FAILED"; exit 1 } else { Write-Host "RESULT: all output checks passed" }
