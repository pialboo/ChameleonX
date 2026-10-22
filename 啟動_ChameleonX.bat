@echo off
cd /d "%~dp0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :19888 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
call npm.cmd start
