param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectPath = Join-Path $repoRoot 'unity\BeetleDuel'
$buildFolder = Join-Path $projectPath 'Builds\Windows\NatureGoGarden'
$unityPath = 'C:\Program Files\Unity\Hub\Editor\6000.5.4f1\Editor\Unity.exe'
$isccCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe'
)
$isccPath = $isccCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not (Test-Path -LiteralPath $unityPath)) {
    throw "Unity 6000.5.4f1을 찾을 수 없습니다: $unityPath"
}
if (-not $isccPath) {
    throw 'Inno Setup 6이 설치되어 있지 않습니다.'
}

$runningGarden = Get-Process -Name 'NatureGoGarden' -ErrorAction SilentlyContinue
if ($runningGarden) {
    $runningGarden | ForEach-Object { [void]$_.CloseMainWindow() }
    $runningGarden | ForEach-Object {
        try { Wait-Process -Id $_.Id -Timeout 15 -ErrorAction Stop } catch {}
    }
    $runningGarden = Get-Process -Name 'NatureGoGarden' -ErrorAction SilentlyContinue
    if ($runningGarden) {
        $runningGarden | Stop-Process -Force
        $runningGarden | ForEach-Object { Wait-Process -Id $_.Id -Timeout 15 -ErrorAction SilentlyContinue }
    }
}

$fullProjectPath = [IO.Path]::GetFullPath($projectPath).TrimEnd('\') + '\'
$fullBuildFolder = [IO.Path]::GetFullPath($buildFolder)
if (-not $fullBuildFolder.StartsWith($fullProjectPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "빌드 출력 경로가 Unity 프로젝트 밖입니다: $fullBuildFolder"
}
if (Test-Path -LiteralPath $fullBuildFolder) {
    Remove-Item -LiteralPath $fullBuildFolder -Recurse -Force
}

$env:NATURE_GO_API_URL = $ApiBaseUrl.TrimEnd('/')
$logDir = Join-Path $repoRoot 'dist\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$unityLog = Join-Path $logDir 'unity-windows-release.log'

$unityArguments = @(
    '-batchmode',
    '-quit',
    '-projectPath', "`"$projectPath`"",
    '-executeMethod', 'PCGardenSceneBuilder.BuildWindowsRelease',
    '-logFile', "`"$unityLog`""
)
$unityProcess = Start-Process `
    -FilePath $unityPath `
    -ArgumentList $unityArguments `
    -WindowStyle Hidden `
    -Wait `
    -PassThru
if ($unityProcess.ExitCode -ne 0) {
    throw "Unity Windows 릴리스 빌드가 실패했습니다. 로그: $unityLog"
}

$exePath = Join-Path $buildFolder 'NatureGoGarden.exe'
if (-not (Test-Path -LiteralPath $exePath)) {
    throw "Unity 빌드 산출물을 찾을 수 없습니다: $exePath"
}

& $isccPath (Join-Path $PSScriptRoot 'NatureGoGarden.iss')
if ($LASTEXITCODE -ne 0) {
    throw 'Garden 설치 프로그램 제작이 실패했습니다.'
}

$installerPath = Join-Path $repoRoot 'dist\windows\NatureGoGarden-Setup-1.0.0.exe'
if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "설치 프로그램 산출물을 찾을 수 없습니다: $installerPath"
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath
Write-Host "완료: $installerPath"
Write-Host "SHA256: $($hash.Hash)"
