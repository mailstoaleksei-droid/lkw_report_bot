Attribute VB_Name = "modSync_Core"
Option Explicit

' ============================================================
' Core sync engine: LKW_Fahrer_Data.xlsm  -->  LKW_Fahrer_Plan_.xlsb
' Target workbook: ThisWorkbook (Plan)
' ============================================================

' ---------- Sheet names ----------
Private Const PLAN_SHEET As String = "Fahrer-Arbeitsplan"
Private Const PLAN_SHEET_CONFIG As String = "Config"

Private Const DATA_FILENAME As String = "LKW_Fahrer_Data.xlsm"
Private Const DATA_SHEET_KAL As String = "Kalender"
Private Const DATA_SHEET_LKW As String = "LKW"
Private Const DATA_SHEET_URLAUB As String = "Urlaub"

' ---------- Target (Plan) layout ----------
Private Const PLAN_YEAR_ROW As Long = 2
Private Const PLAN_KW_ROW As Long = 3
Private Const PLAN_LKW_FIRSTROW As Long = 4
Private Const PLAN_LKWID_COL As Long = 1   'A
Private Const PLAN_GRID_LEFTCOL As Long = 6 'F

' ---------- Config cells (Plan!Config) ----------
Private Const CFG_STARTYEAR As String = "B1"
Private Const CFG_STARTWEEK As String = "B2"
Private Const CFG_ENDYEAR As String = "B3"
Private Const CFG_ENDWEEK As String = "B4"

' ---------- Data path ----------
Private Const DATA_FIXED_PATH As String = _
    "C:\Users\Aleksei Samosvat\Groo GmbH\Intranet - Groo GmbH - Dokumente\Fahrer\Arbeitszeitplan der Fahrer - LKW\LKW_Fahrer_Data.xlsm"

' ---------- Special markers (not drivers) ----------
Public Function IsSpecialMarker(ByVal token As String) As Boolean
    Dim t As String
    t = UCase$(Trim$(token))
    If Len(t) = 0 Then
        IsSpecialMarker = True
        Exit Function
    End If

    Select Case t
        Case "U", "K", "R", "0", "O.F.", "OHNE FAHRER", "WERKSTATT", "ERSATZWAGEN", "OHNE LKW", "Verkauft"
            IsSpecialMarker = True
        Case Else
            IsSpecialMarker = False
    End Select
End Function

' ============================================================
' Public "engine" procedure (called by the button macro)
' ============================================================
Public Sub Sync_DataToPlan_FullRefresh(Optional ByVal showMsg As Boolean = True)
    Dim t0 As Single
    t0 = Timer

    Dim oldCalc As XlCalculation
    Dim oldScr As Boolean, oldEvt As Boolean, oldDisp As Boolean

    oldCalc = Application.Calculation
    oldScr = Application.ScreenUpdating
    oldEvt = Application.EnableEvents
    oldDisp = Application.DisplayAlerts

    On Error GoTo EH

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationManual

    Dim wbPlan As Workbook: Set wbPlan = ThisWorkbook
    Dim wsPlan As Worksheet: Set wsPlan = wbPlan.Worksheets(PLAN_SHEET)
    Dim wsCfg As Worksheet: Set wsCfg = wbPlan.Worksheets(PLAN_SHEET_CONFIG)

    Dim yStart As Long, wStart As Long, yEnd As Long, wEndKW As Long
    ReadConfigRange wsCfg, yStart, wStart, yEnd, wEndKW


    Dim startCode As Long, endCode As Long
    startCode = WeekCode(yStart, wStart)
    endCode = WeekCode(yEnd, wEndKW)


    Dim dataPath As String
    dataPath = ResolveDataPath(wbPlan)

    Dim wbData As Workbook, dataWasOpen As Boolean
    Set wbData = OpenDataWorkbook(dataPath, dataWasOpen)
    If wbData Is Nothing Then Err.Raise vbObjectError + 1001, , "Could not open data workbook."

    ' Make sure required sheets exist
    RequireSheet wbData, DATA_SHEET_KAL
    RequireSheet wbData, DATA_SHEET_LKW
    RequireSheet wbData, DATA_SHEET_URLAUB

    Dim wsKal As Worksheet: Set wsKal = wbData.Worksheets(DATA_SHEET_KAL)
    Dim wsLKW As Worksheet: Set wsLKW = wbData.Worksheets(DATA_SHEET_LKW)
    Dim wsUrlaub As Worksheet: Set wsUrlaub = wbData.Worksheets(DATA_SHEET_URLAUB)


    ' 1) Sync master columns (Plan B-D)
    Sync_LKW_MasterColumns wsPlan, wsLKW

    ' 2) Sync weekly grid (values only)
    Dim dictPlanWeekCol As Object, minSelCol As Long, maxSelCol As Long, weeksProcessed As Long
    Set dictPlanWeekCol = CreateObject("Scripting.Dictionary")
    dictPlanWeekCol.CompareMode = vbTextCompare

    BuildWeekColumnMaps wsPlan, startCode, endCode, dictPlanWeekCol, minSelCol, maxSelCol, weeksProcessed
    If weeksProcessed = 0 Then Err.Raise vbObjectError + 1002, , "No target week columns found in the configured range."

    ' One extra week for:
    '   - U/K next-week indicator
    '   - transfer detection across W -> W+1 boundary
    Dim endCodePlus1 As Long
    endCodePlus1 = FindNextExistingWeekCode(dictPlanWeekCol, endCode)

    Sync_WeeklyGrid_FromDataKalender wsPlan, wsKal, wsUrlaub, startCode, endCode, endCodePlus1, dictPlanWeekCol, minSelCol, maxSelCol

    ' 3) Format U/K letters + transfer fill (only within selected area)
    FormatStatusLetters_UK wsPlan, PLAN_LKW_FIRSTROW, GetLastPlanLKWRow(wsPlan), minSelCol, maxSelCol
    FormatTransferCells wsPlan, PLAN_LKW_FIRSTROW, GetLastPlanLKWRow(wsPlan), minSelCol, maxSelCol
    ClearLegacyYellowFill wsPlan, PLAN_LKW_FIRSTROW, GetLastPlanLKWRow(wsPlan), minSelCol, maxSelCol

    ' Close Data workbook if we opened it
    If Not dataWasOpen Then wbData.Close SaveChanges:=False

    If showMsg Then
        Dim t1 As Single
        t1 = Timer
        MsgBox "Sync finished." & vbCrLf & _
               "Range: " & yStart & "/KW" & wStart & " .. " & yEnd & "/KW" & wEndKW & vbCrLf & _
               "Weeks processed: " & weeksProcessed & vbCrLf & _
               "Runtime: " & Format$(t1 - t0, "0.00") & " sec", vbInformation

    End If

