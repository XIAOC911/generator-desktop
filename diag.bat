@echo off
cd /d "%~dp0"
echo --- node version ---
node -v
echo --- npm version ---
npm -v
echo --- build electron ---
call npm run build:electron
echo --- exit code ---
echo %errorlevel%
echo --- check output ---
dir dist-electron\electron\main.js
pause
