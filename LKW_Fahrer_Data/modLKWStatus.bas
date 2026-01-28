Attribute VB_Name = "modLKWStatus"
Option Explicit

' ============================================================
' LKW blocking after status Verkauft / Ruckgabe
' - Reads sheet "LKW": column A = LKW-ID, L = Status, M = sale/return date
' - If Status is Verkauft/Ruckgabe and date is set (inclusive),
'   clears assignments on sheet "Kalender" from that date onward,
'   fills those cells dark gray, and removes data validation to block driver selection.
' - Works with arrays for speed; silent mode by default.
' ============================================================

Private Const SH_LKW As String = "LKW"
Private Const SH_KAL As String = "Kalender"

Private Const COL_LKW_ID As Long = 1      ' A
Private Const COL_STATUS As Long = 12     ' L
Private Const COL_DATE As Long = 13       ' M

Private Const GRID_LEFT_COL As Long = 5   ' E
Private Const GRID_FIRST_ROW As Long = 8
Private Const COLOR_BLOCK As Long = &H3C3C3C  ' dark gray

Public Sub ApplyLKWBlocks(Optional ByVal silent As Boolean = True)
    On Error GoTo EH

    Dim wsL As Worksheet, wsK As Worksheet
    Set wsL = ThisWorkbook.Worksheets(SH_LKW)
    Set wsK = ThisWorkbook.Worksheets(SH_KAL)

    ' ----- 1) Collect blocks from LKW sheet
    Dim lastRowL As Long
    lastRowL = wsL.Cells(wsL.Rows.Count, COL_LKW_ID).End(xlUp).Row
    If lastRowL < GRID_FIRST_ROW Then GoTo CleanExit

    Dim arrL As Variant
    arrL = wsL.Range(wsL.Cells(GRID_FIRST_ROW, COL_LKW_ID), _
                     wsL.Cells(lastRowL, COL_DATE)).Value2

    Dim blocked As Object: Set blocked = CreateObject("Scripting.Dictionary")
    blocked.CompareMode = vbTextCompare

    Dim r As Long, id As String, st As String, dt As Variant
    For r = 1 To UBound(arrL, 1)
        id = Trim$(CStr(arrL(r, 1)))
        If Len(id) = 0 Then GoTo NextRow
        st = UCase$(Trim$(CStr(arrL(r, COL_STATUS - COL_LKW_ID + 1))))
        st = Replace(st, "Ü", "U")
        st = Replace(st, "UE", "U")
        st = Replace(st, "Ü", "U") ' double-safety
        If st <> "VERKAUFT" And st <> "RUCKGABE" Then GoTo NextRow
        dt = arrL(r, COL_DATE - COL_LKW_ID + 1)
        Dim parsedDate As Date
        If TryParseDateLoose(dt, parsedDate) Then
            If Not blocked.Exists(id) Then blocked.Add id, parsedDate
        End If
