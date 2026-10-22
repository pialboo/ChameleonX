# ChameleonX Kernel Auto-Downloader for Installer
param(
    [string]$TargetDir = "$env:APPDATA\ChameleonX\data\kernel"
)

$Host.UI.RawUI.WindowTitle = "ChameleonX — 正在下載指紋核心..."
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ChameleonX 指紋瀏覽器 — 下載最新底層核心" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {}

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$tempZip = Join-Path $env:TEMP "chameleonx_kernel_installer.zip"
if (Test-Path $tempZip) {
    Remove-Item -Force $tempZip -ErrorAction SilentlyContinue
}

Write-Host "正在查詢 GitHub 官方最新 Fingerprint-Chromium Release..." -ForegroundColor Yellow

$downloadUrl = $null
$versionTag = "latest"

try {
    $apiUrl = "https://api.github.com/repos/adryfish/fingerprint-chromium/releases/latest"
    $headers = @{ "User-Agent" = "ChameleonX-Installer" }
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 15
    $versionTag = $release.tag_name
    $asset = $release.assets | Where-Object { $_.name -like "*windows*.zip" } | Select-Object -First 1
    if ($asset) {
        $downloadUrl = $asset.browser_download_url
        Write-Host "已找到最新核心版本: $versionTag ($($asset.name))" -ForegroundColor Green
    }
} catch {
    Write-Host "GitHub API 查詢超時或受限，嘗試使用備用直鏈..." -ForegroundColor DarkYellow
}

if (-not $downloadUrl) {
    # 備用已知最新 release 直鏈
    $downloadUrl = "https://github.com/adryfish/fingerprint-chromium/releases/download/150.0.7871.186-1.1/ungoogled-chromium_150.0.7871.186-1.1_windows_x64.zip"
}

Write-Host "開始下載核心 (約 150MB)，請稍候..." -ForegroundColor Cyan
Write-Host "下載來源: $downloadUrl" -ForegroundColor Gray
Write-Host ""

$downloadSuccess = $false

# 優先使用 Windows 內建 curl.exe 顯示進度條
$curlExe = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curlExe) {
    & curl.exe -L $downloadUrl -o $tempZip --progress-bar
    if ($LASTEXITCODE -eq 0 -and (Test-Path $tempZip) -and (Get-Item $tempZip).Length -gt 10000000) {
        $downloadSuccess = $true
    }
}

if (-not $downloadSuccess) {
    try {
        Write-Host "使用內建模組下載中..." -ForegroundColor Gray
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($downloadUrl, $tempZip)
        if ((Test-Path $tempZip) -and (Get-Item $tempZip).Length -gt 10000000) {
            $downloadSuccess = $true
        }
    } catch {
        Write-Host "下載失敗: $($_.Exception.Message)" -ForegroundColor Red
    }
}

if ($downloadSuccess) {
    Write-Host ""
    Write-Host "下載完成！正在解壓縮核心至本地資料夾..." -ForegroundColor Green
    Write-Host "目標路徑: $TargetDir" -ForegroundColor Gray

    try {
        Expand-Archive -Path $tempZip -DestinationPath $TargetDir -Force
        Remove-Item -Force $tempZip -ErrorAction SilentlyContinue
        Write-Host "核心安裝成功！" -ForegroundColor Green
    } catch {
        Write-Host "解壓縮失敗: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "⚠️ 核心下載未完成 (可能因網路受限或 GitHub 連線逾時)。" -ForegroundColor Yellow
    Write-Host "不必擔心，ChameleonX 本體已成功安裝！" -ForegroundColor Green
    Write-Host "您隨時可以在開啟 ChameleonX 後，至「核心設定」再次點擊下載。" -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "即將完成安裝精靈..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
exit 0
