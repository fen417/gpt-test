@echo off
cd /d "%~dp0"
set "BLENDER_EXE=%~1"
if not defined BLENDER_EXE for /f "delims=" %%I in ('where blender.exe 2^>nul') do if not defined BLENDER_EXE set "BLENDER_EXE=%%I"
if not defined BLENDER_EXE for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do if exist "%%~fD\blender.exe" set "BLENDER_EXE=%%~fD\blender.exe"
if not defined BLENDER_EXE (
  echo Drag blender.exe onto this BAT or run it with the full path to Blender.
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call npm ci
  if errorlevel 1 exit /b 1
)
"%BLENDER_EXE%" --background --python-exit-code 1 --python art-source/quarry-m05/export_editor_source.py
if errorlevel 1 (echo Export failed. & pause & exit /b 1)
echo Source is ready. Open the world editor again.
pause
