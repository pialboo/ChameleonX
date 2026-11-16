!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$INSTDIR\chameleon-backend.exe"
    !insertmacro CheckIfAppIsRunning "$INSTDIR\chameleon-backend.exe" "${PRODUCTNAME} 背景服務"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ${If} ${FileExists} "$INSTDIR\chameleon-backend.exe"
    !insertmacro CheckIfAppIsRunning "$INSTDIR\chameleon-backend.exe" "${PRODUCTNAME} 背景服務"
  ${EndIf}
!macroend
