VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ThisWorkbook"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True

' ============================================================
' Central place to suppress "Calculation is incomplete" prompt
' ============================================================

Private Sub Workbook_Open()
    On Error Resume Next
    EnsureCalcMode       ' from modCalcGuard
    On Error GoTo 0
End Sub

Private Sub Workbook_BeforeSave(ByVal SaveAsUI As Boolean, Cancel As Boolean)
    On Error Resume Next
    EnsureCalcMode       ' in case some macro switched to Manual
    On Error GoTo 0
End Sub
