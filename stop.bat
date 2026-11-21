@echo off
title Stop Services

echo ========================================
echo    Stopping all Lingxi services...
echo ========================================
echo.

:: 1. Kill by window title, INCLUDING the whole child process tree (/T).
:: start.bat launches each service as: cmd /k -> npx/nest -> node.
:: Without /T, killing the cmd window orphans the node.exe that owns the port.
for %%T in (Backend Frontend-Web Flutter-Web) do (
    taskkill /FI "WINDOWTITLE eq %%T*" /F /T >nul 2>&1
)

:: 2. Kill Flutter/dart processes (tooling + DDS + frontend server).
:: Stale dart processes leave extra Dart Development Services running and the
:: next `flutter run` connects to the wrong one -> websocket errors.
taskkill /F /IM dart.exe /T >nul 2>&1
taskkill /F /IM dartvm.exe /T >nul 2>&1
taskkill /F /IM dartaotruntime.exe /T >nul 2>&1

:: 3. Kill whatever is still LISTENING on the dev ports, with /T.
:: Repeat a few times: `nest start --watch` has a parent watcher that can
:: re-spawn the app node process after we kill it. Chasing it for a few rounds
:: makes sure it stays dead before start.bat re-checks the ports.
set "PORTS=3001 5173 8080 8090 5174"
for /L %%R in (1,1,3) do (
    for %%P in (%PORTS%) do (
        for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%P " ^| findstr "LISTENING"') do (
            taskkill /PID %%a /F /T >nul 2>&1
        )
    )
    ping -n 2 127.0.0.1 >nul
)

:: 4. Verify. Only claim success if every dev port is actually free.
set "STILL_BUSY="
for %%P in (%PORTS%) do (
    netstat -aon | findstr ":%%P " | findstr "LISTENING" >nul
    if not errorlevel 1 (
        echo   [STILL BUSY] Port %%P :
        netstat -aon | findstr ":%%P " | findstr "LISTENING"
        set "STILL_BUSY=1"
    )
)
echo.
if defined STILL_BUSY (
    echo   WARNING: some dev ports are still in use.
    echo   Check the processes above; you may need to close them manually.
) else (
    echo   Done. All Lingxi dev ports are free.
)
echo.
pause
