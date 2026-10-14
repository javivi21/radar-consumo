# Instala el radar de consumo en tu Claude Code.
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File instalar.ps1
param([string]$Config = (Join-Path $env:USERPROFILE ".claude"))
$destino = Join-Path $Config "skills\radar-consumo"
New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
New-Item -ItemType Directory -Force -Path $destino | Out-Null
foreach ($d in ".claude-plugin","hooks","types") { Copy-Item -Recurse -Force (Join-Path $PSScriptRoot $d) $destino }
Write-Host "Instalado en $destino. Se carga al abrir una sesion nueva de Claude Code."
