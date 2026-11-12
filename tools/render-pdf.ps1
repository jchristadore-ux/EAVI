# Renders pages of a PDF to PNG with the Windows built-in PDF engine (Windows.Data.Pdf).
# Used to verify that generated reports are accepted by an independent PDF renderer and to inspect their layout.
param([Parameter(Mandatory = $true)][string]$Pdf, [int[]]$Pages = @(1), [string]$OutDir = (Split-Path -Parent $Pdf))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and -not $_.IsGenericMethod })[0]
function Await($op, $type) { $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
function AwaitAction($op) { $t = $asTaskAction.Invoke($null, @($op)); $t.Wait(-1) | Out-Null }
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
$full = (Resolve-Path $Pdf).Path
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
"{0}: {1} pages (parsed by Windows.Data.Pdf)" -f (Split-Path -Leaf $full), $doc.PageCount
foreach ($n in $Pages) {
  if ($n -lt 1 -or $n -gt $doc.PageCount) { continue }
  $page = $doc.GetPage($n - 1)
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  AwaitAction ($page.RenderToStreamAsync($stream))
  $out = Join-Path $OutDir (([IO.Path]::GetFileNameWithoutExtension($full)) + "_p$n.png")
  $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
  $fs = [IO.File]::Create($out)
  try { $net.CopyTo($fs) } finally { $fs.Close(); $net.Dispose() }
  "  page {0} -> {1} ({2:N0} bytes, {3}x{4} pt)" -f $n, (Split-Path -Leaf $out), (Get-Item $out).Length, [int]$page.Size.Width, [int]$page.Size.Height
  $page.Dispose()
}
