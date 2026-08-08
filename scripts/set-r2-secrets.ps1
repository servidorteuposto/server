# Configura secrets R2 na Edge Function do projeto Supabase.
# Uso: preencha .env.r2 e rode: npm run supabase:set-r2-secrets

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.r2'
$projectRef = 'jilzklxnejztpphbryti'

if (-not (Test-Path $envFile)) {
  Write-Error "Arquivo .env.r2 nao encontrado. Copie .env.r2.example para .env.r2 e preencha."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $parts = $line -split '=', 2
  if ($parts.Length -ne 2) { return }
  $name = $parts[0].Trim()
  $value = $parts[1].Trim().Trim('"').Trim("'")
  Set-Item -Path "Env:$name" -Value $value
}

$required = @('R2_BUCKET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY')
foreach ($key in $required) {
  $item = Get-Item -Path "Env:$key" -ErrorAction SilentlyContinue
  if (-not $item -or [string]::IsNullOrWhiteSpace([string]$item.Value)) {
    Write-Error "Falta $key em .env.r2"
  }
}

if (-not $env:R2_ENDPOINT) {
  $env:R2_ENDPOINT = "https://$($env:R2_ACCOUNT_ID).r2.cloudflarestorage.com"
}

Write-Host "Definindo secrets R2 no projeto $projectRef ..."
npx supabase secrets set `
  "R2_BUCKET=$($env:R2_BUCKET)" `
  "R2_ACCOUNT_ID=$($env:R2_ACCOUNT_ID)" `
  "R2_ACCESS_KEY_ID=$($env:R2_ACCESS_KEY_ID)" `
  "R2_SECRET_ACCESS_KEY=$($env:R2_SECRET_ACCESS_KEY)" `
  "R2_ENDPOINT=$($env:R2_ENDPOINT)" `
  --project-ref $projectRef

Write-Host "Secrets R2 configuradas."
