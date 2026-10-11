# Supervisor for one backfill window (started by run-live.ps1): reruns counterledger.live until it exits cleanly.
# A crash costs nothing: the HTTP cache keeps every fetched page and data/live/<exchange>/state.json keeps the window pin.
param(
    [Parameter(Mandatory = $true)][string]$Exchanges,
    [string]$Key = "1",
    [string]$EthSource = "etherscan",
    [Parameter(Mandatory = $true)][string]$Log
)
$ErrorActionPreference = "Continue"
$env:PYTHONUNBUFFERED = "1"
$env:CL_ETHERSCAN_KEY = $Key
$env:CL_ETH_SOURCE = $EthSource
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "engine")
$args_ = $Exchanges -split '\s+'

for ($run = 1; $run -le 500; $run++) {
    "[$(Get-Date -Format s)] run $run : $Exchanges (ETH via $EthSource)" | Tee-Object -FilePath $Log -Append
    uv run python -m counterledger.live @args_ 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $Log -Append
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        "[$(Get-Date -Format s)] FINISHED cleanly: $Exchanges" | Tee-Object -FilePath $Log -Append
        exit 0
    }
    $wait = [Math]::Min(30 * $run, 300)
    "[$(Get-Date -Format s)] exited with code $code; restarting in $wait s (progress is cached)" | Tee-Object -FilePath $Log -Append
    Start-Sleep -Seconds $wait
}
"[$(Get-Date -Format s)] GAVE UP after 500 runs: $Exchanges" | Tee-Object -FilePath $Log -Append
