param(
  [string]$SupabaseUrl,
  [string]$SupabaseServiceRoleKey
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

Write-Host "\n1) Логін у Vercel (якщо не залогінена)" -ForegroundColor Yellow
npx vercel whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  npx vercel login
}

Write-Host "\n2) Лінк проєкту з Vercel" -ForegroundColor Yellow
npx vercel link --yes

Write-Host "\n3) Оновлення env у Vercel" -ForegroundColor Yellow
Set-VercelEnv "SUPABASE_URL" $SupabaseUrl
Set-VercelEnv "SUPABASE_SERVICE_ROLE_KEY" $SupabaseServiceRoleKey

Write-Host "\n4) Продакшн деплой" -ForegroundColor Yellow
$deployOut = npx vercel --prod --yes
$deployOut | ForEach-Object { Write-Host $_ }

$prodUrl = ($deployOut | Select-String -Pattern 'https://[^\s]+').Matches.Value | Select-Object -Last 1
if ($prodUrl) {
  Write-Host "\n5) Health check: $prodUrl/api/health" -ForegroundColor Yellow
  try {
    $resp = Invoke-WebRequest -Uri "$prodUrl/api/health" -UseBasicParsing -TimeoutSec 20
    Write-Host "HTTP $($resp.StatusCode): $($resp.Content)" -ForegroundColor Green
  } catch {
    Write-Host "Health check не пройшов автоматично. Перевір вручну: $prodUrl/api/health" -ForegroundColor Red
  }
}

Write-Host "\nГотово. Синхронізація звідусіль увімкнена через Supabase + Vercel." -ForegroundColor Green
