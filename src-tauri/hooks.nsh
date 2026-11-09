!macro NSIS_HOOK_PREINSTALL
  ; 檢查 chameleonx.exe 或 chameleon-backend.exe 是否正在執行
  nsExec::Exec 'cmd /c "tasklist /FI \"IMAGENAME eq chameleonx.exe\" | find /i \"chameleonx.exe\""'
  Pop $0
  nsExec::Exec 'cmd /c "tasklist /FI \"IMAGENAME eq chameleon-backend.exe\" | find /i \"chameleon-backend.exe\""'
  Pop $1

  ${If} $0 == 0
  ${OrIf} $1 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "偵測到 ChameleonX 或其背景服務正在執行中。$\n$\n點選【確定】將自動為您關閉軟體並繼續安裝；$\n點選【取消】退出安裝。" IDOK kill_running_procs IDCANCEL abort_installation

    kill_running_procs:
      nsExec::Exec 'taskkill /F /IM chameleonx.exe /T'
      nsExec::Exec 'taskkill /F /IM chameleon-backend.exe /T'
      Sleep 1000
      Goto preinstall_finish

    abort_installation:
      Abort "使用者已取消安裝。"

    preinstall_finish:
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM chameleonx.exe /T'
  nsExec::Exec 'taskkill /F /IM chameleon-backend.exe /T'
  Sleep 500
!macroend
