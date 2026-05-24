@echo off
title Lingxi Companion - Start

echo ========================================
echo    Lingxi Companion - AI Growth Partner
echo ========================================
echo.

cd /d "%~dp0"

set "RESET_DB=0"
if /I "%~1"=="--reset-db" set "RESET_DB=1"

:: 1. Install backend deps
if not exist "src\backend\node_modules" (
    echo [1/6] Installing backend deps...
    cd src\backend
    call npm install
    cd ..\..
    echo.
) else (
    echo [1/6] Backend deps OK
)

:: 2. Install frontend-web deps
if not exist "src\frontend-web\node_modules" (
    echo [2/6] Installing frontend-web deps...
    cd src\frontend-web
    call npm install
    cd ..\..
    echo.
) else (
    echo [2/6] Frontend-web deps OK
)

:: 3. Install Flutter deps
echo [3/6] Installing Flutter deps...
cd src\frontend
call flutter pub get
cd ..\..
echo.

:: 4. Database policy
if not "%RESET_DB%"=="1" goto :skip_reset
if exist "src\backend\lingxi.db" (
    echo [4/6] Resetting database...
    del /f "src\backend\lingxi.db" 2>nul
) else (
    echo [4/6] Reset requested, but DB not found - will auto-seed
)
goto :db_done
:skip_reset
if exist "src\backend\lingxi.db" (
    echo [4/6] Keeping existing database (default)
) else (
    echo [4/6] First run - will auto-seed
)
:db_done

:: 5. Start services
echo [5/6] Starting services...
echo.

set "PROJECT_DIR=%~dp0"

start "Backend" cmd /k "cd /d %PROJECT_DIR%src\backend && npx nest start --watch"

echo Waiting for backend to start...
timeout /t 8 /nobreak >nul

start "Frontend-Web" cmd /k "cd /d %PROJECT_DIR%src\frontend-web && npx vite --host 0.0.0.0 --port 5173"

start "Flutter-Web" cmd /k "cd /d %PROJECT_DIR%src\frontend && flutter run -d chrome --web-port 8080 --web-hostname 0.0.0.0"

timeout /t 3 /nobreak >nul

echo.
echo [6/6] All services launched.
echo.
echo ========================================
echo   Started!
echo ========================================
echo.
echo   Frontend-Web : http://localhost:5173
echo   Flutter-Web  : http://localhost:8080
echo   Backend      : http://localhost:3000/api
echo   API Docs     : http://localhost:3000/api/docs
echo.
echo   Test Account: 13800000001 / password123
echo   Tip: run start.bat --reset-db to reset database
echo.
echo   Close this window will NOT stop services.
echo   To stop: close the service windows, or run stop.bat
echo ========================================

start http://localhost:5173

echo.
pause
