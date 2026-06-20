param(
  [string]$SupabaseUrl,
  [string]$SupabaseServiceRoleKey,
  [string]$VercelToken
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Не знайдено '$name'. Встанови Node.js LTS: https://nodejs.org/"
  }
}

function Ask-Secret($label) {
  $secure = Read-Host $label -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Show-ManualSteps {
  Write-Host "`n--- Налаштування БЕЗ Vercel CLI (через браузер) ---" -ForegroundColor Cyan
  Write-Host "Запусти: setup-cloud-sync-manual.bat"
  Write-Host "Або вручну:"
  Write-Host "  1) Supabase: виконай supabase/schema.sql, візьми URL + service_role key"
  Write-Host "  2) Vercel: https://vercel.com/new -> Import petrovnaa99/spokiy"
  Write-Host "  3) Settings -> Environment Variables -> SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
  Write-Host "  4) Redeploy -> перевір /api/health (supabase: true)"
}

function Set-VercelEnv($name, $value) {
  npx vercel env rm $name production --yes 2>$null | Out-Null
  npx vercel env rm $name preview --yes 2>$null | Out-Null
  npx vercel env rm $name development --yes 2>$null | Out-Null

  $value | npx vercel env add $name production
  $value | npx vercel env add $name preview
  $value | npx vercel env add $name development
}

Write-Host "== Спокій: налаштування синхронізації звідусіль ==" -ForegroundColor Cyan
Require-Cmd node

node -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22||(v[0]===22&&v[1]<5)){process.exit(1)}"
if ($LASTEXITCODE -ne 0) {
  throw "Потрібен Node.js >= 22.5"
}

if (-not $SupabaseUrl) {
  $SupabaseUrl = Read-Host "SUPABASE_URL (наприклад https://xxxx.supabase.co)"
}
if (-not $SupabaseServiceRoleKey) {
  $SupabaseServiceRoleKey = Ask-Secret "SUPABASE_SERVICE_ROLE_KEY"
}
if (-not $SupabaseUrl -or -not $SupabaseServiceRoleKey) {
  throw "Потрібні обидва ключі Supabase"
}

if ($VercelToken) {
  $env:VERCEL_TOKEN = $VercelToken
  Write-Host "`nВикористовується Vercel token (без інтерактивного логіну)" -ForegroundColor DarkGray
}

Write-Host "`n1) Перевірка Vercel" -ForegroundColor Yellow
$who = npx vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Не вдалося увійти через CLI." -ForegroundColor Yellow
  Write-Host "Варіант А: токен з https://vercel.com/account/tokens"
  $useToken = Read-Host "Вставити Vercel token зараз? (Y/N)"
  if ($useToken -eq "Y" -or $useToken -eq "y") {
    $env:VERCEL_TOKEN = Ask-Secret "VERCEL_TOKEN"
    $who = npx vercel whoami 2>&1
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nCLI-вхід не вдався." -ForegroundColor Red
    Show-ManualSteps
    exit 1
  }
}
Write-Host "Vercel: $who" -ForegroundColor Green

Write-Host "`n2) Лінк проєкту з Vercel" -ForegroundColor Yellow
npx vercel link --yes
if ($LASTEXITCODE -ne 0) {
  Show-ManualSteps
  exit 1
}

Write-Host "`n3) Оновлення env у Vercel" -ForegroundColor Yellow
Set-VercelEnv "SUPABASE_URL" $SupabaseUrl
Set-VercelEnv "SUPABASE_SERVICE_ROLE_KEY" $SupabaseServiceRoleKey

Write-Host "`n4) Продакшн деплой" -ForegroundColor Yellow
$deployOut = npx vercel --prod --yes
if ($LASTEXITCODE -ne 0) {
  Show-ManualSteps
  exit 1
}
$deployOut | ForEach-Object { Write-Host $_ }

$prodUrl = ($deployOut | Select-String -Pattern 'https://[^\s]+').Matches.Value | Select-Object -Last 1
if ($prodUrl) {
  Write-Host "`n5) Health check: $prodUrl/api/health" -ForegroundColor Yellow
  try {
    $resp = Invoke-WebRequest -Uri "$prodUrl/api/health" -UseBasicParsing -TimeoutSec 20
    Write-Host "HTTP $($resp.StatusCode): $($resp.Content)" -ForegroundColor Green
  } catch {
    Write-Host "Перевір вручну: $prodUrl/api/health" -ForegroundColor Red
  }
}

Write-Host "`nГотово. Синхронізація звідусіль увімкнена через Supabase + Vercel." -ForegroundColor Green
