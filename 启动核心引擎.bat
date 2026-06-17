@echo off
set "ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& '%ROOT%scripts\start-local.ps1' -Mode 'core-only' -NoBrowser"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
)
