# atualizar-projeto.ps1 — Atualiza a copia do framework de um projeto existente
# a partir do template mestre. Atualiza: rules/, skills/, VERSION.
# Preserva: memory/, workflows/ e todos os demais arquivos do projeto.
# Tambem recalcula a baseline do detector de deriva (.rules-sync-hash) para que
# o sync-rules.sh nao acuse falsa deriva apos uma atualizacao intencional.
# Uso:  .\atualizar-projeto.ps1 -Caminho "E:\@Projetos\MeuSistema"

param(
    [Parameter(Mandatory = $true)]
    [string]$Caminho
)

$Template = Join-Path $PSScriptRoot ".agents"
$Alvo     = Join-Path $Caminho ".agents"

if (-not (Test-Path $Template)) {
    Write-Host "ERRO: template nao encontrado em '$Template'." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $Alvo)) {
    Write-Host "ERRO: '$Caminho' nao contem uma pasta .agents — nao parece um projeto do framework." -ForegroundColor Red
    exit 1
}

# Compara versoes antes de atualizar
$verTemplate = "?"
$verProjeto  = "(sem VERSION — anterior a v4.0.2)"
if (Test-Path (Join-Path $Template "VERSION")) { $verTemplate = Get-Content (Join-Path $Template "VERSION") -TotalCount 1 }
if (Test-Path (Join-Path $Alvo "VERSION"))     { $verProjeto  = Get-Content (Join-Path $Alvo "VERSION") -TotalCount 1 }
Write-Host "Projeto : v$verProjeto"
Write-Host "Template: v$verTemplate"
if ($verProjeto -eq $verTemplate) {
    Write-Host "Projeto ja esta na versao do template. Nada a fazer." -ForegroundColor Green
    exit 0
}

# Atualiza rules/, skills/ e VERSION (nunca toca memory/ nem workflows/)
foreach ($dir in @("rules", "skills")) {
    $destino = Join-Path $Alvo $dir
    if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
    Copy-Item (Join-Path $Template $dir) $destino -Recurse
}
Copy-Item (Join-Path $Template "VERSION") (Join-Path $Alvo "VERSION") -Force

# Recalcula a baseline do detector de deriva (mesmo algoritmo do sync-rules.sh:
# sha256 da concatenacao dos 5 arquivos de regras, em ordem)
$ruleFiles = @("00-core.md", "10-sprint-tdd.md", "20-migrations.md", "30-quick-fix.md", "40-change-request.md") |
    ForEach-Object { Join-Path $Alvo "rules\$_" }
$ms = New-Object System.IO.MemoryStream
foreach ($f in $ruleFiles) {
    if (Test-Path $f) { $b = [IO.File]::ReadAllBytes($f); $ms.Write($b, 0, $b.Length) }
}
$sha  = [System.Security.Cryptography.SHA256]::Create()
$hash = ($sha.ComputeHash($ms.ToArray()) | ForEach-Object { $_.ToString("x2") }) -join ""
[IO.File]::WriteAllText((Join-Path $Alvo "rules\.rules-sync-hash"), $hash)

Write-Host ""
Write-Host "Projeto atualizado para v$verTemplate (rules + skills + VERSION; memory e workflows preservados)." -ForegroundColor Green
Write-Host "Baseline do detector de deriva recalculada."
Write-Host "Commit sugerido (na raiz do projeto):"
Write-Host "  git add .agents; git commit -m `"chore: framework atualizado para v$verTemplate`""
