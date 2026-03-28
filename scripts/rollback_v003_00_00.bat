@echo off
setlocal

powershell -ExecutionPolicy Bypass -File "%~dp0rollback_v003_00_00.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo [rollback] Falhou com codigo %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo [rollback] Concluido.
exit /b 0
