@echo off
title Stop Services

echo ========================================
echo    Stopping all Lingxi services...
echo ========================================
echo.

taskkill /FI "WINDOWTITLE eq Backend*" /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Frontend*" /F >nul 2>nul

echo Done. All services stopped.
echo.
pause
