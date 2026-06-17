@echo off
set "ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\start-local.ps1"
if errorlevel 1 (
  echo.
  echo Start failed. See the message above.
  pause
)
