!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Widget"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "My Widget"
!macroend
