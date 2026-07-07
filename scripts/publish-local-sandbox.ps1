# Syncs the local-test sandbox docs from MES source (home page, profiles, mkdocs.yml).
param(
    [switch]$Write
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sandbox = Join-Path $repoRoot 'local-test\sandbox'
$docsDir = Join-Path $sandbox 'docs'
$mkdocsPath = Join-Path $sandbox 'mkdocs.yml'
$mesSource = Join-Path $repoRoot 'local-test\mes-source\ModularEncountersSystems'
$tagDescriptions = Join-Path $repoRoot 'publisher\TagDescriptions.json'
$publishScript = Join-Path $repoRoot 'publisher\publish.cjs'

if (-not (Test-Path $docsDir)) {
    throw 'Sandbox not found. Run: npm run setup-local-test'
}

if (-not (Test-Path $mesSource)) {
    throw "MES source not found at $mesSource"
}

Push-Location $repoRoot
try {
    Write-Host '=== Building sync tool ==='
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Sync tool build failed' }

    $tagArgs = @()
    if (Test-Path $tagDescriptions) {
        $tagArgs = @('--tag-descriptions', $tagDescriptions)
    }

    $writeArgs = @()
    if ($Write) {
        $writeArgs = @('--write')
    }

    $modeLabel = if ($Write) { 'write' } else { 'dry-run' }
    Write-Host ''
    Write-Host "=== WebWiki sync ($modeLabel) ==="

    node $publishScript `
        --docs $docsDir `
        --mkdocs $mkdocsPath `
        --mes-source $mesSource `
        @tagArgs `
        @writeArgs
    if ($LASTEXITCODE -ne 0) { throw "WebWiki sync $modeLabel failed" }
}
finally {
    Pop-Location
}
