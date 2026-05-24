@echo off
title Stop Services

echo ========================================
echo    Stopping all Lingxi services...
echo ========================================
echo.

:: Kill by window title (original method)
taskkill /FI "WINDOWTITLE eq Backend*" /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Frontend-Web*" /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Flutter-Web*" /F >nul 2>nul

:: Kill processes listening on ports 3000, 5173, and 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 .*LISTENING"') do (
    echo Killing PID %%a on port 3000
    taskkill /PID %%a /F >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 .*LISTENING"') do (
    echo Killing PID %%a on port 5173
    taskkill /PID %%a /F >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 .*LISTENING"') do (
    echo Killing PID %%a on port 8080
    taskkill /PID %%a /F >nul 2>nul
)

echo.
echo Done. All services stopped.
echo.
pause
