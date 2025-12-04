@echo off
chcp 65001 >nul
title Unity ADB Monitor - Quick Start

echo ==========================================
echo    Unity ADB Monitor - Quick Start
echo ==========================================
echo.

:: Quick check
if not exist package.json (
    echo ❌ package.json not found
    echo Please run this script from the project directory
    pause
    exit /b 1
)

echo Choose an option:
echo.
echo 1. 🚀 Full Setup (first time)
echo 2. 📦 Install ADB only
echo 3. 🎮 Start Server (if already setup)
echo 4. 🔄 Restart ADB Server
echo 5. 🌐 Open in Browser
echo 6. 📚 View Help
echo.
set /p choice="Enter choice (1-6): "

if "%choice%"=="1" (
    echo.
    echo Starting full setup...
    call setup-windows.bat
) else if "%choice%"=="2" (
    echo.
    echo Starting ADB installation...
    call install-adb.bat
) else if "%choice%"=="3" (
    echo.
    echo Starting server...
    if exist start-server.bat (
        start start-browser.bat
        start-server.bat
    ) else (
        echo Please run full setup first (option 1)
        pause
    )
) else if "%choice%"=="4" (
    echo.
    echo Restarting ADB server...
    adb kill-server
    timeout /t 2 /nobreak >nul
    adb start-server
    echo ADB server restarted
    pause
) else if "%choice%"=="5" (
    echo.
    echo Opening browser...
    start http://localhost:3000
) else if "%choice%"=="6" (
    echo.
    if exist WINDOWS_SETUP.md (
        start notepad WINDOWS_SETUP.md
    ) else (
        echo Help file not found
    )
) else (
    echo Invalid choice
    pause
)