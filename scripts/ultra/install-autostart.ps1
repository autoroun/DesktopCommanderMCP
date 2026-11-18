# Desktop Commander Ultra: reuse the already-existing hidden Windows logon task.
# Run from the fork checkout after npm run build.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Entry = Join-Path $Root 'dist\index.js'
$Cli = Join-Path $Root 'dist\ultra\cli.js'
$Node = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $Entry) -or -not (Test-Path -LiteralPath $Cli)) {
  throw 'Build the fork first with npm run build.'
}
$Folder = Join-Path $env:LOCALAPPDATA 'DesktopCommanderRemote'
New-Item -ItemType Directory -Path $Folder -Force | Out-Null
$Agent = Join-Path $Folder 'RemoteAgent.ps1'
$Vbs = Join-Path $Folder 'Start-Remote-Hidden.vbs'
$Backup = Join-Path $Folder ('RemoteAgent.before-ultra.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.ps1')
if (Test-Path $Agent) { Copy-Item $Agent $Backup -Force }
$Source = @'
# Desktop Commander Ultra - hidden persistent Windows remote agent
$ErrorActionPreference = 'Continue'
$Log = Join-Path $PSScriptRoot 'startup-agent.log'
$Mutex = New-Object System.Threading.Mutex($false, 'Local\DesktopCommanderRemoteAutostart')
if (-not $Mutex.WaitOne(0, $false)) { exit 0 }
$env:DC_ULTRA_DASHBOARD = '1'
$env:PATH = '__NODE_DIR__;' + $env:PATH
function Write-AgentLog([string]$Message) {
  Add-Content -LiteralPath $Log -Encoding UTF8 -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $Message)
}
function Test-RemoteRunning {
  try {
    $list = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop |
      Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'remote(\s|$)' -and $_.CommandLine -match 'desktop-commander|DesktopCommanderMCP' })
    return $list.Count -gt 0
  } catch { return $true }
}
while ($true) {
  if (Test-RemoteRunning) { Start-Sleep -Seconds 10; continue }
  try {
    if ((Test-Path -LiteralPath $Log) -and ((Get-Item $Log).Length -gt 5MB)) {
      Move-Item $Log ($Log + '.previous') -Force
    }
    Write-AgentLog 'Starting personal DesktopCommander Ultra fork'
    Set-Location -LiteralPath '__ROOT__'
    & '__NODE__' '__ENTRY__' remote *>> $Log
    Write-AgentLog ('Ultra agent exited: ' + $LASTEXITCODE + '. Retrying.')
  } catch {
    Write-AgentLog ('Startup error: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 8
}
'@
$Source = $Source.Replace('__NODE_DIR__',(Split-Path $Node -Parent)).Replace('__ROOT__',$Root).Replace('__NODE__',$Node).Replace('__ENTRY__',$Entry)
Set-Content -LiteralPath $Agent -Value $Source -Encoding UTF8
if (-not (Test-Path $Vbs)) {
  $RunVbs = 'Set sh = CreateObject("WScript.Shell")' + [Environment]::NewLine +
    'sh.Run "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $Agent + '""", 0, False'
  Set-Content -LiteralPath $Vbs -Value $RunVbs -Encoding ASCII
}
$TaskName = 'DesktopCommander Remote Agent'
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  $Action = New-ScheduledTaskAction -Execute "$env:WINDIR\system32\wscript.exe" -Argument ('//B //Nologo "' + $Vbs + '"')
  $Trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
  $Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Desktop Commander Ultra fork remote agent' | Out-Null
}
# Migrate new single-mode configuration before the remote agent starts.
& $Node $Cli
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the Ultra Full Access profile.' }
Write-Output ('Installed. Startup task: ' + $TaskName)
Write-Output ('Fork entry: ' + $Entry)
Write-Output ('Previous launcher backup: ' + $Backup)
Write-Output 'To avoid two agents running at once, the updated startup launcher takes effect at the next Windows logon.'
