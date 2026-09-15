@echo off
echo 🚀 Launching Document Storage App...
echo.

REM Check if the portable version exists
if exist "release\win-unpacked\Document Storage App.exe" (
    echo 📱 Running portable version...
    start "" "release\win-unpacked\Document Storage App.exe"
) else (
    echo ❌ Portable version not found in release\win-unpacked\
    echo.
    echo 💡 Please either:
    echo    1. Build the app first: npm run build-win
    echo    2. Or install using: release\Document Storage App Setup 1.0.0.exe
    echo.
    pause
)
