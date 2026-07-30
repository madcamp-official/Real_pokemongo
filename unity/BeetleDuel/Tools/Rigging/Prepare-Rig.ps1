[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputGlb,

    [Parameter(Mandatory = $true, ParameterSetName = "Height")]
    [double]$TargetHeightMeters,

    [Parameter(Mandatory = $true, ParameterSetName = "Longest")]
    [double]$TargetLongestDimensionMeters,

    [string]$OutputDirectory,

    [switch]$RunUniRig
)

$ErrorActionPreference = "Stop"

$resolvedInput = (Resolve-Path -LiteralPath $InputGlb).Path
if ([IO.Path]::GetExtension($resolvedInput) -ne ".glb") {
    throw "Input must be a .glb file."
}
$targetSize = if ($PSCmdlet.ParameterSetName -eq "Longest") {
    $TargetLongestDimensionMeters
} else {
    $TargetHeightMeters
}
if ($targetSize -le 0) {
    throw "Target size must be greater than zero."
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $PSScriptRoot "Output"
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$blenderCandidates = @(
    "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
    "C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"
)
$blender = $blenderCandidates |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
if (-not $blender) {
    $blenderCommand = Get-Command blender -ErrorAction SilentlyContinue
    if ($blenderCommand) {
        $blender = $blenderCommand.Source
    }
}
if (-not $blender) {
    throw "Blender was not found."
}

$python = (Get-Command python -ErrorAction Stop).Source
$inspectScript = Join-Path $PSScriptRoot "inspect_glb.py"
$prepareScript = Join-Path $PSScriptRoot "prepare_model.py"
$runnerScript = Join-Path $PSScriptRoot "run_unirig.sh"
$stem = [IO.Path]::GetFileNameWithoutExtension($resolvedInput)
$normalized = Join-Path $resolvedOutput "$stem.normalized.glb"

& $python $inspectScript $resolvedInput
if ($LASTEXITCODE -ne 0) {
    throw "GLB inspection failed."
}

$sizeArguments = if ($PSCmdlet.ParameterSetName -eq "Longest") {
    @("--target-longest", $TargetLongestDimensionMeters)
} else {
    @("--target-height", $TargetHeightMeters)
}

& $blender --background --python $prepareScript -- `
    --input $resolvedInput `
    --output $normalized `
    @sizeArguments
if ($LASTEXITCODE -ne 0) {
    throw "Blender model preparation failed."
}

Write-Output "Normalized model: $normalized"

if ($RunUniRig) {
    $linuxRunner = (& wsl -d Ubuntu -- wslpath -a $runnerScript).Trim()
    $linuxInput = (& wsl -d Ubuntu -- wslpath -a $normalized).Trim()
    $linuxOutput = (& wsl -d Ubuntu -- wslpath -a $resolvedOutput).Trim()
    & wsl -d Ubuntu -- bash $linuxRunner $linuxInput $linuxOutput
    if ($LASTEXITCODE -ne 0) {
        throw "UniRig failed. Confirm that the execution environment has an NVIDIA CUDA GPU with at least 8 GB VRAM."
    }
}
