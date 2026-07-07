# Builds MkDocs HTML from the local-test sandbox and opens it in your browser.
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
$siteDir = Join-Path $sandbox 'site'
$docsDir = Join-Path $sandbox 'docs'
$publishLocalScript = Join-Path $PSScriptRoot 'publish-local-sandbox.ps1'

if (-not (Test-Path $docsDir)) {
    throw 'Sandbox not found. Run: npm run setup-local-test'
}

Write-Host '=== Sync sandbox docs (home page, profiles, mkdocs) ==='
& $publishLocalScript -Write
if ($LASTEXITCODE -ne 0) { throw 'WebWiki sync write failed' }

$python = Get-PythonCommand
if (-not $python) {
    throw 'Python not found. Install Python 3 from python.org, then retry.'
}

Write-Host "Using: $($python.exe) $($python.args -join ' ')"

Ensure-MkDocsInstalled -Python $python

Push-Location $sandbox
try {
    Write-Host 'Building HTML site (same as mkdocs gh-deploy output)...'
    Invoke-PythonModule -Python $python -ModuleArgs @('-m', 'mkdocs', 'build')
}
finally {
    Pop-Location
}

$indexHtml = Join-Path $siteDir 'index.html'
if (-not (Test-Path $indexHtml)) {
    throw "Expected $indexHtml after mkdocs build"
}

Write-Host ''
Write-Host 'HTML wiki built successfully.'
Write-Host "  Site folder: $siteDir"
Write-Host ''
Write-Host 'Pages to check our sync worked (open these paths directly, or use serve-html):'
Write-Host "  Action:   $(Join-Path $siteDir 'Action\index.html')"
Write-Host "  Shipyard: $(Join-Path $siteDir 'Shipyard-Profile\index.html')"
Write-Host ''
Write-Host 'Important: do NOT browse site/ by double-clicking index.html.'
Write-Host 'MkDocs links use folder URLs (e.g. Encounter-Guide/) which need a web server.'
Write-Host 'For full navigation (Next button, sidebar links), run:'
Write-Host '  npm run serve-html'
Write-Host 'Then open http://127.0.0.1:8000'
