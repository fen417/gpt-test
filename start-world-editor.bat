@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Install Node.js 24 LTS first. & pause & exit /b 1)
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 (pause & exit /b 1)
)
call npm run dev -- --port 5178 --strictPort --open /world-editor.html
pause
