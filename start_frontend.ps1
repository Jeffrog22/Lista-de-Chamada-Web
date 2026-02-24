# Script para iniciar frontend com cd automático
# Use: .\start_frontend.ps1

Push-Location "C:\Users\HP\Lista-de-Chamada-Web\frontend"
Write-Host "Frontend directory: $(Get-Location)" -ForegroundColor Green
Write-Host "Starting Vite dev server..." -ForegroundColor Cyan
npm run dev
Pop-Location
