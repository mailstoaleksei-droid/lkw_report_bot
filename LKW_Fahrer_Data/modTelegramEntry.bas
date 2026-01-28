Attribute VB_Name = "modTelegramEntry"
Option Explicit

' Writes outputs + errors into named ranges (NO MsgBox, NO Err.Raise)
Public Sub GenerateAndExportReport_FromParams()
    Dim oldCalc As XlCalculation
    On Error GoTo EH

    oldCalc = Application.Calculation

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    ' clear last error
    SafeSetNameValue "Report_LastError", ""

    Dim y As Long, w As Long
    y = CLng(ThisWorkbook.Names("Report_Year").RefersToRange.Value)
    w = CLng(ThisWorkbook.Names("Report_Week").RefersToRange.Value)

    ' 1) Build report (no UI)
    Report_Run_Bericht y, w

    ' 2) Export
    Dim outFolder As String, baseName As String
    outFolder = Environ$("TEMP")
    baseName = "Bericht_" & CStr(y) & "_KW" & Format$(w, "00")

    Dim xlsxPath As String, pdfPath As String
    Export_Bericht_ToFiles outFolder, baseName, xlsxPath, pdfPath

    SafeSetNameValue "Report_Out_XLSX", xlsxPath
    SafeSetNameValue "Report_Out_PDF", pdfPath

CleanExit:
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.DisplayAlerts = True
    Exit Sub

EH:
    ' Write error text for Python/Telegram (no popup)
    SafeSetNameValue "Report_LastError", "VBA ERROR: " & CStr(Err.Number) & " | " & Err.Description
    SafeSetNameValue "Report_Out_XLSX", ""
    SafeSetNameValue "Report_Out_PDF", ""
    Resume CleanExit
End Sub

Private Sub SafeSetNameValue(ByVal nm As String, ByVal v As Variant)
    On Error Resume Next
    ThisWorkbook.Names(nm).RefersToRange.Value = v
End Sub

