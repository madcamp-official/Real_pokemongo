param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$appPath = Join-Path $repoRoot 'app'
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$androidHome = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} else {
    Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

if (-not (Test-Path -LiteralPath (Join-Path $javaHome 'bin\java.exe'))) {
    throw "Android Studio JBR을 찾을 수 없습니다: $javaHome"
}
if (-not (Test-Path -LiteralPath $androidHome)) {
    throw "Android SDK를 찾을 수 없습니다: $androidHome"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:NODE_ENV = 'production'
$env:EXPO_PUBLIC_API_BASE_URL = $ApiBaseUrl.TrimEnd('/')

Push-Location $appPath
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci가 실패했습니다.' }

    npx expo prebuild --platform android --clean --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo Android prebuild가 실패했습니다.' }

    # Expo가 생성한 기본값은 이 프로젝트의 네이티브 모듈을 빌드하기에 Metaspace가 부족하다.
    # 내부 배포 단말은 arm64이므로 불필요한 에뮬레이터 ABI도 제외한다.
    $gradlePropertiesPath = Join-Path $appPath 'android\gradle.properties'
    $gradleProperties = Get-Content -LiteralPath $gradlePropertiesPath -Raw
    $gradleProperties = $gradleProperties `
        -replace '(?m)^org\.gradle\.jvmargs=.*$', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8'
    $gradleProperties = $gradleProperties `
        -replace '(?m)^reactNativeArchitectures=.*$', 'reactNativeArchitectures=arm64-v8a'
    [IO.File]::WriteAllText(
        $gradlePropertiesPath,
        $gradleProperties,
        [Text.UTF8Encoding]::new($false)
    )

    & (Join-Path $appPath 'android\gradlew.bat') `
        -p (Join-Path $appPath 'android') `
        ':app:assembleRelease' `
        '--no-daemon'
    if ($LASTEXITCODE -ne 0) { throw 'Android Release APK 빌드가 실패했습니다.' }
} finally {
    Pop-Location
}

$sourceApk = Join-Path $appPath 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $sourceApk)) {
    throw "APK 산출물을 찾을 수 없습니다: $sourceApk"
}

$buildTools = Get-ChildItem (Join-Path $androidHome 'build-tools') -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1
if (-not $buildTools) { throw 'Android build-tools를 찾을 수 없습니다.' }
$apkSigner = Join-Path $buildTools.FullName 'apksigner.bat'

& $apkSigner verify --verbose $sourceApk
if ($LASTEXITCODE -ne 0) { throw 'APK 서명 검증이 실패했습니다.' }

$outputDir = Join-Path $repoRoot 'dist\android'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$outputApk = Join-Path $outputDir 'NatureGo-1.0.0-internal-arm64.apk'
Copy-Item -LiteralPath $sourceApk -Destination $outputApk -Force

$hash = Get-FileHash -LiteralPath $outputApk -Algorithm SHA256
Write-Host "완료: $outputApk"
Write-Host "SHA256: $($hash.Hash)"
