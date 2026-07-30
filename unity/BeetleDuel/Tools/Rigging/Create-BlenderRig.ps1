[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputGlb,

    [Parameter(Mandatory = $true)]
    [string]$RigSpec,

    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
$resolvedInput = (Resolve-Path -LiteralPath $InputGlb).Path
$resolvedSpec = (Resolve-Path -LiteralPath $RigSpec).Path
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $PSScriptRoot "Output"
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if (-not (Test-Path -LiteralPath $blender)) {
    throw "Blender 5.2 was not found."
}

$rigScript = Join-Path $PSScriptRoot "blender_rig.py"
$stem = [IO.Path]::GetFileNameWithoutExtension($resolvedInput)
$outputGlb = Join-Path $resolvedOutput "$stem.rigged.glb"
$outputBlend = Join-Path $resolvedOutput "$stem.rigged.blend"
$report = Join-Path $resolvedOutput "$stem.rig-report.json"

& $blender --background --python $rigScript -- `
    --input $resolvedInput `
    --spec $resolvedSpec `
    --output-glb $outputGlb `
    --output-blend $outputBlend `
    --report $report

if ($LASTEXITCODE -ne 0) {
    throw "Blender rigging failed. Review the Blender output and rig report."
}

$validation = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
if ($validation.weights.unweighted_ratio -gt 0.001) {
    throw "Rig validation failed: $($validation.weights.unweighted_vertices) vertices are unweighted."
}
if ($validation.weights.max_influences -gt 4) {
    throw "Rig validation failed: more than four bone influences were found."
}

Write-Output "Rigged GLB: $outputGlb"
Write-Output "Editable Blender file: $outputBlend"
Write-Output "Validation report: $report"
