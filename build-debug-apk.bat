@echo off
chcp 65001 >nul 2>nul
setlocal
title Lingxi - Build Local Debug APK
cd /d "%~dp0"

rem Locate the REAL Git Bash. C:\Windows\System32\bash.exe is WSL and has no
rem flutter/java/adb on PATH - never use that one.
set "BASH_EXE="

rem 1. Derive from git.exe - works for any install drive.
for /f "delims=" %%G in ('where git 2^>nul') do (
  if not defined BASH_EXE if exist "%%~dpG..\bin\bash.exe" (
    for %%P in ("%%~dpG..\bin\bash.exe") do set "BASH_EXE=%%~fP"
  )
)

rem 2. Usual install locations.
if not defined BASH_EXE if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH_EXE=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH_EXE if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "BASH_EXE=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

rem 3. Fall back to PATH, then reject the WSL shim.
if not defined BASH_EXE (
  for /f "delims=" %%B in ('where bash 2^>nul') do if not defined BASH_EXE set "BASH_EXE=%%B"
)
if defined BASH_EXE echo %BASH_EXE% | findstr /i /c:"\system32\bash.exe" >nul && set "BASH_EXE="

if not defined BASH_EXE (
  echo [ERROR] Git Bash not found. Install Git for Windows, or run manually:
  echo         ^<Git^>\bin\bash.exe ./build-debug-apk.sh
  pause
  exit /b 1
)

echo [INFO] Using: %BASH_EXE%
echo.
"%BASH_EXE%" ./build-debug-apk.sh %*
set "EXIT_CODE=%errorlevel%"
echo.
echo [exit code: %EXIT_CODE%]
rem Keep the window open for a double-click, i.e. no arguments.
if "%~1"=="" pause
exit /b %EXIT_CODE%
