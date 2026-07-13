@echo off
set NODE_DIR=%LOCALAPPDATA%\nodejs-portable\node-v24.18.0-win-x64
set PATH=%NODE_DIR%;%PATH%
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting RM Bin Bros server at http://localhost:3000
node server\index.js