CleanExit:
    Application.Calculation = oldCalc
    Application.ScreenUpdating = oldScr
    Application.EnableEvents = oldEvt
    Application.DisplayAlerts = oldDisp
    Exit Sub

EH:
    Dim msg As String
    msg = "Sync failed: " & Err.Description & vbCrLf & _
          "Error " & Err.Number
    MsgBox msg, vbCritical
    On Error Resume Next
    If Not wbData Is Nothing Then
        If Not dataWasOpen Then wbData.Close SaveChanges:=False
    End If
    On Error GoTo 0
    Resume CleanExit
End Sub
' ============================================================
' Helper: open workbook (read-only). If the file is locked by another user
' (SharePoint/OneDrive co-authoring lock), fall back to opening a TEMP copy.
' ============================================================
Private Function OpenDataWorkbook(ByVal fullPath As String, ByRef wasOpen As Boolean) As Workbook
    wasOpen = False

    ' 1) If already open in THIS Excel instance, reuse it.
    Dim wb As Workbook
    For Each wb In Application.Workbooks
        If StrComp(wb.FullName, fullPath, vbTextCompare) = 0 Then
            wasOpen = True
            Set OpenDataWorkbook = wb
            Exit Function
        End If
    Next wb

    ' 2) Check path exists
    If Len(Dir$(fullPath)) = 0 Then
        Err.Raise vbObjectError + 1003, , "Data file not found: " & fullPath
    End If

    ' 3) Try direct open (read-only)
    On Error GoTo TryTempCopy
    Set OpenDataWorkbook = Application.Workbooks.Open( _
        Filename:=fullPath, _
        UpdateLinks:=0, _
        ReadOnly:=True, _
        AddToMru:=False, _
        Notify:=False)
    Exit Function

TryTempCopy:
    ' Direct open failed (often Error 1004 due to lock). Try to open a local TEMP copy.
    Dim firstErrNum As Long, firstErrDesc As String
    firstErrNum = Err.Number
    firstErrDesc = Err.Description
    Err.Clear
    On Error GoTo 0

    Dim tmpPath As String
    Randomize
    tmpPath = Environ$("TEMP") & Application.PathSeparator & _
              "LKW_Fahrer_Data_SYNC_" & Format$(Now, "yyyymmdd_hhnnss") & "_" & CStr(Int(Rnd() * 100000)) & ".xlsm"

    On Error GoTo FailAll
    FileCopy fullPath, tmpPath

    Set OpenDataWorkbook = Application.Workbooks.Open( _
        Filename:=tmpPath, _
        UpdateLinks:=0, _
        ReadOnly:=True, _
        AddToMru:=False, _
        Notify:=False)

    wasOpen = False
    Exit Function

FailAll:
    Err.Raise vbObjectError + 1008, , _
        "Could not open data workbook." & vbCrLf & _
        "Path: " & fullPath & vbCrLf & _
        "Direct open error: " & firstErrNum & " - " & firstErrDesc & vbCrLf & _
        "Temp copy tried: " & tmpPath & vbCrLf & _
        "Temp open/copy error: " & Err.Number & " - " & Err.Description
End Function


