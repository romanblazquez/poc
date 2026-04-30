@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo [start.bat] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo [start.bat] ERROR: Node.js not found. Install Node 20+ from https://nodejs.org and retry.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -e "process.stdout.write(process.versions.node)"') do set NODE_MAJOR=%%v
if !NODE_MAJOR! LSS 20 (
  echo [start.bat] WARNING: Node !NODE_MAJOR! detected - Node 20+ is recommended.
)

if not exist "node_modules" (
  echo [start.bat] node_modules not found - running npm install...
  npm install
  if errorlevel 1 (
    echo [start.bat] ERROR: npm install failed.
    pause
    exit /b 1
  )
  echo [start.bat] Dependencies installed.
) else (
  echo [start.bat] node_modules present - skipping install.
)

echo.
echo [start.bat] Starting FDC3 Desktop POC...
echo.
echo   Vite dev servers  -^> ports 4001-4005, 4011-4014  (demo apps)
echo   Electron shell    -^> electron-vite dev (main + preload + renderer)
echo.
echo   Press Ctrl+C to stop everything.
echo.

node tools/scripts/dev.mjs
