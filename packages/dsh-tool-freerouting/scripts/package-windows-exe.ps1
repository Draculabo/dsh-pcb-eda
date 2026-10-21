<#
.SYNOPSIS
    Package the bundled FreeRouting engine as a self-contained Windows executable.

.DESCRIPTION
    Wraps bundled/freerouting.jar with jpackage so the result runs without a
    system Java installation:

      app-image (default) -> dist/freerouting-win-x64.zip
                             FreeRouting/FreeRouting.exe + FreeRouting/runtime/
                             FreeRouting/app/freerouting.jar
      installer           -> dist/FreeRouting-<version>.exe  (WiX 3.14 required)

    The app-image ZIP is the artifact consumed by kicad-win-builder:
      build-configs/kicad-hq.json  sources.freerouting / sources.freerouting-sha256
      build.ps1                    Start-Prepare-Package -> <stage>\bin\freerouting

    The jpackage launcher forwards its command line verbatim to
    app.freerouting.Freerouting and stays the JVM process itself, so it remains a
    drop-in replacement for the current spawn:
      java -Xmx2G -jar freerouting.jar --user_data_path=<dir> --gui.enabled=false ...

.PARAMETER Type
    app-image (default), suitable for bundling into the KiCad installer, or
    installer for a single-file .exe installer (do not nest it in another
    installer).

.PARAMETER Jdk
    Full JDK 25 directory containing bin\jpackage.exe. Defaults to $env:JAVA_HOME,
    then jpackage.exe on PATH.

.PARAMETER RuntimeImage
    Java runtime image placed next to the app. Defaults to bundled/jre, the
    pinned Temurin JRE recorded in bundled/runtime.lock.json; jlink runs only
    when that directory is absent or -ForceJlink is used.

.PARAMETER SmokeTest
    Start the packaged engine headless on a free loopback port, poll
    /v1/system/status, then stop it.

.PARAMETER ForceJlink
    Ignore bundled/jre and let jpackage derive the runtime with jlink. Use it
    when jpackage rejects the pinned runtime image; a jlink runtime can miss
    reflection-only modules, so validate routing afterwards.

.PARAMETER SkipJarVerification
    Package the JAR even when it does not match freerouting.build.json
    (output_sha256). Only for local experiments.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows-exe.ps1 -SmokeTest

.NOTES
    Requires the verified engine JAR: run `pnpm run prepare:dependencies` first.
    Windows x64 only; the JAR targets Java 25 (`java_release` in
    bundled/freerouting.build.json).
