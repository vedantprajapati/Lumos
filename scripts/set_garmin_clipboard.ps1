$ErrorActionPreference = "Stop"
$pw = (Get-Clipboard -Raw).Trim()
if ($pw.Contains("`n") -or $pw.Length -gt 128 -or $pw.Length -eq 0) {
    Write-Error "Clipboard does not appear to contain a single-line password (length=$($pw.Length)). Copy your Garmin password and re-run."
    exit 1
}
$envPath = Join-Path $PSScriptRoot "..\.env"
$lines = Get-Content $envPath
$updated = $lines | ForEach-Object {
    if ($_ -match '^GARMIN_PASSWORD=') { "GARMIN_PASSWORD=$pw" }
    else { $_ }
}
Set-Content -Path $envPath -Value $updated -Encoding UTF8
Write-Host "Successfully saved GARMIN_PASSWORD from clipboard into .env (length: $($pw.Length) chars)."
