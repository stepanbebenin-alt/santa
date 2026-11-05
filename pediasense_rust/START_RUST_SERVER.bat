@echo off
chcp 65001 >nul
title PediaSense Rust Server
echo ========================================================
echo   PediaSense — Клинический дневник болезни ребёнка
echo ========================================================
echo.

where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [!] Rust / Cargo не обнаружен в системе.
    echo.
    echo Чтобы собрать и запустить сервер на Rust:
    echo 1. Установите Rust с официального сайта: https://rustup.rs/
    echo 2. Запустите установленный rustup-init.exe
    echo 3. Перезапустите этот файл.
    echo.
    echo [i] Вы также можете прямо сейчас открыть static\index.html
    echo     или pediasense_app.html на Рабочем столе — он полностью
    echo     автономен и работает в браузере без установки Rust!
    echo.
    pause
    exit /b 1
)

echo [*] Сборка и запуск Rust бэкенда (Axum + Tokio)...
cargo run --release
pause
