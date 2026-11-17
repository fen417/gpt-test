@echo off
setlocal
title SECTOR 09 Animation Viewer
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to open the viewer.
  echo Install Node.js or add node.exe to PATH, then try again.
  pause
  exit /b 1
)
node.exe "%~dp0viewer-server.mjs" %*
if errorlevel 1 pause
