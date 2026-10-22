!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "【ChameleonX 核心配置選項】$\r$\n$\r$\n是否在安裝時一併從網路下載最新版 Fingerprint-Chromium 防關聯核心？$\r$\n$\r$\n• 點選【是】：自動下載並配置最新核心 (約 150MB)，安裝完成後即可開箱即用。$\r$\n• 點選【否】：跳過下載，您隨時可在軟體開啟後手動下載。" IDYES downloadKernel IDNO skipKernel

  downloadKernel:
    DetailPrint "正在從 GitHub 下載最新版 Fingerprint-Chromium 核心..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\scripts\download_kernel_installer.ps1"'
    Goto endKernel

  skipKernel:
    DetailPrint "已跳過核心下載，使用者可於軟體內手動安裝。"

  endKernel:
!macroend
