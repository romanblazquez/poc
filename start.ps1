$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "[start.ps1] Checking Node.js..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[start.ps1] ERROR: Node.js not found. Install Node 20+ from https://nodejs.org and retry." -ForegroundColor Red
  exit 1
}

$nodeVersion = node -e "process.stdout.write(process.versions.node)"
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 20) {
  Write-Host "[start.ps1] WARNING: Node $nodeMajor detected - Node 20+ is recommended." -ForegroundColor Yellow
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[start.ps1] node_modules not found - running npm install..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[start.ps1] ERROR: npm install failed." -ForegroundColor Red
    exit 1
  }
  Write-Host "[start.ps1] Dependencies installed." -ForegroundColor Green
} else {
  Write-Host "[start.ps1] node_modules present - skipping install." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "[start.ps1] Starting FDC3 Desktop POC..." -ForegroundColor Green
Write-Host ""
Write-Host "  Vite dev servers  -> ports 4001-4005, 4011-4014  (demo apps)" -ForegroundColor Cyan
Write-Host "  Electron shell    -> electron-vite dev (main + preload + renderer)" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop everything." -ForegroundColor Yellow
Write-Host ""

node tools/scripts/dev.mjs
