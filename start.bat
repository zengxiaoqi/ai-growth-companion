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
    echo [1/7] Installing backend deps...
    cd src\backend
    call npm install
    cd ..\..
    echo.
) else (
    echo [1/7] Backend deps OK
)

:: 2. Install frontend-web deps
if not exist "src\frontend-web\node_modules" (
    echo [2/7] Installing frontend-web deps...
    cd src\frontend-web
    call npm install
    cd ..\..
    echo.
) else (
    echo [2/7] Frontend-web deps OK
)

:: 3. Install Flutter deps
echo [3/7] Installing Flutter deps...
cd src\frontend
call flutter pub get
cd ..\..
echo.

:: 4. Database policy
if not "%RESET_DB%"=="1" goto :skip_reset
if exist "src\backend\lingxi.db" (
    echo [4/7] Resetting database...
    del /f "src\backend\lingxi.db" 2>nul
) else (
    echo [4/7] Reset requested, but DB not found - will auto-seed
)
goto :db_done
:skip_reset
if exist "src\backend\lingxi.db" (
    echo [4/7] Keeping existing database ^(default^)
) else (
    echo [4/7] First run - will auto-seed
)
:db_done

set "PROJECT_DIR=%~dp0"

:: Backend port: must stay in sync with PORT in src\backend\.env and
:: _devBackendPort in src\frontend\lib\services\api_service.dart
:: Keep this file ASCII-only: cmd.exe reads .bat as ANSI, so UTF-8 text breaks parsing.
set "BACKEND_PORT=3001"

:: 5. Pre-flight: dev ports must be free before starting anything.
:: A stale backend holding BACKEND_PORT is the usual cause of EADDRINUSE.
echo [5/7] Checking dev ports...
echo.

set "PORTS_BUSY="
for %%P in (%BACKEND_PORT% 5173 8080) do (
    netstat -aon | findstr /C:":%%P " | findstr /C:"LISTENING" >nul
    if not errorlevel 1 (
        echo   [BUSY] Port %%P is already in use:
        netstat -aon | findstr /C:":%%P " | findstr /C:"LISTENING"
        set "PORTS_BUSY=1"
    )
)
if defined PORTS_BUSY (
    echo.
    echo   Lingxi appears to be running already. Starting again would fail
    echo   with EADDRINUSE and leave stale processes behind.
    echo   Run stop.bat first, then start.bat again.
    echo.
    pause
    exit /b 1
)
echo   Ports %BACKEND_PORT%, 5173, 8080 are free.
echo.

:: 6. Start services
echo [6/7] Starting services...
echo.

:: Disable QuickEdit first: a selected console freezes Node's synchronous stdout,
:: which stalls the event loop and makes every API request time out.
start "Backend" cmd /k "cd /d %PROJECT_DIR%src\backend\scripts & powershell -NoProfile -ExecutionPolicy Bypass -File disable-console-quickedit.ps1 >nul 2>&1 & cd /d %PROJECT_DIR%src\backend && set PORT=%BACKEND_PORT% && npx nest start --watch"

echo Waiting for backend to be ready...
set "WAITED=0"
:wait_backend
netstat -aon | findstr /C:":%BACKEND_PORT% " | findstr /C:"LISTENING" >nul
if not errorlevel 1 goto :backend_ready
ping -n 2 127.0.0.1 >nul
set /a "WAITED+=1"
if %WAITED% LSS 40 goto :wait_backend
echo   [WARN] Backend did not listen on %BACKEND_PORT% within 40s. Check the Backend window.
goto :start_frontends
:backend_ready
echo   Backend is ready on port %BACKEND_PORT%.
:start_frontends

start "Frontend-Web" cmd /k "cd /d %PROJECT_DIR%src\frontend-web && npx vite --host 0.0.0.0 --port 5173"

start "Flutter-Web" cmd /k "cd /d %PROJECT_DIR%src\frontend && flutter run -d chrome --web-port 8080 --web-hostname 0.0.0.0"

:: Short delay via ping: Git's GNU timeout may shadow timeout.exe on PATH.
ping -n 4 127.0.0.1 >nul

echo.
echo [7/7] All services launched.
echo.
echo ========================================
echo   Started!
echo ========================================
echo.
echo   Frontend-Web : http://localhost:5173
echo   Flutter-Web  : http://localhost:8080
echo   Backend      : http://localhost:%BACKEND_PORT%/api
echo   API Docs     : http://localhost:%BACKEND_PORT%/api/docs
echo.
echo   Note: Flutter dev server has no /api proxy; the app calls the
echo         backend directly at port %BACKEND_PORT%.
echo   Note: Backend console QuickEdit is disabled at startup. Selecting text
echo         in a Windows console otherwise blocks Node stdout and freezes all APIs.
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
