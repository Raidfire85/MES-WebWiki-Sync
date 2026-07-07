# Builds sync tool, runs dry-run + write against local-test sandbox, then mkdocs build.
$ErrorActionPreference = 'Stop'

function Get-PythonCommand {
    foreach ($candidate in @(
            @{ exe = 'py'; args = @('-3') },
            @{ exe = 'py'; args = @() },
            @{ exe = 'python3'; args = @() },
            @{ exe = 'python'; args = @() }
        )) {
        $saved = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $null = & $candidate.exe @($candidate.args) --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        } finally {
            $ErrorActionPreference = $saved
        }
    }
    return $null
}

function Invoke-PythonModule {
    param(
        [Parameter(Mandatory)]
        $Python,
        [Parameter(Mandatory)]
        [string[]]$ModuleArgs,
        [switch]$Quiet
    )

    $saved = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        if ($Quiet) {
            & $Python.exe @($Python.args) @ModuleArgs 2>&1 | Out-Null
        } else {
            & $Python.exe @($Python.args) @ModuleArgs
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Python command failed (exit $LASTEXITCODE): $($ModuleArgs -join ' ')"
        }
    } finally {
        $ErrorActionPreference = $saved
    }
}

function Ensure-MkDocsInstalled {
    param(
        [Parameter(Mandatory)]
        $Python
    )

    $saved = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Python.exe @($Python.args) -m mkdocs --version 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return
        }
    } finally {
        $ErrorActionPreference = $saved
    }

    Write-Host 'Installing mkdocs...'
    Invoke-PythonModule -Python $Python -ModuleArgs @('-m', 'pip', 'install', '--quiet', 'mkdocs') -Quiet
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sandbox = Join-Path $repoRoot 'local-test\sandbox'
$docsDir = Join-Path $sandbox 'docs'
$mkdocsPath = Join-Path $sandbox 'mkdocs.yml'
$mesSource = Join-Path $repoRoot 'local-test\mes-source\ModularEncountersSystems'
$tagDescriptions = Join-Path $repoRoot 'publisher\TagDescriptions.json'
$publishScript = Join-Path $repoRoot 'publisher\publish.cjs'
$publishLocalScript = Join-Path $PSScriptRoot 'publish-local-sandbox.ps1'

if (-not (Test-Path $docsDir)) {
    throw 'Sandbox not found. Run: npm run setup-local-test'
}

if (-not (Test-Path $mesSource)) {
    throw "MES source not found at $mesSource"
}

Push-Location $repoRoot
try {
    Write-Host '=== Dry-run ==='
    & $publishLocalScript
    if ($LASTEXITCODE -ne 0) { throw 'Dry-run failed' }

    Write-Host ''
    Write-Host '=== Write (apply changes to sandbox only) ==='
    & $publishLocalScript -Write
    if ($LASTEXITCODE -ne 0) { throw 'Write failed' }

    Write-Host ''
    Write-Host '=== MkDocs build ==='
    $python = Get-PythonCommand
    if (-not $python) {
        Write-Warning 'Python not found — skipping mkdocs build. Run: npm run build-html'
        Write-Host ''
        Write-Host 'Sync tool dry-run and write succeeded. MkDocs preview skipped.'
        exit 0
    }

    Ensure-MkDocsInstalled -Python $python
    Push-Location $sandbox
    Invoke-PythonModule -Python $python -ModuleArgs @('-m', 'mkdocs', 'build')
    Pop-Location

    Write-Host ''
    Write-Host 'MkDocs build finished.'
    $siteDir = Join-Path $sandbox 'site'
    Write-Host "  HTML site: $siteDir"
    Write-Host "  Open:      $(Join-Path $siteDir 'index.html')"
    Write-Host '  Preview:   npm run build-html   (opens browser)'
    Write-Host '  Live:      npm run serve-html'
    Write-Host ''
    Write-Host 'All local tests passed.'
}
finally {
    Pop-Location
}
