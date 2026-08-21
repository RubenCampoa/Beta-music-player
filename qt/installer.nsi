Unicode true
RequestExecutionLevel user

!include "MUI2.nsh"
!include "x64.nsh"

!ifndef VERSION
!define VERSION "1.0.9"
!endif
!ifndef SOURCE_DIR
!define SOURCE_DIR "dist\BetaMusicPlayer"
!endif
!ifndef OUTPUT_FILE
!define OUTPUT_FILE "dist\Beta Music Player Setup.exe"
!endif

Name "Beta Music Player"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\Beta Music Player"
InstallDirRegKey HKCU "Software\BetaMusicPlayer" "InstallDir"
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "app.ico"
!define MUI_UNICON "app.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\BetaMusicPlayer.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "Beta Music Player" SecMain
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"
  WriteRegStr HKCU "Software\BetaMusicPlayer" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Create Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\Beta Music Player"
  CreateShortcut "$SMPROGRAMS\Beta Music Player\Beta Music Player.lnk" "$INSTDIR\BetaMusicPlayer.exe" "" "$INSTDIR\BetaMusicPlayer.exe" 0
  CreateShortcut "$SMPROGRAMS\Beta Music Player\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
  
  ; Create Desktop Shortcut
  CreateShortcut "$DESKTOP\Beta Music Player.lnk" "$INSTDIR\BetaMusicPlayer.exe" "" "$INSTDIR\BetaMusicPlayer.exe" 0

  ; Register in Windows Control Panel Apps & Features
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "DisplayName" "Beta Music Player"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "DisplayIcon" "$INSTDIR\BetaMusicPlayer.exe,0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "Publisher" "Beta Music Player"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "URLInfoAbout" "https://github.com/RubenCampoa/Beta-music-player"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "EstimatedSize" 205000
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  ; Delete Shortcuts
  Delete "$DESKTOP\Beta Music Player.lnk"
  Delete "$SMPROGRAMS\Beta Music Player\Beta Music Player.lnk"
  Delete "$SMPROGRAMS\Beta Music Player\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Beta Music Player"
  
  ; Delete Program Files
  RMDir /r "$INSTDIR"
  
  ; Delete Registry Keys
  DeleteRegKey HKCU "Software\BetaMusicPlayer"
  DeleteRegKey HKCU "Software\BetaMusicPlayerQt"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayer"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BetaMusicPlayerQt"
SectionEnd
