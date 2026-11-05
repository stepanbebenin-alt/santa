@echo off
chcp 65001 >nul
title PediaSense — Сервер
echo ========================================================
echo   PediaSense — Запуск локального веб-сервера
echo ========================================================
echo.
node server.js
pause
