@echo off
title Seda Console (demo)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found. Install the LTS version from https://nodejs.org & pause & exit /b)
if not exist node_modules (
  echo Installing packages, about 1 minute...
  call npm install
)
start "" http://localhost:5173
call npm run dev
