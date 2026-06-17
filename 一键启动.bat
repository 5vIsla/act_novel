@echo off
set "ROOT=%~dp0"
set "MODE_ARGS="
if not "%1"=="" set "MODE_ARGS=-Mode %1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "& '%ROOT%scripts\start-local.ps1' %MODE_ARGS%"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方错误信息。
  pause
)
