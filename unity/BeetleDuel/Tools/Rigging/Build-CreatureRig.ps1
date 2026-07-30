[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputGlb,

    [Parameter(Mandatory = $true, ParameterSetName = "Height")]
    [double]$TargetHeightMeters,

    [Parameter(Mandatory = $true, ParameterSetName = "Longest")]
    [double]$TargetLongestDimensionMeters,

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
$stem = [IO.Path]::GetFileNameWithoutExtension($resolvedInput)
$normalized = Join-Path $resolvedOutput "$stem.normalized.glb"

if ($PSCmdlet.ParameterSetName -eq "Longest") {
    & (Join-Path $PSScriptRoot "Prepare-Rig.ps1") `
        -InputGlb $resolvedInput `
        -TargetLongestDimensionMeters $TargetLongestDimensionMeters `
        -OutputDirectory $resolvedOutput
} else {
    & (Join-Path $PSScriptRoot "Prepare-Rig.ps1") `
        -InputGlb $resolvedInput `
        -TargetHeightMeters $TargetHeightMeters `
        -OutputDirectory $resolvedOutput
}

if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $normalized)) {
    throw "Model normalization failed."
}

& (Join-Path $PSScriptRoot "Create-BlenderRig.ps1") `
    -InputGlb $normalized `
    -RigSpec $resolvedSpec `
    -OutputDirectory $resolvedOutput

if ($LASTEXITCODE -ne 0) {
    throw "Creature rig generation failed."
}
