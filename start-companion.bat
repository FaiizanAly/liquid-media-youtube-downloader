@echo off
title Liquid Media Companion Service
color 0B
echo ====================================================
echo        LIQUID MEDIA COMPANION SERVICE (v1.0.0)
echo ====================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js was not found on your system.
    echo Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected.
echo [INFO] Starting companion server on http://127.0.0.1:48123 ...
echo [INFO] Keep this window open while downloading media in Chrome.
echo.

node companion\server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Companion service exited with an error.
    pause
)
