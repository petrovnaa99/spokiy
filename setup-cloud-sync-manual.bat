@echo off
chcp 65001 >nul
title Спокій — налаштування синхронізації (без Vercel CLI)
cd /d "%~dp0"

echo.
echo ============================================================
echo   Спокій — синхронізація телефон + ноут (через браузер)
echo   CLI Vercel НЕ потрібен
echo ============================================================
echo.
echo КРОК 1. Supabase
echo   1) Відкрий https://supabase.com/dashboard
echo   2) Створи проєкт (або відкрий існуючий)
echo   3) SQL Editor - виконай файл: supabase\schema.sql
echo   4) Settings - API - скопіюй:
echo        Project URL  -^> SUPABASE_URL
echo        service_role -^> SUPABASE_SERVICE_ROLE_KEY
echo.
echo КРОК 2. Vercel (у браузері)
echo   1) Відкрий https://vercel.com/new
echo   2) Import Git Repository -^> petrovnaa99/spokiy
echo      (або Add New -^> Project, якщо репо вже підключене)
echo   3) Deploy (без змін у налаштуваннях)
echo   4) Project -^> Settings -^> Environment Variables
echo      Додай ДВІ змінні для Production, Preview, Development:
echo        SUPABASE_URL
echo        SUPABASE_SERVICE_ROLE_KEY
echo   5) Deployments -^> ... на останньому -^> Redeploy
echo.
echo КРОК 3. Перевірка
echo   Відкрий у браузері: https://ТВІЙ-ДОМЕН.vercel.app/api/health
echo   Має бути: {"ok":true,"supabase":true,...}
echo.
echo КРОК 4. Користування
echo   На телефоні й ноуті відкривай САЙТ НА VERCEL (не localhost)
echo   Входь з ОДНИМ І ТИМ САМИМ email - дані синхронізуються.
echo.
echo Відкрити корисні сторінки зараз? (Y/N)
set /p OPEN_PAGES=
if /i "%OPEN_PAGES%"=="Y" (
  start https://supabase.com/dashboard
  timeout /t 2 >nul
  start https://vercel.com/new
  timeout /t 2 >nul
  start https://github.com/petrovnaa99/spokiy
)
echo.
pause
