Attribute VB_Name = "modExportReport"
Option Explicit

' Exports sheet "Bericht" into:
' 1) XLSX (as a new workbook with values)
' 2) PDF
'
' Returns full paths via ByRef.
Public Sub Export_Bericht_ToFiles( _
    ByVal outputFolder As String, _
    ByVal baseFileName As String, _
    ByRef outXlsxPath As String, _
    ByRef outPdfPath As String)

    On Error GoTo EH

    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Bericht")

    ' Ensure folder ends with "\"
    If Len(outputFolder) = 0 Then
        Err.Raise vbObjectError + 100, "Export_Bericht_ToFiles", "outputFolder is empty."
    End If
    If Right$(outputFolder, 1) <> "\" Then outputFolder = outputFolder & "\"

    Dim xlsxPath As String, pdfPath As String
    xlsxPath = outputFolder & baseFileName & ".xlsx"
    pdfPath = outputFolder & baseFileName & ".pdf"

    ' --- 1) Create XLSX as a separate workbook (values only)
    Dim wbNew As Workbook
    Set wbNew = Application.Workbooks.Add(xlWBATWorksheet)

    ' Copy used range as values + formats
    Dim rng As Range
    Set rng = ws.UsedRange

    With wbNew.Worksheets(1)
        .Name = "Bericht"
        rng.Copy
        .Range("A1").PasteSpecial Paste:=xlPasteValues
        .Range("A1").PasteSpecial Paste:=xlPasteFormats
        Application.CutCopyMode = False
    End With

    Application.DisplayAlerts = False
    wbNew.SaveAs Filename:=xlsxPath, FileFormat:=xlOpenXMLWorkbook ' .xlsx
    wbNew.Close SaveChanges:=False
    Application.DisplayAlerts = True

    ' --- 2) Export PDF directly from original sheet
    ws.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        Filename:=pdfPath, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, _
        OpenAfterPublish:=False

    outXlsxPath = xlsxPath
    outPdfPath = pdfPath
    Exit Sub

EH:
    Application.DisplayAlerts = True
    Err.Raise Err.Number, "Export_Bericht_ToFiles", Err.Description
End Sub


