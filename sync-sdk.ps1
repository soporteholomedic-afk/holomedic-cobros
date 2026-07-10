$ErrorActionPreference = "Stop"

$src = "C:\dev\holomedic_cobros"
$dst = "\\172.16.10.12\INSTALADORES\HOLOMEDICSDK"

$excludeDirs = @("node_modules", ".next", ".git", ".env", "sdd", "docs", ".gga", "sigla-cli")
$excludeFiles = @("*.zip", "tsconfig.tsbuildinfo", "*.xlsx")

if (-not (Test-Path -LiteralPath $dst)) {
  Write-Error "SDK destination not found: $dst"
  exit 1
}

Write-Host "Syncing project to SDK..."
robocopy $src $dst /MIR /XD $excludeDirs /XF $excludeFiles /NDL /NFL /NJH /NJS
Write-Host "[OK] SDK synced to $dst"
