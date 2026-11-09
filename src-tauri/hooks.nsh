!macro NSIS_HOOK_PREINSTALL
  ; 檢查 chameleonx 或 chameleon-backend 是否正在執行 (全語言通用)
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "if (Get-Process chameleonx, chameleon-backend -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $0

  ${If} $0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "偵測到 ChameleonX 或其背景服務正在執行中。$\n$\n點選【確定】將自動為您關閉軟體並繼續安裝；$\n點選【取消】退出安裝。" IDOK kill_running_procs IDCANCEL abort_installation

    kill_running_procs:
      nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "Stop-Process -Name chameleonx, chameleon-backend -Force -ErrorAction SilentlyContinue"'
      Sleep 1200
      Goto preinstall_finish

    abort_installation:
      Abort "使用者已取消安裝。"

    preinstall_finish:
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "Stop-Process -Name chameleonx, chameleon-backend -Force -ErrorAction SilentlyContinue"'
  Sleep 500
!macroend
