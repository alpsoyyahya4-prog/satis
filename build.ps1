# Builds Satis.apk with the Android SDK tools only (no Gradle, nothing downloaded).
#   powershell -ExecutionPolicy Bypass -File build.ps1            -> Satis.apk
#   ... -File build.ps1 -WebOnly                                  -> build\web\index.html only
#   ... -File build.ps1 -Install                                  -> also installs on the USB-connected phone
# Raise -VersionCode for every new release; keep android\satis.keystore, updates must be signed with it.
param([switch]$WebOnly, [switch]$Install, [int]$VersionCode = 1, [string]$VersionName = '1.0')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$bt = Join-Path $sdk 'build-tools\36.0.0'
$androidJars = @(
    (Join-Path $sdk 'platforms\android-37.2\android.jar'),
    (Join-Path $sdk 'platforms\android-37.0\android.jar'),
    (Join-Path $sdk 'platforms\android-36\android.jar')
)
$androidJar = $androidJars | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $androidJar) { throw 'Android SDK platform 37.2, 37.0 veya 36 bulunamadı.' }
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$out = Join-Path $root 'build'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Run([string]$exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed (exit $LASTEXITCODE)" }
}

# 1) web app -> build\web\index.html (this folder becomes the APK's assets)
$web = Join-Path $root 'web'
$webOut = Join-Path $out 'web'
if (Test-Path $webOut) { Remove-Item $webOut -Recurse -Force }
New-Item -ItemType Directory -Force $webOut | Out-Null
$sb = New-Object System.Text.StringBuilder
foreach ($p in '00-head.html', '01-style-a.html', '02-style-b.html') { [void]$sb.Append([IO.File]::ReadAllText((Join-Path $web $p))) }
[void]$sb.Append("</head>`n<body>`n")
[void]$sb.Append([IO.File]::ReadAllText((Join-Path $web '03-markup.html')))
[void]$sb.Append("<script>`n")
foreach ($p in '04-core.js', '05-views.js', '06-settings.js', '07-forms.js') { [void]$sb.Append([IO.File]::ReadAllText((Join-Path $web $p))) }
[void]$sb.Append("</script>`n</body>`n</html>`n")
[IO.File]::WriteAllText((Join-Path $webOut 'index.html'), $sb.ToString(), $utf8)
Write-Host "web  -> $webOut\index.html"
if ($WebOnly) { return }

# 2) resources + manifest + assets
$app = Join-Path $root 'android'
$apkDir = Join-Path $out 'apk'
if (Test-Path $apkDir) { Remove-Item $apkDir -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $apkDir 'classes') | Out-Null
Run "$bt\aapt2.exe" @('compile', '--dir', "$app\res", '-o', "$apkDir\res.zip")
Run "$bt\aapt2.exe" @('link', '-o', "$apkDir\base.apk", '-I', $androidJar, '--manifest', "$app\AndroidManifest.xml",
    '-A', $webOut, "$apkDir\res.zip", '--min-sdk-version', '26', '--target-sdk-version', '37',
    '--version-code', "$VersionCode", '--version-name', $VersionName)

# 3) java -> dex
$srcs = @(Get-ChildItem "$app\src" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
Run 'javac' (@('--release', '11', '-encoding', 'UTF-8', '-nowarn', '-cp', $androidJar, '-d', "$apkDir\classes") + $srcs)
$classes = @(Get-ChildItem "$apkDir\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
Run "$bt\d8.bat" (@('--release', '--min-api', '26', '--lib', $androidJar, '--output', $apkDir) + $classes)

# 4) package, align, sign
Run 'java' @("$root\tools\AddDex.java", "$apkDir\base.apk", "$apkDir\unaligned.apk", "$apkDir\classes.dex")
Run "$bt\zipalign.exe" @('-p', '-f', '4', "$apkDir\unaligned.apk", "$apkDir\aligned.apk")
$ks = Join-Path $app 'satis.keystore'
if (-not (Test-Path $ks)) {
    Run 'keytool' @('-genkeypair', '-keystore', $ks, '-alias', 'satis', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '36500',
        '-storepass', 'satis-app', '-keypass', 'satis-app', '-dname', 'CN=Satis, O=Satis, C=TR')
}
$apk = Join-Path $root 'Satis.apk'
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-pass', 'pass:satis-app', '--key-pass', 'pass:satis-app', '--out', $apk, "$apkDir\aligned.apk")
Run "$bt\apksigner.bat" @('verify', $apk)
Write-Host ("apk  -> {0} ({1} KB)" -f $apk, [math]::Round((Get-Item $apk).Length / 1KB))

if ($Install) { Run "$sdk\platform-tools\adb.exe" @('install', '-r', $apk) }
