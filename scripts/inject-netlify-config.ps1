$ErrorActionPreference = "Stop"

$config = Invoke-RestMethod `
  -Uri "https://tl-calendar-planner.vercel.app/api/config" `
  -Headers @{ Accept = "application/json" }

if (-not $config.supabaseUrl -or -not $config.supabaseAnonKey) {
  throw "Production Supabase config is incomplete"
}

$configPath = Join-Path $PSScriptRoot "..\output\netlify\functions\_runtime-config.mjs"
$content = Get-Content -LiteralPath $configPath -Raw
$content = $content.Replace("__SUPABASE_URL__", $config.supabaseUrl)
$content = $content.Replace("__SUPABASE_ANON_KEY__", $config.supabaseAnonKey)
Set-Content -LiteralPath $configPath -Value $content -Encoding utf8NoBOM

Write-Output "Prepared Netlify runtime configuration."
