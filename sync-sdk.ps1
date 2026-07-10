param(
  [string]$Source = "C:\dev\holomedic_cobros",
  [string]$Dest = "\\172.16.10.12\instaladores\HOLOMEDICSDK"
)

if (-not (Test-Path -LiteralPath $Dest)) {
  Write-Host "[ERROR] SDK directory not found: $Dest" -ForegroundColor Red
  Write-Host "Make sure //172.16.10.12/instaladores is accessible"
  exit 1
}

Write-Host "Syncing project to SDK..."

$dirExcludes = @(
  'node_modules', '.next', '.git', '.env',
  'sdd', 'docs', '.gga', 'sigla-cli'
)

$fileExcludes = @(
  '*.zip', '.pr-*.md', 'tsconfig.tsbuildinfo', '*.xlsx'
)

$xdArgs = ($dirExcludes | ForEach-Object { '/XD', $_ }) -join ' '
$xfArgs = ($fileExcludes | ForEach-Object { '/XF', $_ }) -join ' '

$robocopyArgs = @(
  "`"$Source`"", "`"$Dest`"", '/E', '/COPY:DAT', '/NJH', '/NJS', '/NDL', '/NP'
)

foreach ($dir in $dirExcludes) {
  $robocopyArgs += '/XD'
  $robocopyArgs += $dir
}

foreach ($pat in $fileExcludes) {
  $robocopyArgs += '/XF'
  $robocopyArgs += $pat
}

& 'C:\Windows\System32\robocopy.exe' $robocopyArgs

if ($LASTEXITCODE -ge 8) {
  Write-Host "[ERROR] Robocopy failed with exit code $LASTEXITCODE" -ForegroundColor Red
  exit 1
}

Write-Host "[OK] SDK synced to $Dest" -ForegroundColor Green
