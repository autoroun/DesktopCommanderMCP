param([switch]$InstallPillow)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$agent = Join-Path $root 'pc_agent.py'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.10+ required.' }
python $agent status
if ($LASTEXITCODE -ne 0) { throw 'PC Agent self-check failed.' }
if ($InstallPillow) { python -m pip install pillow }
Write-Host 'PC Agent ready. No service installed; GUI actions remain disabled.'