#>
[CmdletBinding()]
param(
    [ValidateSet('app-image', 'installer', 'portable')]
    [string]$Type = 'app-image',
    [string]$Jdk = '',
    [string]$JarPath = '',
    [string]$RuntimeImage = '',
    [string]$IconPath = '',
    [string]$AppVersion = '',
    [string[]]$JavaOptions = @('-Xmx2G'),
    [string]$OutputDir = '',
    [switch]$Console,
    [switch]$KeepModuleInfo,
    [switch]$ForceJlink,
    [switch]$SkipJarVerification,
    [switch]$SkipZip,
    [switch]$SmokeTest,
    [int]$SmokeTimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-Step([string]$message) {
    Write-Host "==> $message" -ForegroundColor Yellow
}

function Write-Ok([string]$message) {
    Write-Host "    $message" -ForegroundColor DarkGray
}

function Fail([string]$message) {
    Write-Host "ERROR: $message" -ForegroundColor Red
    exit 1
}

function Get-Sha256([string]$path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
}

function Build-PortableLauncher([string]$PayloadZip, [string]$IconPath, [string]$OutputDir) {
    $csc = [System.IO.Path]::Combine($env:WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
    if (-not (Test-Path -LiteralPath $csc)) {
        Fail 'csc.exe (.NET Framework 4) not found; the portable launcher needs it'
    }
    $source = [System.IO.Path]::Combine($root, 'packaging', 'launcher', 'freerouting-launcher.cs')
    if (-not (Test-Path -LiteralPath $source)) {
        Fail "launcher source missing: $source"
    }

    # Cache directory name is derived from the payload hash, so a rebuild never
    # reuses a half-extracted runtime from an older payload.
    $hash = Get-Sha256 $PayloadZip
    $tag = "$appVersion-$($hash.Substring(0, 8))"
    $generated = [System.IO.Path]::Combine($cacheRoot, 'launcher', 'PayloadInfo.g.cs')
    New-Item -ItemType Directory -Path (Split-Path -Parent $generated) -Force | Out-Null
    Set-Content -LiteralPath $generated -Encoding ASCII -Value @(
        'internal static class PayloadInfo',
        '{',
        "    public const string Tag = ""$tag"";",
        "    public const string ZipSha256 = ""$hash"";",
        '}'
    )

    $target = [System.IO.Path]::Combine($OutputDir, 'freerouting.exe')
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Force
    }

    $framework = Split-Path -Parent $csc
    $cscArgs = @(
        '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/debug-',
        "/out:$target",
        "/resource:$PayloadZip,payload.zip",
        "/r:$framework\System.IO.Compression.dll",
        "/r:$framework\System.IO.Compression.FileSystem.dll"
    )
    if ($IconPath) {
        $cscArgs = @("/win32icon:$IconPath") + $cscArgs
    }
    $cscArgs += @($source, $generated)

    Write-Step 'Compiling dist\freerouting.exe (single-file wrapper)'
    & $csc @cscArgs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) {
        Fail "csc failed with exit code $LASTEXITCODE"
    }
    $sizeMb = [math]::Round((Get-Item -LiteralPath $target).Length / 1MB, 1)
    Write-Ok "portable launcher: $target ($sizeMb MB)"
    return $target
}

function Resolve-Jdk([string]$explicit) {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($explicit) {
        $candidates.Add($explicit)
    }
    if ($env:JAVA_HOME) {
        $candidates.Add($env:JAVA_HOME)
    }
    $onPath = Get-Command 'jpackage.exe' -ErrorAction SilentlyContinue
    if ($onPath) {
        $candidates.Add((Split-Path -Parent (Split-Path -Parent $onPath.Source)))
    }
    foreach ($candidate in $candidates) {
        $jpackage = [System.IO.Path]::Combine($candidate, 'bin', 'jpackage.exe')
        if (Test-Path -LiteralPath $jpackage) {
            return $candidate
        }
    }
    Fail 'jpackage.exe not found. Pass -Jdk <full JDK 25 directory> or set JAVA_HOME.'
}

function Resolve-AppVersion([string]$requested, [string]$buildJsonPath) {
    $version = $requested
    if (-not $version -and (Test-Path -LiteralPath $buildJsonPath)) {
        $build = Get-Content -LiteralPath $buildJsonPath -Raw | ConvertFrom-Json
        $source = $build.PSObject.Properties['source']
        if ($source -and $source.Value.PSObject.Properties['version']) {
            $version = [string]$source.Value.version
        }
    }
    if (-not $version) {
        Fail 'Unknown engine version. Pass -AppVersion or provide bundled/freerouting.build.json.'
    }
    $numeric = [regex]::Match($version, '^\d+(\.\d+){0,2}').Value
    if (-not $numeric) {
        Fail "jpackage requires a numeric app version; '$version' is not usable."
    }
    if ($numeric -ne $version) {
        Write-Ok "app version '$version' reduced to '$numeric' for jpackage"
    }
    return $numeric
}

if ($env:OS -ne 'Windows_NT') {
    Fail 'This script packages a Windows app image; run it on Windows x64.'
}

$root = Split-Path -Parent $PSScriptRoot
$buildJsonPath = [System.IO.Path]::Combine($root, 'bundled', 'freerouting.build.json')

