$ErrorActionPreference = "Stop"

# Thin delegate wrapper. The Node engine (scripts/sync-sdk.mjs) resolves the
# repo root from its own location, walks the tree, applies the mirror plan and
# exits with honest codes. This wrapper only forwards argv and propagates the
# exit code: [OK] is printed on success only.

& node "$PSScriptRoot\scripts\sync-sdk.mjs" @args

if ($LASTEXITCODE -eq 0) {
  Write-Host "[OK] SDK synced"
}

exit $LASTEXITCODE
