$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [int]$MaxAttempts = 1,
        [int]$RetryDelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        Write-Host ""
        if ($MaxAttempts -gt 1) {
            Write-Host "==> $Title (tentativa $attempt/$MaxAttempts)" -ForegroundColor Cyan
        }
        else {
            Write-Host "==> $Title" -ForegroundColor Cyan
        }

        try {
            & $Action
            Write-Host "OK: $Title" -ForegroundColor Green
            return
        }
        catch {
            if ($attempt -ge $MaxAttempts) {
                throw
            }

            Write-Host "Falha temporária em '$Title'. Repetindo em ${RetryDelaySeconds}s..." -ForegroundColor Yellow
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }
}

Write-Host "Iniciando QA completo..." -ForegroundColor Yellow

Invoke-Step -Title "Backend tests (pytest)" -Action {
    if (Test-Path $backendPython) {
        Push-Location $backendDir
        try {
            & $backendPython -m pytest tests/test_pool_log.py tests/test_reports_exclusions.py -q
        }
        finally {
            Pop-Location
        }
    }
    else {
        throw "Python do backend não encontrado em $backendPython"
    }
}

Invoke-Step -Title "Frontend E2E smoke" -Action {
    Push-Location $frontendDir
    try {
        npm run test:e2e:smoke
    }
    finally {
        Pop-Location
    }
} -MaxAttempts 2 -RetryDelaySeconds 3

Invoke-Step -Title "Frontend E2E reports" -Action {
    Push-Location $frontendDir
    try {
        npm run test:e2e:reports
    }
    finally {
        Pop-Location
    }
} -MaxAttempts 2 -RetryDelaySeconds 3

Write-Host ""
Write-Host "QA completo finalizado com sucesso." -ForegroundColor Green
