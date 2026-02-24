@echo off
REM Script simples para iniciar o backend
cd /d C:\Users\HP\Lista-de-Chamada-Web\backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
