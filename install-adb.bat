@echo off
chcp 65001 >nul
title Install ADB for Unity ADB Monitor

echo ==========================================
echo     ADB Installation Helper Script
echo ==========================================
echo.

echo This script will help you install ADB (Android Debug Bridge)
echo.

:: Check if ADB is already installed
adb version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ ADB is already installed and working!
    for /f "tokens=*" %%i in ('adb version 2^>^&1 ^| findstr "version"') do echo %%i
    echo.
    pause
    exit /b 0
)

echo ❌ ADB not found. Let's install it!
echo.

:: Create platform-tools directory
set INSTALL_DIR=C:\platform-tools
echo Installing ADB to: %INSTALL_DIR%
echo.

if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    echo ✅ Created directory: %INSTALL_DIR%
)

echo Download Instructions:
echo.
echo 1. Open your web browser
echo 2. Go to: https://developer.android.com/studio/releases/platform-tools
echo 3. Click "Download SDK Platform-Tools for Windows"
echo 4. Extract the ZIP file
echo 5. Copy all files from platform-tools folder to: %INSTALL_DIR%
echo.
echo Opening download page in browser...
start https://developer.android.com/studio/releases/platform-tools

echo.
echo After downloading and extracting, press any key to continue...
pause >nul

:: Check if files were copied
if exist "%INSTALL_DIR%\adb.exe" (
    echo ✅ ADB files found in %INSTALL_DIR%
) else (
    echo ❌ ADB files not found. Please copy them to %INSTALL_DIR%
    echo.
    echo Required files:
    echo • adb.exe
    echo • AdbWinApi.dll
    echo • AdbWinUsbApi.dll
    echo.
    pause
    exit /b 1
)

:: Add to PATH
echo.
echo Adding %INSTALL_DIR% to system PATH...
echo.
echo This requires administrator privileges.
echo Right-click on this script and "Run as administrator" if needed.
echo.

:: Try to add to PATH using PowerShell
powershell -Command "& {$oldPath = [Environment]::GetEnvironmentVariable('PATH', 'Machine'); if ($oldPath -notlike '*%INSTALL_DIR%*') { [Environment]::SetEnvironmentVariable('PATH', $oldPath + ';%INSTALL_DIR%', 'Machine'); echo 'Added to PATH' } else { echo 'Already in PATH' }}" 2>nul
if %errorlevel% equ 0 (
    echo ✅ Added to system PATH
) else (
    echo ⚠️  Could not add to PATH automatically
    echo.
    echo Manual steps to add to PATH:
    echo 1. Press Windows + R
    echo 2. Type: sysdm.cpl
    echo 3. Press Enter
    echo 4. Click "Advanced" tab
    echo 5. Click "Environment Variables"
    echo 6. Under "System Variables", find "Path"
    echo 7. Click "Edit"
    echo 8. Click "New"
    echo 9. Add: %INSTALL_DIR%
    echo 10. Click OK on all dialogs
    echo.
    pause
)

:: Set PATH for current session
set PATH=%PATH%;%INSTALL_DIR%

echo.
echo Testing ADB installation...
adb version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ ADB installed successfully!
    adb version
    echo.
    echo You can now use ADB commands:
    echo • adb devices    - List connected devices
    echo • adb shell      - Access device shell
    echo.
) else (
    echo ❌ ADB still not working
    echo.
    echo Try these steps:
    echo 1. Restart Command Prompt / PowerShell
    echo 2. Restart your computer
    echo 3. Run this script as administrator
    echo.
)

echo.
echo ADB installation complete!
echo You can now run setup-windows.bat
pause