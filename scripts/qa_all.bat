@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%qa_all.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo QA finalizado com erro. Codigo: %EXIT_CODE%
) else (
  echo.
  echo QA finalizado com sucesso.
)

exit /b %EXIT_CODE%
