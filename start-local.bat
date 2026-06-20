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
echo Ноутбук: http://127.0.0.1:3000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4.*:"') do (
  set "LAN_IP=%%a"
  goto :ip_found
)
:ip_found
if defined LAN_IP (
  set "LAN_IP=%LAN_IP: =%"
  echo Телефон у тій самій Wi-Fi мережі: http://%LAN_IP%:3000
)
echo Якщо Windows Firewall спитає доступ — натисни Allow.
echo Зупинити сервер: Ctrl+C
echo.

set HOST=0.0.0.0
set PORT=3000
node serve.js
