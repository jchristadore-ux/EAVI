# Generates the application icons (PNG) with System.Drawing. Run once; output goes to app\icons.
param([string]$Out = (Join-Path $PSScriptRoot '..\app\icons'))
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Out | Out-Null

function New-Icon([int]$Size, [string]$File, [double]$Pad) {
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 21, 34))
  [single]$s = $Size * (1 - 2 * $Pad)
  [single]$o = $Size * $Pad
  # outer rounded frame
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 232, 236, 244)), ([single]($s * 0.045))
  [single]$r = $s * 0.2
  [single]$x = $o + $s * 0.06; [single]$y = $o + $s * 0.06; [single]$w = $s * 0.88; [single]$h = $s * 0.88
  $frame = New-Object System.Drawing.Drawing2D.GraphicsPath
  $frame.AddArc($x, $y, $r * 2, $r * 2, 180, 90)
  $frame.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
  $frame.AddArc($x + $w - $r * 2, $y + $h - $r * 2, $r * 2, $r * 2, 0, 90)
  $frame.AddArc($x, $y + $h - $r * 2, $r * 2, $r * 2, 90, 90)
  $frame.CloseFigure()
  $g.DrawPath($pen, $frame)
  # three level bars
  $bars = @(
    @{ y = 0.30; w = 0.50; c = [System.Drawing.Color]::FromArgb(255, 61, 139, 255) },
    @{ y = 0.46; w = 0.34; c = [System.Drawing.Color]::FromArgb(255, 232, 236, 244) },
    @{ y = 0.62; w = 0.44; c = [System.Drawing.Color]::FromArgb(150, 232, 236, 244) }
  )
  foreach ($b in $bars) {
    $brush = New-Object System.Drawing.SolidBrush $b.c
    [single]$bh = $s * 0.085
    [single]$bx = $o + $s * 0.25; [single]$by = $o + $s * $b.y; [single]$bw = $s * $b.w
    $bar = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bar.AddArc($bx, $by, $bh, $bh, 90, 180)
    $bar.AddArc($bx + $bw - $bh, $by, $bh, $bh, 270, 180)
    $bar.CloseFigure()
    $g.FillPath($brush, $bar)
    $brush.Dispose()
  }
  $g.Dispose()
  $bmp.Save($File, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
New-Icon 192 (Join-Path $Out 'icon-192.png') 0.0
New-Icon 512 (Join-Path $Out 'icon-512.png') 0.0
New-Icon 512 (Join-Path $Out 'icon-maskable-512.png') 0.12
New-Icon 180 (Join-Path $Out 'apple-touch-icon.png') 0.0
Get-ChildItem $Out | ForEach-Object { "{0}  {1} bytes" -f $_.Name, $_.Length }