if (-not $JarPath) {
    $JarPath = [System.IO.Path]::Combine($root, 'bundled', 'freerouting.jar')
}
if (-not (Test-Path -LiteralPath $JarPath)) {
    Fail "Engine JAR not found: $JarPath. Run 'pnpm run prepare:dependencies' first."
}
$JarPath = (Resolve-Path -LiteralPath $JarPath).Path

if (-not $SkipJarVerification -and (Test-Path -LiteralPath $buildJsonPath)) {
    $build = Get-Content -LiteralPath $buildJsonPath -Raw | ConvertFrom-Json
    $expected = $build.PSObject.Properties['output_sha256']
    if ($expected) {
        $actual = Get-Sha256 $JarPath
        if ($actual -ne ([string]$expected.Value).ToLowerInvariant()) {
            Fail 'bundled/freerouting.jar does not match freerouting.build.json (output_sha256). Rebuild it or pass -SkipJarVerification.'
        }
        Write-Ok 'engine JAR matches freerouting.build.json'
    }
}

$jdkPath = Resolve-Jdk $Jdk
$jpackage = [System.IO.Path]::Combine($jdkPath, 'bin', 'jpackage.exe')
Write-Ok "jpackage: $jpackage"
try {
    $jdkVersion = (& ([System.IO.Path]::Combine($jdkPath, 'bin', 'java.exe')) -version 2>&1 | Out-String).Trim()
    if ($jdkVersion) {
        Write-Ok $jdkVersion.Split("`n")[0]
    }
} catch {
    Write-Ok 'unable to read the JDK version (continuing)'
}

$appVersion = Resolve-AppVersion $AppVersion $buildJsonPath

if (-not $RuntimeImage -and -not $ForceJlink) {
    # bundled/jre is the pinned runtime (hashes recorded in bundled/runtime.lock.json).
    $bundledJre = [System.IO.Path]::Combine($root, 'bundled', 'jre')
    if (Test-Path -LiteralPath $bundledJre) {
        $RuntimeImage = $bundledJre
    }
}
if ($RuntimeImage) {
    if (-not (Test-Path -LiteralPath ([System.IO.Path]::Combine($RuntimeImage, 'bin', 'java.exe')))) {
        Fail "Runtime image has no bin\java.exe: $RuntimeImage"
    }
    if (-not (Test-Path -LiteralPath ([System.IO.Path]::Combine($RuntimeImage, 'lib', 'modules')))) {
        Fail "Runtime image has no lib\modules (not a jlink image): $RuntimeImage"
    }
    $RuntimeImage = (Resolve-Path -LiteralPath $RuntimeImage).Path
    Write-Ok "runtime image: $RuntimeImage"
} else {
    Write-Ok 'runtime image: generated by jlink'
}

$cacheRoot = [System.IO.Path]::Combine($root, '.build-cache', 'jpackage')
$inputDir = [System.IO.Path]::Combine($cacheRoot, 'input')
$outDir = [System.IO.Path]::Combine($cacheRoot, 'out')
if (Test-Path -LiteralPath $inputDir) {
    Remove-Item -LiteralPath $inputDir -Recurse -Force
}
if (Test-Path -LiteralPath $outDir) {
    Remove-Item -LiteralPath $outDir -Recurse -Force
}
New-Item -ItemType Directory -Path $inputDir -Force | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$stagedJar = [System.IO.Path]::Combine($inputDir, 'freerouting.jar')
Copy-Item -LiteralPath $JarPath -Destination $stagedJar -Force
if (-not $KeepModuleInfo) {
    # The verified JAR carries the upstream module-info.class. Keeping it makes
    # jpackage/jdeps resolve a module descriptor for a shaded, non-modular
    # artifact; the launcher works on the class path, so drop it from the copy.
    $archive = [System.IO.Compression.ZipFile]::Open($stagedJar, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        $entry = $archive.GetEntry('module-info.class')
        if ($entry) {
            $entry.Delete()
            Write-Ok 'module-info.class removed from the packaged copy'
        }
    } finally {
        $archive.Dispose()
    }
}

