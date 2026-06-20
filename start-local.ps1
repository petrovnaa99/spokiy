# Спокій — локальний запуск без Vercel (SQLite)
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "`nПотрібен Node.js 22.5 або новіший.`nЗавантаж: https://nodejs.org/`n" -ForegroundColor Yellow
  exit 1
}

node -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22||(v[0]===22&&v[1]<5)){console.error('Потрібен Node.js >= 22.5, зараз '+process.version); process.exit(1)}"
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nСпокій — локально на http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "Дані зберігаються в data\spokiy.db" -ForegroundColor DarkGray
Write-Host "Зупинити: Ctrl+C`n" -ForegroundColor DarkGray

node serve.js