NextRow:
    Next r

    If blocked.Count = 0 Then GoTo CleanExit

    ' ----- 2) Build date map by columns in Kalender
    Dim lastCol As Long
    lastCol = wsK.Cells(4, wsK.Columns.Count).End(xlToLeft).Column
    If lastCol < GRID_LEFT_COL Then GoTo CleanExit

    Dim datesByCol() As Date
    ReDim datesByCol(1 To lastCol)

    Dim c As Long, y As Long, m As Long, d As Long
    For c = GRID_LEFT_COL To lastCol
        y = CLng(Val(wsK.Cells(2, c).Value2))
        m = CLng(Val(wsK.Cells(3, c).Value2))
        d = CLng(Val(wsK.Cells(4, c).Value2))
        On Error Resume Next
        datesByCol(c) = DateSerial(y, m, d)
        On Error GoTo 0
    Next c

    ' ----- 3) Read Kalender grid (ID + assignments)
    Dim lastRowK As Long
    lastRowK = wsK.Cells(wsK.Rows.Count, COL_LKW_ID).End(xlUp).Row
    If lastRowK < GRID_FIRST_ROW Then GoTo CleanExit

    Dim rngIds As Range, rngGrid As Range
    Set rngIds = wsK.Range(wsK.Cells(GRID_FIRST_ROW, COL_LKW_ID), wsK.Cells(lastRowK, COL_LKW_ID))
    Set rngGrid = wsK.Range(wsK.Cells(GRID_FIRST_ROW, GRID_LEFT_COL), wsK.Cells(lastRowK, lastCol))

    Dim arrIds As Variant, arrGrid As Variant
    arrIds = rngIds.Value2
    arrGrid = rngGrid.Value2

    Dim cleared As Long
    Dim firstBlockCol As Long

    ' unlock assignment grid; lock only blocked cells; protect later
    Dim wasProtected As Boolean
    wasProtected = wsK.ProtectContents
    If wasProtected Then On Error Resume Next: wsK.Unprotect: On Error GoTo EH
    rngGrid.Locked = False

    Dim row1 As Long, col1 As Long
    For row1 = 1 To UBound(arrIds, 1)
        id = Trim$(CStr(arrIds(row1, 1)))
        If Len(id) = 0 Then GoTo NextKalRow
        If Not blocked.Exists(id) Then GoTo NextKalRow

        Dim cutDate As Date
        cutDate = blocked(id)

        ' find first column where date >= cutDate
        firstBlockCol = 0
        For c = GRID_LEFT_COL To lastCol
            If datesByCol(c) >= cutDate And datesByCol(c) <> 0 Then
                firstBlockCol = c
                Exit For
            End If
        Next c
        If firstBlockCol = 0 Then GoTo NextKalRow

        ' clear assignments in array (fast) and then apply fill + lock
        For col1 = firstBlockCol - GRID_LEFT_COL + 1 To UBound(arrGrid, 2)
            If Len(arrGrid(row1, col1)) > 0 Then
                arrGrid(row1, col1) = vbNullString
                cleared = cleared + 1
            End If
        Next col1

        ' apply fill, delete DV, lock blocked cells
        Dim rngBlock As Range
        Set rngBlock = wsK.Range(wsK.Cells(GRID_FIRST_ROW - 1 + row1, firstBlockCol), _
                                 wsK.Cells(GRID_FIRST_ROW - 1 + row1, lastCol))
        rngBlock.Interior.Color = COLOR_BLOCK
        On Error Resume Next
        rngBlock.Validation.Delete
        On Error GoTo 0
        rngBlock.Locked = True

NextKalRow:
    Next row1

    ' ----- 4) Write grid back (single assignment)
    rngGrid.Value2 = arrGrid

    ' protect sheet so locked cells are enforced; keep macros usable
    On Error Resume Next
    wsK.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True, _
                UserInterfaceOnly:=True, AllowFiltering:=True, AllowSorting:=True
    On Error GoTo EH

    If Not silent Then
        MsgBox "Blocks applied. Cells cleared: " & cleared, vbInformation
    End If

CleanExit:
    Exit Sub

EH:
    If Not silent Then
        MsgBox "ApplyLKWBlocks error: " & Err.Number & " - " & Err.Description, vbExclamation
    End If
End Sub

Public Sub Run_LKW_Blocks_Manual()
    ' Manual entry point for button/menu
    ApplyLKWBlocks False
End Sub

' Robust date parser (DMY default, supports text with / . - and Excel serials)
Private Function TryParseDateLoose(ByVal v As Variant, ByRef outDate As Date) As Boolean
    On Error GoTo Fail

    If IsDate(v) Then
        outDate = CDate(v)
        TryParseDateLoose = True
        Exit Function
    End If

    If IsNumeric(v) Then
        outDate = DateSerial(1899, 12, 30) + CDbl(v)
        TryParseDateLoose = True
        Exit Function
    End If

    Dim s As String
    s = Trim$(CStr(v))
    If Len(s) = 0 Then Exit Function

    s = Replace(s, "-", "/")
    s = Replace(s, ".", "/")
    Dim parts() As String
    parts = Split(s, "/")
    If UBound(parts) <> 2 Then Exit Function

    Dim p0 As Long, p1 As Long, p2 As Long
    If Not (IsNumeric(parts(0)) And IsNumeric(parts(1)) And IsNumeric(parts(2))) Then Exit Function
    p0 = CLng(parts(0)): p1 = CLng(parts(1)): p2 = CLng(parts(2))
    If p2 < 100 Then p2 = 2000 + p2

    If p0 > 12 Then
        outDate = DateSerial(p2, p1, p0) ' DMY
    ElseIf p1 > 12 Then
        outDate = DateSerial(p2, p0, p1) ' MDY
    Else
        outDate = DateSerial(p2, p1, p0) ' default DMY
    End If
    TryParseDateLoose = True
    Exit Function
Fail:
    TryParseDateLoose = False
End Function
