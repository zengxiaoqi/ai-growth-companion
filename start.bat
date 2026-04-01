@echo off
title Lingxi Companion - Start

echo ========================================
echo    Lingxi Companion - AI Growth Partner
echo ========================================
echo.

cd /d "%~dp0"

:: 1. Install backend deps
if not exist "src\backend\node_modules" (
    echo [1/4] Installing backend deps...
    cd src\backend
    call npm install
    cd ..\..
    echo.
) else (
    echo [1/4] Backend deps OK
)

:: 2. Install frontend deps
if not exist "src\frontend-web\node_modules" (
    echo [2/4] Installing frontend deps...
    cd src\frontend-web
    call npm install
    cd ..\..
    echo.
) else (
    echo [2/4] Frontend deps OK
)

:: 3. Reset database
if exist "src\backend\lingxi.db" (
    echo [3/4] Resetting database...
    del /f "src\backend\lingxi.db" 2>nul
) else (
    echo [3/4] First run - will auto-seed
)

:: 4. Start services
echo [4/4] Starting services...
echo.

set "PROJECT_DIR=%~dp0"

start "Backend" cmd /k "cd /d %PROJECT_DIR%src\backend && npx nest start --watch"

echo Waiting for backend to start...
timeout /t 8 /nobreak >nul

start "Frontend" cmd /k "cd /d %PROJECT_DIR%src\frontend-web && npx vite --host 0.0.0.0 --port 5173"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   Started!
echo ========================================
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3000/api
echo   API Docs : http://localhost:3000/api/docs
echo.
echo   Test Account: 13800000001 / password123
echo.
echo   Close this window will NOT stop services.
echo   To stop: close the Backend/Frontend windows, or run stop.bat
echo ========================================

start http://localhost:5173

echo.
pause
