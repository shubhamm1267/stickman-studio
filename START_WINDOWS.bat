@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js 24 LTS first. & pause & exit /b 1)
if not exist node_modules (
 call npm ci
 if errorlevel 1 (pause & exit /b 1)
)
call npm run setup
if errorlevel 1 (pause & exit /b 1)
call npm run build
if errorlevel 1 (pause & exit /b 1)
echo Open http://127.0.0.1:3001 in your browser.
call npm start
pause