Public Function ResolveDataPath(ByVal wbPlan As Workbook) As String
    If Len(Dir$(DATA_FIXED_PATH)) > 0 Then

        ResolveDataPath = DATA_FIXED_PATH
    Else
        ResolveDataPath = wbPlan.Path & Application.PathSeparator & DATA_FILENAME
    End If
End Function

Public Sub ReadConfigRange(ByVal wsCfg As Worksheet, _
                           ByRef yStart As Long, ByRef wStart As Long, _
                           ByRef yEnd As Long, ByRef wEndKW As Long)

    yStart = CLng(wsCfg.Range(CFG_STARTYEAR).Value2)
    wStart = CLng(wsCfg.Range(CFG_STARTWEEK).Value2)
    yEnd = CLng(wsCfg.Range(CFG_ENDYEAR).Value2)
    wEndKW = CLng(wsCfg.Range(CFG_ENDWEEK).Value2)

    If yStart <= 0 Or yEnd <= 0 Then Err.Raise vbObjectError + 1004, , "Config years must be > 0."
    If wStart < 1 Or wStart > 53 Then Err.Raise vbObjectError + 1005, , "StartKW must be 1..53."
    If wEndKW < 1 Or wEndKW > 53 Then Err.Raise vbObjectError + 1006, , "EndKW must be 1..53."

    If WeekCode(yStart, wStart) > WeekCode(yEnd, wEndKW) Then
        Err.Raise vbObjectError + 1007, , "Config range invalid: start > end."
    End If
End Sub

Public Function WeekCode(ByVal yearVal As Long, ByVal weekVal As Long) As Long
    WeekCode = (yearVal * 100&) + weekVal
End Function

Private Function GetHeaderValueYear(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal col As Long) As Long
    Dim v As Variant
    v = ws.Cells(headerRow, col).Value2
    If ws.Cells(headerRow, col).MergeCells Then
        v = ws.Cells(headerRow, col).MergeArea.Cells(1, 1).Value2
    End If
    If IsNumeric(v) Then
        GetHeaderValueYear = CLng(v)
    Else
        GetHeaderValueYear = 0
    End If
End Function

Private Function GetHeaderValueWeek(ByVal ws As Worksheet, ByVal headerRow As Long, ByVal col As Long) As Long
    Dim v As Variant
    v = ws.Cells(headerRow, col).Value2
    If ws.Cells(headerRow, col).MergeCells Then
        v = ws.Cells(headerRow, col).MergeArea.Cells(1, 1).Value2
    End If
    If IsNumeric(v) Then
        GetHeaderValueWeek = CLng(v)
    Else
        GetHeaderValueWeek = 0
    End If
End Function

Public Sub BuildWeekColumnMaps(ByVal wsPlan As Worksheet, _
                               ByVal startCode As Long, ByVal endCode As Long, _
                               ByRef dictWeekCol As Object, _
                               ByRef minSelCol As Long, ByRef maxSelCol As Long, _
                               ByRef weeksProcessed As Long)
    dictWeekCol.RemoveAll
    weeksProcessed = 0
    minSelCol = 0
    maxSelCol = 0

    Dim lastCol As Long
    lastCol = wsPlan.Cells(3, wsPlan.Columns.Count).End(xlToLeft).Column

    Dim c As Long, y As Long, w As Long, code As Long
    For c = 6 To lastCol
        y = GetHeaderValueYear(wsPlan, 2, c)
        w = GetHeaderValueWeek(wsPlan, 3, c)
        If y > 0 And w > 0 Then
            code = WeekCode(y, w)
            If Not dictWeekCol.Exists(CStr(code)) Then
                dictWeekCol.Add CStr(code), c
            End If

            If code >= startCode And code <= endCode Then
                weeksProcessed = weeksProcessed + 1
                If minSelCol = 0 Or c < minSelCol Then minSelCol = c
                If maxSelCol = 0 Or c > maxSelCol Then maxSelCol = c
            End If
        End If
    Next c
End Sub

Public Function FindNextExistingWeekCode(ByVal dictWeekCol As Object, ByVal endCode As Long) As Long
    Dim k As Variant, best As Long
    best = 0
    For Each k In dictWeekCol.Keys
        If CLng(k) > endCode Then
            If best = 0 Or CLng(k) < best Then best = CLng(k)
        End If
    Next k
    If best = 0 Then best = endCode
    FindNextExistingWeekCode = best
End Function

Public Function GetLastPlanLKWRow(ByVal wsPlan As Worksheet) As Long
    Dim lastRow As Long
    lastRow = wsPlan.Cells(wsPlan.Rows.Count, 1).End(xlUp).Row

    Dim r As Long, v As String
    For r = lastRow To 4 Step -1
        v = Trim$(CStr(wsPlan.Cells(r, 1).Value2))
        If v Like "L###" Then
            GetLastPlanLKWRow = r
            Exit Function
        End If
    Next r

    GetLastPlanLKWRow = 4
End Function

Private Sub RequireSheet(ByVal wb As Workbook, ByVal sheetName As String)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = wb.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Err.Raise vbObjectError + 1010, , "Missing sheet: " & sheetName
End Sub


