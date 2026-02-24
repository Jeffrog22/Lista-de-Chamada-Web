# Script para iniciar backend com cd automático
# Use: .\start_backend.ps1

Push-Location "C:\Users\HP\Lista-de-Chamada-Web\backend"
Write-Host "Backend directory: $(Get-Location)" -ForegroundColor Green
Write-Host "Starting uvicorn..." -ForegroundColor Cyan
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Pop-Location
