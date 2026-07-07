# Downloads MeridiusIX WebWiki + MES C# source into local-test/ for offline testing.
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$localTest = Join-Path $repoRoot 'local-test'
$sandbox = Join-Path $localTest 'sandbox'
$mesSource = Join-Path $localTest 'mes-source'
$mesRepo = Join-Path $localTest '_mes-repo'
$docsDir = Join-Path $sandbox 'docs'

Write-Host 'MES WebWiki Sync — local test setup'
Write-Host "  Sync tool repo: $repoRoot"
Write-Host "  Sandbox:        $sandbox"

if (Test-Path $localTest) {
    Write-Host 'Removing previous local-test folder...'
    Remove-Item -Recurse -Force $localTest
}

New-Item -ItemType Directory -Force -Path $docsDir | Out-Null
New-Item -ItemType Directory -Force -Path $mesSource | Out-Null

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required. Install Git for Windows and retry.'
}

Write-Host 'Cloning MeridiusIX/Modular-Encounters-Systems (shallow)...'
git clone --depth 1 --filter=blob:none --sparse `
    https://github.com/MeridiusIX/Modular-Encounters-Systems.git `
    $mesRepo

Push-Location $mesRepo
git sparse-checkout set WebWiki Data/Scripts/ModularEncountersSystems
Pop-Location

Write-Host 'Copying WebWiki/docs, mkdocs.yml, readme.txt, style.css...'
Copy-Item -Recurse -Force (Join-Path $mesRepo 'WebWiki\docs\*') $docsDir
Copy-Item -Force (Join-Path $mesRepo 'WebWiki\mkdocs.yml') (Join-Path $sandbox 'mkdocs.yml')
Copy-Item -Force (Join-Path $mesRepo 'WebWiki\readme.txt') (Join-Path $sandbox 'readme.txt')
if (Test-Path (Join-Path $mesRepo 'WebWiki\docs\style.css')) {
    Copy-Item -Force (Join-Path $mesRepo 'WebWiki\docs\style.css') (Join-Path $sandbox 'docs\style.css')
}

Write-Host 'Copying MES C# source...'
Copy-Item -Recurse -Force (Join-Path $mesRepo 'Data\Scripts\ModularEncountersSystems') `
    (Join-Path $mesSource 'ModularEncountersSystems')

Write-Host 'Removing temp clone...'
Remove-Item -Recurse -Force $mesRepo

Write-Host ''
Write-Host 'Local test sandbox ready:'
Write-Host "  Docs:       $docsDir"
Write-Host "  MES source: $(Join-Path $mesSource 'ModularEncountersSystems')"
Write-Host ''
Write-Host 'Next: npm run test-local'