$icon = $IconPath
if (-not $icon) {
    $packagingIcon = [System.IO.Path]::Combine($root, 'packaging', 'freerouting.ico')
    if (Test-Path -LiteralPath $packagingIcon) {
        $icon = $packagingIcon
    } else {
        $archive = [System.IO.Compression.ZipFile]::OpenRead($JarPath)
        try {
            $entry = $archive.GetEntry('freerouting_icon_256x256_v3.ico')
            if ($entry) {
                $icon = [System.IO.Path]::Combine($cacheRoot, 'freerouting.ico')
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $icon, $true)
                Write-Ok "icon extracted from the JAR: $icon"
            }
        } finally {
            $archive.Dispose()
        }
    }
}
if ($icon) {
    $icon = (Resolve-Path -LiteralPath $icon).Path
}

# jpackage asks for the artifact type by platform name: on Windows the installer
# type is `exe` (or `msi`); `app-image` is the plain directory layout.
$jpackageType = if ($Type -eq 'installer') { 'exe' } else { 'app-image' }

$jpackageArgs = @(
    '--type', $jpackageType,
    '--name', 'FreeRouting',
    '--app-version', $appVersion,
    '--vendor', 'Huaqiu Electronics',
    '--description', 'FreeRouting autorouter',
    '--input', $inputDir,
    '--main-jar', 'freerouting.jar',
    '--main-class', 'app.freerouting.Freerouting',
    '--dest', $outDir
)
if ($RuntimeImage) {
    $jpackageArgs += @('--runtime-image', $RuntimeImage)
}
if ($icon) {
    $jpackageArgs += @('--icon', $icon)
}
foreach ($option in $JavaOptions) {
    if ($option) {
        $jpackageArgs += @('--java-options', $option)
    }
}
if ($Console) {
    $jpackageArgs += '--win-console'
}
if ($Type -eq 'installer') {
    $jpackageArgs += @('--win-dir-chooser', '--win-menu', '--win-shortcut')
    $wix = @(@('candle.exe', 'light.exe') | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) })
    if ($wix.Count -gt 0) {
        Write-Host "WARNING: WiX 3.14 not on PATH ($($wix -join ', ')); jpackage 'installer' needs it." -ForegroundColor Yellow
    }
}

Write-Step "Creating $Type with jpackage (FreeRouting $appVersion)"
Write-Ok ("jpackage " + ($jpackageArgs -join ' '))
& $jpackage @jpackageArgs
if ($LASTEXITCODE -ne 0) {
    Fail "jpackage failed with exit code $LASTEXITCODE"
}

if (-not $OutputDir) {
    $OutputDir = [System.IO.Path]::Combine($root, 'dist')
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$artifact = $null
if ($Type -eq 'installer') {
    $installer = Get-ChildItem -LiteralPath $outDir -Filter '*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) {
        Fail "jpackage produced no installer in $outDir"
    }
    $artifact = [System.IO.Path]::Combine($OutputDir, $installer.Name)
    Copy-Item -LiteralPath $installer.FullName -Destination $artifact -Force
} else {
    $appDir = [System.IO.Path]::Combine($outDir, 'FreeRouting')
    $appExe = [System.IO.Path]::Combine($appDir, 'FreeRouting.exe')
    if (-not (Test-Path -LiteralPath $appExe)) {
        Fail "jpackage produced no app image executable: $appExe"
    }
    Write-Ok "app image: $appDir"

    if (-not $SkipZip) {
        $artifact = [System.IO.Path]::Combine($OutputDir, 'freerouting-win-x64.zip')
        if (Test-Path -LiteralPath $artifact) {
            Remove-Item -LiteralPath $artifact -Force
        }
        Write-Step 'Creating dist\freerouting-win-x64.zip'
        $sevenZip = Get-Command '7za.exe' -ErrorAction SilentlyContinue
        if (-not $sevenZip) {
            $sevenZip = Get-Command '7z.exe' -ErrorAction SilentlyContinue
        }
        if ($sevenZip) {
            & $sevenZip.Source 'a' '-tzip' '-mx=9' $artifact $appDir | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Fail "7-Zip failed with exit code $LASTEXITCODE"
            }
        } else {
            Compress-Archive -LiteralPath $appDir -DestinationPath $artifact -CompressionLevel Optimal
        }
    }

    if ($Type -eq 'portable') {
        if (-not $artifact) {
            Fail 'portable needs the payload ZIP; do not combine it with -SkipZip'
        }
        $payloadZip = $artifact
        # The ZIP stays the published KiCad asset; keep its checksum next to it.
        Set-Content -LiteralPath "$payloadZip.sha256" -Encoding ASCII -Value (
            '{0}  {1}' -f (Get-Sha256 $payloadZip), (Split-Path -Leaf $payloadZip)
        )
        $artifact = Build-PortableLauncher -PayloadZip $payloadZip -IconPath $icon -OutputDir $OutputDir
    }
}

