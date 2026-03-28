param(
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

Write-Host "[rollback] Iniciando rollback para v.003.00-00..."

if (-not $Yes) {
  $answer = Read-Host "Isso vai forcar o master para v.003.00-00. Digite SIM para continuar"
  if ($answer -ne "SIM") {
    Write-Host "[rollback] Operacao cancelada pelo usuario."
    exit 1
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "[rollback] Buscando tags do remoto..."
git fetch --tags origin

$targetCommit = (git rev-list -n 1 "refs/tags/v.003.00-00").Trim()
if (-not $targetCommit) {
  Write-Error "Tag v.003.00-00 nao encontrada."
}

Write-Host "[rollback] Tag v.003.00-00 encontrada em $targetCommit"

Write-Host "[rollback] Indo para master..."
git checkout master

Write-Host "[rollback] Resetando master para v.003.00-00..."
git reset --hard v.003.00-00

Write-Host "[rollback] Publicando rollback no origin/master..."
git push --force-with-lease origin master

Write-Host "[rollback] Concluido com sucesso. master agora aponta para v.003.00-00"
