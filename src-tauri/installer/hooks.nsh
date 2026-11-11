; Installer hooks for Arcadia (formerly Alethe).
;
; The NSIS installer keys the install folder, the Add/Remove Programs entry and the shortcuts on
; the product name. Renaming the product from Alethe to Arcadia would therefore install a second
; copy next to the old one. This hook removes the old install first.
;
; The old uninstaller runs silently and WITHOUT the "delete app data" choice, so projects,
; profiles and settings (kept in the com.kc1t.alethe folders, keyed by the unchanged bundle
; identifier) are left alone. It also removes the old shortcuts and the old uninstall entry; the
; new installer creates its own shortcuts afterwards.

Var LegacyUninstaller
Var LegacyDir
Var LegacyExitCode

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $LegacyUninstaller HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Alethe" "UninstallString"
  ReadRegStr $LegacyDir HKCU "Software\${MANUFACTURER}\Alethe" ""
  ${If} $LegacyUninstaller != ""
  ${AndIf} $LegacyDir != ""
  ${AndIf} $LegacyDir != $INSTDIR
  ${AndIf} ${FileExists} "$LegacyDir\uninstall.exe"
    ; _?= keeps the uninstaller in place so ExecWait really waits for it.
    ExecWait '$LegacyUninstaller /S _?=$LegacyDir' $LegacyExitCode
    ${If} $LegacyExitCode = 0
      Delete "$LegacyDir\uninstall.exe"
      ; Only removes the folder when it is empty: the command-line shim in bin\ stays.
      RMDir "$LegacyDir"
    ${EndIf}
  ${EndIf}
!macroend
