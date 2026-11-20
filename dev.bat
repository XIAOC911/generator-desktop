@echo off
cd /d "%~dp0"
if not exist "node_modules\" call npm install
call npm run build:electron
call npm run dev
pause