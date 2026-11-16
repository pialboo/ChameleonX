@echo off
chcp 65001 >nul
title 變色龍指紋瀏覽器 (ChameleonX)
cd /d "%~dp0"

echo 正在檢查並清理舊進程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :19888 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

if exist "src-tauri\target\release\chameleonx.exe" (
    echo 正在啟動 ChameleonX 桌面版...
    start "" "src-tauri\target\release\chameleonx.exe"
) else (
    echo 正在啟動 ChameleonX 開發模式...
    call npm.cmd run tauri:dev
)
