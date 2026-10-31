@echo off
chcp 65001 >nul
title САНТА.РАДАР — Публичный HTTPS-сервер для iPhone и Android
echo ===========================================================================
echo   🚀 ЗАПУСК САНТА.РАДАР С ПУБЛИЧНОЙ HTTPS-ССЫЛКОЙ (ДЛЯ IPHONE И ANDROID)
echo ===========================================================================
echo.
echo 1. Запускаем локальный сервер синхронизации на порту 3000...
start "SantaRadarLocalServer" /min node server.js
timeout /t 2 /nobreak >nul
echo 2. Создаем защищенный HTTPS-туннель (чтобы на iPhone и Android работали Камера, Микрофон и GPS)...
echo.
echo 👉 Скопируйте появившуюся ниже ссылку https://....lhr.life (или отсканируйте QR-код в консоли)
echo    и откройте ее на своем телефоне и на телефоне директора!
echo.
ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 nokey@localhost.run
pause
