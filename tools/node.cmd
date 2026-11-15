@echo off
chcp 65001 >nul
setlocal
set "TOUCHLINE_NODE="
for /f "delims=" %%N in ('where node 2^>nul') do if not defined TOUCHLINE_NODE set "TOUCHLINE_NODE=%%N"
if not defined TOUCHLINE_NODE for /f "usebackq delims=" %%N in (`powershell.exe -NoProfile -Command "$taskPackages=Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*'; foreach($taskPkg in $taskPackages){$taskNode=Join-Path $taskPkg.InstallLocation 'dependencies\node\bin\node.exe'; if(Test-Path -LiteralPath $taskNode){Write-Output $taskNode; break}}"`) do if not defined TOUCHLINE_NODE set "TOUCHLINE_NODE=%%N"
if not defined TOUCHLINE_NODE (
  echo Node.js를 찾지 못했어요. Node.js 20 이상을 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)
cd /d "%~dp0.."
"%TOUCHLINE_NODE%" %*
if errorlevel 1 (
  echo 실행하지 못했어요. 위 안내를 확인해주세요.
  pause
  exit /b 1
)
