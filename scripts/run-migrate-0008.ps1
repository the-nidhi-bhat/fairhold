# Script: scripts/run-migrate-0008.ps1
# Purpose: Securely apply migration 0008 to Neon Preview database.
#
# Security properties:
#   - DATABASE_URL is requested via Read-Host -AsSecureString (never echoed)
#   - Value lives only in process memory; never written to disk or logs
#   - Environment variable cleared immediately after script completion
#   - Applies ONLY migration 0008 (never unrelated migrations)
#   - Never prints, logs, saves, or commits the DATABASE_URL value

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path -Path (Join-Path $PSScriptRoot "..")
$migrateScript = Join-Path $repoRoot "scripts\migrate-0008.mjs"

if (-not (Test-Path -Path $migrateScript)) {
    Write-Error "Migration script not found: $migrateScript"
    exit 1
}

# Request DATABASE_URL via hidden secure prompt (never echoed to terminal).
$secureString = Read-Host -AsSecureString -Prompt "Enter Neon Preview DATABASE_URL (hidden input)"

# Convert SecureString to plain text in process memory only.
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureString)
try {
    $databaseUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Error "DATABASE_URL cannot be empty."
    exit 1
}

# Set environment variable for the child Node.js process (process memory only).
$env:DATABASE_URL = $databaseUrl

try {
    & node $migrateScript
    $exitCode = $LASTEXITCODE
} finally {
    # Clear the environment variable immediately after the migration completes.
    $env:DATABASE_URL = $null
    # Also clear the in-memory variable.
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $secureString.Dispose()
}

if ($exitCode -ne 0) {
    Write-Error "Migration 0008 failed with exit code $exitCode."
    exit $exitCode
}

Write-Host "Migration 0008 completed successfully."
exit 0
