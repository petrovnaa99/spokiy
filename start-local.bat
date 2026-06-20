@echo off
chcp 65001 >nul
title Спокій — локальний сервер
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Потрібен Node.js 22.5 або новіший.
  echo Завантаж: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -p "process.versions.node.split('.').map(Number)"') do set NODE_VER=%%v
echo Перевірка Node.js...
node -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22||(v[0]===22&&v[1]<5)){console.error('Потрібен Node.js >= 22.5, зараз '+process.version); process.exit(1)}"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

echo.
echo Спокій запускається локально (SQLite, без Vercel).
echo Відкрий у браузері: http://127.0.0.1:3000
echo Зупинити сервер: Ctrl+C
echo.

node serve.js
