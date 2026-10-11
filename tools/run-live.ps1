# Run the live-heartbeat backfill in its OWN PowerShell window (keeps running if Claude Code restarts).
#   powershell -ExecutionPolicy Bypass -File tools\run-live.ps1 -Exchanges "bybit okx" -Key 1
#   powershell -ExecutionPolicy Bypass -File tools\run-live.ps1 -Exchanges "binance" -Key 2
# Progress is safe to stop at any time: data/live/<exchange>/state.json keeps the resume pin and the cache keeps calls.
param(
    [Parameter(Mandatory = $true)][string]$Exchanges,
    [string]$Key = "1",
    [string]$EthSource = "etherscan"   # or "nodereal": a second Ethereum source with its own rate limit
)
$root = Split-Path -Parent $PSScriptRoot
$engine = Join-Path $root "engine"
$log = Join-Path $root ("cache\live-" + ($Exchanges -replace '\s+', '-') + ".log")
$cmd = "`$env:PYTHONUNBUFFERED='1'; `$env:CL_ETHERSCAN_KEY='$Key'; `$env:CL_ETH_SOURCE='$EthSource'; Set-Location '$engine'; " +
       "Write-Host 'Counterledger live backfill: $Exchanges (ETH via $EthSource, Etherscan key $Key) -> $log'; " +
       "uv run python -m counterledger.live $Exchanges 2>&1 | Tee-Object -FilePath '$log' -Append; " +
       "Write-Host 'DONE. You can close this window.'; Read-Host 'Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
Write-Host "Started window for: $Exchanges (key $Key). Log: $log"
