Unicode True
RequestExecutionLevel user

!include "MUI2.nsh"

!ifndef VERSION
!define VERSION "1.0.8"
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
InstallDirRegKey HKCU "Software\BetaMusicPlayerQt" "InstallDir"
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
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*.*"
  WriteRegStr HKCU "Software\BetaMusicPlayerQt" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Beta Music Player"
  CreateShortcut "$SMPROGRAMS\Beta Music Player\Beta Music Player.lnk" "$INSTDIR\BetaMusicPlayer.exe"
  CreateShortcut "$SMPROGRAMS\Beta Music Player\卸载.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Beta Music Player\Beta Music Player.lnk"
  Delete "$SMPROGRAMS\Beta Music Player\卸载.lnk"
  RMDir "$SMPROGRAMS\Beta Music Player"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\BetaMusicPlayerQt"
SectionEnd
