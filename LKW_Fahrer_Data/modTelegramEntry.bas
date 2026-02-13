Attribute VB_Name = "modTelegramEntry"
Option Explicit

' Entry point called by Python via COM automation.
' Reads parameters from named ranges, dispatches by Report_Type,
' writes output paths + errors into named ranges (NO MsgBox, NO Err.Raise).
Public Sub GenerateAndExportReport_FromParams()
    Dim oldCalc As XlCalculation
    On Error GoTo EH

    oldCalc = Application.Calculation

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    ' Clear last error
    SafeSetNameValue "Report_LastError", ""
    SafeSetNameValue "Report_Out_XLSX", ""
    SafeSetNameValue "Report_Out_PDF", ""

    ' Read parameters from named ranges
    Dim y As Long, w As Long
    y = CLng(ThisWorkbook.Names("Report_Year").RefersToRange.Value)
    w = CLng(ThisWorkbook.Names("Report_Week").RefersToRange.Value)

    ' Read report type (with fallback for backward compatibility)
    Dim reportType As String
    On Error Resume Next
    reportType = LCase$(Trim$(CStr(ThisWorkbook.Names("Report_Type").RefersToRange.Value)))
    On Error GoTo EH
    If reportType = "" Or reportType = "0" Then reportType = "bericht"

    ' Dispatch by report type
    Dim xlsxPath As String, pdfPath As String
    Dim outFolder As String, baseName As String
    outFolder = Environ$("TEMP")

    Select Case reportType
        Case "bericht"
            baseName = "Bericht_" & CStr(y) & "_KW" & Format$(w, "00")
            Report_Run_Bericht y, w
            Export_Bericht_ToFiles outFolder, baseName, xlsxPath, pdfPath

        ' Future report types go here:
        ' Case "fahrer"
        '     baseName = "Fahrer_" & CStr(y) & "_KW" & Format$(w, "00")
        '     Report_Run_Fahrer y, w
        '     Export_Fahrer_ToFiles outFolder, baseName, xlsxPath, pdfPath

        Case Else
            SafeSetNameValue "Report_LastError", "Unknown report type: " & reportType
            GoTo CleanExit
    End Select

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
