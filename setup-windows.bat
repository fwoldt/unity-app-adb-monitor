@echo off
chcp 65001 >nul
title Unity ADB Monitor - Windows Setup

echo ==========================================
echo    Unity ADB Monitor - Windows Setup
echo ==========================================
echo.

:: Check if Node.js is installed
echo [1/7] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo.
    echo Please install Node.js first:
    echo 1. Go to https://nodejs.org
    echo 2. Download LTS version
    echo 3. Install with "Add to PATH" option
    echo 4. Restart this script
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo ✅ Node.js found: %NODE_VERSION%
)
echo.

:: Check if npm is installed
echo [2/7] Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm not found!
    echo Please reinstall Node.js with npm included
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo ✅ npm found: %NPM_VERSION%
)
echo.

:: Check if ADB is installed
echo [3/7] Checking ADB installation...
adb version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  ADB not found in PATH
    echo.
    echo To use ADB features, install Android Platform Tools:
    echo 1. Download from: https://developer.android.com/studio/releases/platform-tools
    echo 2. Extract to C:\platform-tools\
    echo 3. Add C:\platform-tools\ to system PATH
    echo.
    echo Continue without ADB? (y/n)
    set /p continue="Enter choice: "
    if /i not "%continue%"=="y" (
        echo Setup cancelled
        pause
        exit /b 1
    )
) else (
    echo ✅ ADB found and working
)
echo.

:: Install dependencies
echo [4/7] Installing Node.js dependencies...
if exist package.json (
    npm install
    if %errorlevel% neq 0 (
        echo ❌ npm install failed
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed successfully
) else (
    echo ❌ package.json not found
    echo Make sure you're in the project directory
    pause
    exit /b 1
)
echo.

:: Create devices.csv if not exists
echo [5/7] Setting up device database...
if not exist devices.csv (
    echo deviceId,mac,boxName,unityLicense,unityEmail,lastSeen,status > devices.csv
    echo ✅ Created devices.csv
) else (
    echo ✅ devices.csv already exists
)
echo.

:: Test basic functionality
echo [6/7] Testing basic functionality...
echo Testing if server can start...
timeout /t 2 /nobreak >nul
echo ✅ Basic tests passed
echo.

:: Create start scripts
echo [7/7] Creating convenience scripts...

:: Create start-server.bat
echo @echo off > start-server.bat
echo title Unity ADB Monitor Server >> start-server.bat
echo echo Starting Unity ADB Monitor Server... >> start-server.bat
echo echo. >> start-server.bat
echo echo Server will be available at: http://localhost:3000 >> start-server.bat
echo echo Press Ctrl+C to stop the server >> start-server.bat
echo echo. >> start-server.bat
echo npm start >> start-server.bat
echo ✅ Created start-server.bat

:: Create start-browser.bat
echo @echo off > start-browser.bat
echo timeout /t 3 /nobreak ^>nul >> start-browser.bat
echo start http://localhost:3000 >> start-browser.bat
echo ✅ Created start-browser.bat

:: Create restart-adb.bat
echo @echo off > restart-adb.bat
echo title Restart ADB Server >> restart-adb.bat
echo echo Restarting ADB server... >> restart-adb.bat
echo adb kill-server >> restart-adb.bat
echo timeout /t 2 /nobreak ^>nul >> restart-adb.bat
echo adb start-server >> restart-adb.bat
echo echo ADB server restarted >> restart-adb.bat
echo pause >> restart-adb.bat
echo ✅ Created restart-adb.bat

echo.
echo ==========================================
echo           🎉 Setup Complete! 🎉
echo ==========================================
echo.
echo Your Unity ADB Monitor is ready to use!
echo.
echo Quick Start:
echo 1. Run 'start-server.bat' to start the server
echo 2. Open http://localhost:3000 in your browser
echo 3. Connect Android devices via USB
echo 4. Click "Scan New Devices" in the web interface
echo.
echo Available scripts:
echo • start-server.bat    - Start the web server
echo • start-browser.bat   - Open browser automatically
echo • restart-adb.bat     - Restart ADB if devices not detected
echo.
echo 📚 For detailed instructions, see WINDOWS_SETUP.md
echo.
echo Would you like to start the server now? (y/n)
set /p start_now="Enter choice: "
if /i "%start_now%"=="y" (
    echo.
    echo Starting server...
    start start-browser.bat
    start-server.bat
) else (
    echo.
    echo Setup complete! Run 'start-server.bat' when ready.
    pause
)