if ($SmokeTest) {
    $appExe = if ($Type -eq 'portable') { $artifact } else { [System.IO.Path]::Combine($outDir, 'FreeRouting', 'FreeRouting.exe') }
    if (-not (Test-Path -LiteralPath $appExe)) {
        Fail 'SmokeTest needs an app image or the portable launcher.'
    }
    Write-Step 'Smoke test: headless engine on a free loopback port'
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()

    $userData = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'freerouting-exe-smoke-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $userData -Force | Out-Null
    $baseUrl = "http://127.0.0.1:$port"
    $config = [ordered]@{
        version = $appVersion
        api_server = [ordered]@{
            enabled = $true
            http_allowed = $true
            endpoints = @($baseUrl)
            authentication = [ordered]@{ enabled = $false }
        }
        gui = [ordered]@{ enabled = $false }
        profile = [ordered]@{ allow_telemetry = $false; allow_contact = $false }
        usage_and_diagnostic_data = [ordered]@{ disable_analytics = $true }
    } | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath ([System.IO.Path]::Combine($userData, 'freerouting.json')) -Value $config -Encoding ASCII

    $engine = $null
    try {
        $engine = Start-Process -FilePath $appExe -PassThru -ArgumentList (
            '--user_data_path="{0}" --gui.enabled=false --api_server.enabled=true --api_server.http_allowed=true' -f $userData
        )
        $deadline = (Get-Date).AddSeconds($SmokeTimeoutSeconds)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            if ($engine.HasExited) {
                Fail "Engine exited during startup with code $($engine.ExitCode)"
            }
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/v1/system/status" -TimeoutSec 5 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $ready = $true
                    break
                }
            } catch {
                Start-Sleep -Milliseconds 1000
            }
        }
        if (-not $ready) {
            Fail "Engine did not answer /v1/system/status within $SmokeTimeoutSeconds seconds"
        }
        Write-Ok "engine answered on $baseUrl/v1/system/status"
    } finally {
        if ($engine -and -not $engine.HasExited) {
            Stop-Process -Id $engine.Id -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $userData -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($artifact) {
    $hash = Get-Sha256 $artifact
    $hashFile = "$artifact.sha256"
    Set-Content -LiteralPath $hashFile -Value "$hash  $(Split-Path -Leaf $artifact)" -Encoding ASCII
    $sizeMb = [math]::Round((Get-Item -LiteralPath $artifact).Length / 1MB, 1)
    Write-Host ''
    Write-Host 'Package complete' -ForegroundColor Green
    Write-Host "  artifact : $artifact ($sizeMb MB)"
    Write-Host "  sha256   : $hash"
    Write-Host "  checksum : $hashFile"
    Write-Host ''
    if ($Type -eq 'app-image') {
        Write-Host 'kicad-win-builder/build-configs/kicad-hq.json:'
        Write-Host ('  "freerouting":        {{ "ref": "freerouting-{0}" }},' -f $appVersion)
        Write-Host ('  "freerouting-sha256": {{ "ref": "{0}" }}' -f $hash)
    }
}
