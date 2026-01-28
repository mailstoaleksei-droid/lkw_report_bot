Attribute VB_Name = "modCalcGuard"
Option Explicit

' ============================================================
' Suppress the prompt "Calculation is incomplete. Recalculate before saving?"
' Steps:
' 1) On open: disable CalculateBeforeSave and ensure Automatic mode.
' 2) Provide a helper macro for manual full recalc + save without prompts.
' ============================================================

Public Sub EnsureCalcMode()
    On Error Resume Next
    Application.Calculation = xlCalculationAutomatic
    Application.CalculateBeforeSave = False
    On Error GoTo 0
End Sub

' Auto-run on workbook open
Public Sub Auto_Open()
    EnsureCalcMode
End Sub

' Manual full recalc + save (attach to a button/hotkey if needed)
Public Sub RecalcAndSave()
    On Error GoTo EH
    Application.ScreenUpdating = False
    Application.CalculateBeforeSave = False
    Application.CalculateFullRebuild          ' full rebuild of all formulas
    ThisWorkbook.Save
CleanExit:
    Application.ScreenUpdating = True
    Exit Sub
EH:
    MsgBox "RecalcAndSave error: " & Err.Number & " - " & Err.Description, vbExclamation
    Resume CleanExit
End Sub
