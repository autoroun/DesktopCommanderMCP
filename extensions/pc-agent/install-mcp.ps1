param([switch]$SkipDependencies)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.10+ required' }
if (-not $SkipDependencies) { python -m pip install -r (Join-Path $root 'requirements.txt'); if ($LASTEXITCODE -ne 0) { throw 'pip failed' } }
python -m py_compile (Join-Path $root 'mcp_server.py')
if ($LASTEXITCODE -ne 0) { throw 'MCP server syntax failed' }
$python = (Get-Command python).Source
$settings = @{ mcpServers = @{ 'pc-agent-extended' = @{ command = $python; args = @((Join-Path $root 'mcp_server.py')) } } }
$settings | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $root 'mcp-config.example.json') -Encoding utf8
Write-Host 'Ready: copy mcpServers.pc-agent-extended into your MCP host configuration. No existing settings overwritten.'
