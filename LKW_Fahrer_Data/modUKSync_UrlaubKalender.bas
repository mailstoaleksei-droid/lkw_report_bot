Attribute VB_Name = "modUKSync_UrlaubKalender"
Option Explicit

' ============================================================
' UKSync: Urlaub (U/K) has priority over Kalender assignments.
'
' What it guarantees:
' 1) If a driver has U or K in sheet "Urlaub" for a date,
'    the driver cannot be assigned in "Kalender" on that date.
' 2) If U/K is entered in Urlaub later, existing assignments
'    in Kalender for that driver+date are automatically removed.
' 3) Dropdown (Data Validation) in Kalender excludes U/K drivers
'    for the currently selected date column.
'
' Sheets:
'   Urlaub:   headers Year/Month/Day in rows 1/2/3, drivers start row 6, name in col B
'   Kalender: headers Year/Month/Day in rows 2/3/4, assignment grid E8:OJ78
'   Fahrer:   driver master list in col B starting from row 4
' ============================================================

' ---------- Sheet names ----------
Private Const SH_URL As String = "Urlaub"
Private Const SH_KAL As String = "Kalender"
Private Const SH_DRV As String = "Fahrer"

' ---------- Urlaub layout ----------
Private Const URL_YEAR_ROW As Long = 1
Private Const URL_MONTH_ROW As Long = 2
Private Const URL_DAY_ROW As Long = 3
Private Const URL_FIRST_DRIVER_ROW As Long = 6
Private Const URL_DRIVER_NAME_COL As Long = 2       ' B
Private Const URL_FIRST_DATE_COL As Long = 8        ' H

' ---------- Kalender layout ----------
Private Const KAL_YEAR_ROW As Long = 2
Private Const KAL_MONTH_ROW As Long = 3
Private Const KAL_DAY_ROW As Long = 4

Private Const KAL_ASSIGN_RANGE As String = "E8:OJ78"

' Helper list for dynamic dropdown (must be outside visible planning area)
Private Const KAL_DV_HELP_COL As Long = 403         ' OM (safe: workbook max col was OK=401)
Private Const KAL_DV_HELP_TOP As Long = 8
Private Const KAL_DV_HELP_MAX As Long = 600         ' max items

' ---------- Cache ----------
Private Type TUKCache
    version As Long
    drvRow As Object    ' Scripting.Dictionary: key=normalized driver name, item=row in Urlaub
    dateCol As Object   ' Scripting.Dictionary: key=CLng(dateSerial), item=col in Urlaub
End Type

Private gCache As TUKCache
Private gCacheVersion As Long


' ============================================================
' PUBLIC ENTRY POINTS (call from sheet events)
' ============================================================

Public Sub UKSync_Urlaub_OnChange(ByVal Target As Range)
    On Error GoTo EH

    Dim wsU As Worksheet, wsK As Worksheet
    Set wsU = ThisWorkbook.Worksheets(SH_URL)
    Set wsK = ThisWorkbook.Worksheets(SH_KAL)

    ' Only react inside Urlaub date grid
    Dim rngChanged As Range
    Set rngChanged = Intersect(Target, wsU.UsedRange)
    If rngChanged Is Nothing Then Exit Sub

    Dim cell As Range
    Dim v As String, drv As String
    Dim dt As Date

    ' Build Kalender date->col map once (fast: use row 7 if it contains real dates, else header parse)
    Dim kalDateCol As Object
    Set kalDateCol = BuildKalenderDateToColDict(wsK)

    Dim totalCleared As Long
    Dim msg As Object: Set msg = CreateObject("Scripting.Dictionary")

    Application.EnableEvents = False

    For Each cell In rngChanged.Cells
        ' We only care about date columns in Urlaub
        If cell.Column < URL_FIRST_DATE_COL Then GoTo NextCell

        v = UCase$(Trim$(CStr(cell.Value)))
        If v <> "U" And v <> "K" Then GoTo NextCell

        drv = Trim$(CStr(wsU.Cells(cell.Row, URL_DRIVER_NAME_COL).Value))
        drv = NormalizeName(drv)
        If Len(drv) = 0 Then GoTo NextCell

        dt = GetDateFromHeaders(wsU, URL_YEAR_ROW, URL_MONTH_ROW, URL_DAY_ROW, cell.Column)
        If dt = 0 Then GoTo NextCell

        If kalDateCol.exists(CLng(dt)) Then
            Dim colK As Long
            colK = CLng(kalDateCol(CLng(dt)))

            Dim cleared As Long
            cleared = ClearDriverInKalenderDay(wsK, drv, colK)

            If cleared > 0 Then
                totalCleared = totalCleared + cleared
                Dim oneMsg As String
                oneMsg = "Removed from Kalender: " & drv & " on " & Format$(dt, "dd.mm.yyyy") & " (Urlaub=" & v & ")"
                If Not msg.exists(oneMsg) Then msg.Add oneMsg, 1
            End If
        End If

NextCell:
    Next cell

    ' Invalidate cache because Urlaub changed
    InvalidateUrlaubCache

CleanExit:
    Application.EnableEvents = True

    ' Optional: user feedback (keep it short for bulk pastes)
    If msg.Count > 0 Then
        If Target.Cells.CountLarge > 20 Then
            MsgBox "Urlaub U/K entered. Kalender assignments cleared: " & CStr(totalCleared), vbExclamation, "UKSync"
        Else
            Dim k As Variant, outMsg As String
            For Each k In msg.Keys
                outMsg = outMsg & CStr(k) & vbCrLf
            Next k
            MsgBox outMsg, vbExclamation, "UKSync"
        End If
    End If

    Exit Sub

EH:
    Application.EnableEvents = True
    Err.Raise Err.Number, "UKSync_Urlaub_OnChange", Err.Description
End Sub


Public Sub UKSync_Kalender_OnChange(ByVal Target As Range)
    On Error GoTo EH

    Dim wsK As Worksheet
    Set wsK = ThisWorkbook.Worksheets(SH_KAL)

    Dim rngAssign As Range
    Set rngAssign = wsK.Range(KAL_ASSIGN_RANGE)

    Dim rngChanged As Range
    Set rngChanged = Intersect(Target, rngAssign)
    If rngChanged Is Nothing Then Exit Sub

    Dim cell As Range
    Dim drv As String
    Dim dt As Date
    Dim msgs As Object: Set msgs = CreateObject("Scripting.Dictionary")
    Dim firstBad As Range

    Application.EnableEvents = False

    For Each cell In rngChanged.Cells
        drv = NormalizeName(CStr(cell.Value))
        If Len(drv) = 0 Then GoTo NextCell

        ' Ignore special codes that are not drivers
        Select Case UCase$(drv)
            Case "0", "U", "K", "R", "OHNE FAHRER", "OHNE LKW"
                GoTo NextCell
        End Select

        dt = GetDateFromHeaders(wsK, KAL_YEAR_ROW, KAL_MONTH_ROW, KAL_DAY_ROW, cell.Column)
        If dt = 0 Then GoTo NextCell

        Dim code As String
        code = GetUrlaubCodeCached(drv, dt)

        If code = "U" Or code = "K" Then
            If firstBad Is Nothing Then Set firstBad = cell
            cell.ClearContents

            Dim m As String
            m = "Blocked: " & drv & " on " & Format$(dt, "dd.mm.yyyy") & " (Urlaub=" & code & ")"
            If Not msgs.exists(m) Then msgs.Add m, 1
        End If

NextCell:
    Next cell

CleanExit:
    Application.EnableEvents = True

    If msgs.Count > 0 Then
        If rngChanged.Cells.CountLarge > 20 Then
            MsgBox "Some assignments were blocked by Urlaub U/K. Check cleared cells.", vbExclamation, "UKSync"
        Else
            Dim k As Variant, outMsg As String
            For Each k In msgs.Keys
                outMsg = outMsg & CStr(k) & vbCrLf
            Next k
            MsgBox outMsg, vbExclamation, "UKSync"
        End If

        If Not firstBad Is Nothing Then firstBad.Select
    End If

    Exit Sub

EH:
    Application.EnableEvents = True
    Err.Raise Err.Number, "UKSync_Kalender_OnChange", Err.Description
End Sub


Public Sub UKSync_Kalender_OnSelectionChange(ByVal Target As Range)
    On Error GoTo EH

    Dim wsK As Worksheet
    Set wsK = ThisWorkbook.Worksheets(SH_KAL)

    Dim rngAssign As Range
    Set rngAssign = wsK.Range(KAL_ASSIGN_RANGE)

    ' Only for a single selected cell inside assignment grid
    If Target Is Nothing Then Exit Sub
    If Target.Cells.CountLarge <> 1 Then Exit Sub
    If Intersect(Target, rngAssign) Is Nothing Then Exit Sub

    ' Avoid heavy work when events are disabled
    If Application.EnableEvents = False Then Exit Sub

    Dim dt As Date
    dt = GetDateFromHeaders(wsK, KAL_YEAR_ROW, KAL_MONTH_ROW, KAL_DAY_ROW, Target.Column)
    If dt = 0 Then Exit Sub

    ' Debounce: do not rebuild list for same selection/date/cache version
    Static lastAddr As String, lastDate As Long, lastVer As Long
    If Target.Address = lastAddr And CLng(dt) = lastDate And gCacheVersion = lastVer Then Exit Sub
    lastAddr = Target.Address
    lastDate = CLng(dt)
    lastVer = gCacheVersion

    Dim arr As Variant
    arr = BuildAllowedDriversForDate(dt) ' 1-based 2D array [1..n,1..1]

    Dim n As Long
    If IsArray(arr) Then
        n = UBound(arr, 1)
    Else
        n = 0
    End If

    ' Write helper list (clear old first)
    Dim topRow As Long, helpCol As Long
    topRow = KAL_DV_HELP_TOP
    helpCol = KAL_DV_HELP_COL

    Dim rngClear As Range
    Set rngClear = wsK.Range(wsK.Cells(topRow, helpCol), wsK.Cells(topRow + KAL_DV_HELP_MAX - 1, helpCol))
    rngClear.ClearContents

    If n > 0 Then
        wsK.Cells(topRow, helpCol).Resize(n, 1).Value = arr
    Else
        ' fallback: allow blank only
        wsK.Cells(topRow, helpCol).Value = ""
        n = 1
    End If

    Dim rngList As Range
    Set rngList = wsK.Range(wsK.Cells(topRow, helpCol), wsK.Cells(topRow + n - 1, helpCol))

    ' Apply data validation list to the selected cell
    Application.EnableEvents = False
    On Error Resume Next
    Target.Validation.Delete
    On Error GoTo EH

    Target.Validation.Add Type:=xlValidateList, _
                          AlertStyle:=xlValidAlertStop, _
                          Operator:=xlBetween, _
                          Formula1:="=" & rngList.Address(True, True, xlA1, True)

    Target.Validation.IgnoreBlank = True
    Target.Validation.InCellDropdown = True
    Target.Validation.ShowError = True
    Target.Validation.ErrorTitle = "Driver not available"
    Target.Validation.ErrorMessage = "This driver is not available on " & Format$(dt, "dd.mm.yyyy") & " (Urlaub has U/K)."

CleanExit:
    Application.EnableEvents = True
    Exit Sub

EH:
    Application.EnableEvents = True
    ' Silent fail is acceptable here (DV is UI helper); but raise if you prefer strict mode:
    ' Err.Raise Err.Number, "UKSync_Kalender_OnSelectionChange", Err.Description
End Sub


' ============================================================
' INTERNALS
' ============================================================

Private Sub InvalidateUrlaubCache()
    gCacheVersion = gCacheVersion + 1
End Sub

Private Sub EnsureUrlaubCache()
    If Not gCache.drvRow Is Nothing Then
        If Not gCache.dateCol Is Nothing Then
            If gCache.version = gCacheVersion Then Exit Sub
        End If
    End If

    Dim wsU As Worksheet
    Set wsU = ThisWorkbook.Worksheets(SH_URL)

    Dim drvDict As Object, dateDict As Object
    Set drvDict = CreateObject("Scripting.Dictionary")
    Set dateDict = CreateObject("Scripting.Dictionary")

    ' Build driver -> row
    Dim lastRow As Long, r As Long
    lastRow = wsU.Cells(wsU.Rows.Count, URL_DRIVER_NAME_COL).End(xlUp).Row

    For r = URL_FIRST_DRIVER_ROW To lastRow
        Dim nm As String
        nm = NormalizeName(CStr(wsU.Cells(r, URL_DRIVER_NAME_COL).Value))
        If Len(nm) > 0 Then
            If Not drvDict.exists(nm) Then drvDict.Add nm, r
        End If
    Next r

    ' Build date -> col (Urlaub date columns start at H)
    Dim lastCol As Long, c As Long
    lastCol = wsU.Cells(URL_DAY_ROW, wsU.Columns.Count).End(xlToLeft).Column

    For c = URL_FIRST_DATE_COL To lastCol
        Dim dt As Date
        dt = GetDateFromHeaders(wsU, URL_YEAR_ROW, URL_MONTH_ROW, URL_DAY_ROW, c)
        If dt <> 0 Then
            If Not dateDict.exists(CLng(dt)) Then dateDict.Add CLng(dt), c
        End If
    Next c

    Set gCache.drvRow = drvDict
    Set gCache.dateCol = dateDict
    gCache.version = gCacheVersion
End Sub

Private Function GetUrlaubCodeCached(ByVal driverName As String, ByVal dt As Date) As String
    On Error GoTo SafeExit

    EnsureUrlaubCache

    Dim nm As String
    nm = NormalizeName(driverName)
    If Len(nm) = 0 Then Exit Function

    Dim keyDate As Long
    keyDate = CLng(dt)

    If Not gCache.drvRow.exists(nm) Then Exit Function
    If Not gCache.dateCol.exists(keyDate) Then Exit Function

    Dim wsU As Worksheet
    Set wsU = ThisWorkbook.Worksheets(SH_URL)

    Dim r As Long, c As Long
    r = CLng(gCache.drvRow(nm))
    c = CLng(gCache.dateCol(keyDate))

    Dim v As String
    v = UCase$(Trim$(CStr(wsU.Cells(r, c).Value)))

    If v = "U" Or v = "K" Then
        GetUrlaubCodeCached = v
    End If

SafeExit:
End Function

Private Function BuildKalenderDateToColDict(ByVal wsK As Worksheet) As Object
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")

    ' Fast path: use row 7 if it already contains real dates (your file does)
    Dim lastCol As Long, c As Long
    lastCol = wsK.Cells(7, wsK.Columns.Count).End(xlToLeft).Column

    For c = 1 To lastCol
        Dim v As Variant
        v = wsK.Cells(7, c).Value
        If IsDate(v) Then
            Dim d As Date
            d = CDate(v)
            If Not dict.exists(CLng(d)) Then dict.Add CLng(d), c
        Else
            ' fallback: try header parse
            Dim dt As Date
            dt = GetDateFromHeaders(wsK, KAL_YEAR_ROW, KAL_MONTH_ROW, KAL_DAY_ROW, c)
            If dt <> 0 Then
                If Not dict.exists(CLng(dt)) Then dict.Add CLng(dt), c
            End If
        End If
    Next c

    Set BuildKalenderDateToColDict = dict
End Function

Private Function ClearDriverInKalenderDay(ByVal wsK As Worksheet, ByVal driverName As String, ByVal colK As Long) As Long
    Dim rngAssign As Range
    Set rngAssign = wsK.Range(KAL_ASSIGN_RANGE)

    If colK < rngAssign.Column Or colK > (rngAssign.Column + rngAssign.Columns.Count - 1) Then Exit Function

    Dim r As Long, firstRow As Long, lastRow As Long
    firstRow = rngAssign.Row
    lastRow = firstRow + rngAssign.Rows.Count - 1

    Dim nm As String
    nm = NormalizeName(driverName)

    For r = firstRow To lastRow
        If NormalizeName(CStr(wsK.Cells(r, colK).Value)) = nm Then
            wsK.Cells(r, colK).ClearContents
            ClearDriverInKalenderDay = ClearDriverInKalenderDay + 1
        End If
    Next r
End Function

Private Function BuildAllowedDriversForDate(ByVal dt As Date) As Variant
    Dim wsF As Worksheet
    Set wsF = ThisWorkbook.Worksheets(SH_DRV)

    Dim lastRow As Long, r As Long
    lastRow = wsF.Cells(wsF.Rows.Count, 2).End(xlUp).Row ' col B

    ' Collect into a dynamic array (max = lastRow)
    Dim tmp() As Variant
    ReDim tmp(1 To lastRow, 1 To 1)

    Dim n As Long
    For r = 4 To lastRow
        Dim nm As String
        nm = Trim$(CStr(wsF.Cells(r, 2).Value))
        nm = NormalizeName(nm)
        If Len(nm) > 0 Then
            Dim code As String
            code = GetUrlaubCodeCached(nm, dt)
            If code <> "U" And code <> "K" Then
                n = n + 1
                tmp(n, 1) = nm
            End If
        End If
    Next r

    If n = 0 Then
        BuildAllowedDriversForDate = Empty
    Else
        ReDim Preserve tmp(1 To n, 1 To 1)
        BuildAllowedDriversForDate = tmp
    End If
End Function

Private Function NormalizeName(ByVal s As String) As String
    ' Trim + collapse spaces + replace NBSP with normal space
    s = Replace(CStr(s), Chr$(160), " ")
    s = Trim$(s)

    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop

    NormalizeName = s
End Function

Private Function GetDateFromHeaders( _
    ByVal ws As Worksheet, _
    ByVal yearRow As Long, _
    ByVal monthRow As Long, _
    ByVal dayRow As Long, _
    ByVal col As Long) As Date

    On Error GoTo SafeExit

    Dim y As Variant, mTxt As String, d As Variant
    y = ws.Cells(yearRow, col).Value
    mTxt = CStr(ws.Cells(monthRow, col).Value)
    d = ws.Cells(dayRow, col).Value

    If Not IsNumeric(y) Then Exit Function
    If Not IsNumeric(d) Then Exit Function

    Dim m As Long
    m = MonthNumberFromText(mTxt)
    If m < 1 Or m > 12 Then Exit Function

    GetDateFromHeaders = DateSerial(CLng(y), m, CLng(d))
    Exit Function

SafeExit:
    GetDateFromHeaders = 0
End Function

Private Function MonthNumberFromText(ByVal mText As String) As Long
    mText = LCase$(Trim$(mText))
    mText = Replace(mText, ".", "")

    If Len(mText) = 0 Then
        MonthNumberFromText = 0
        Exit Function
    End If

    If IsNumeric(mText) Then
        MonthNumberFromText = CLng(mText)
        Exit Function
    End If

    Select Case mText
        Case "jan", "januar", "january": MonthNumberFromText = 1
        Case "feb", "februar", "february": MonthNumberFromText = 2
        Case "mar", "maer", "maerz", "marz", "march": MonthNumberFromText = 3
        Case "apr", "april": MonthNumberFromText = 4
        Case "mai", "may": MonthNumberFromText = 5
        Case "jun", "juni", "june": MonthNumberFromText = 6
        Case "jul", "juli", "july": MonthNumberFromText = 7
        Case "aug", "august": MonthNumberFromText = 8
        Case "sep", "sept", "september": MonthNumberFromText = 9
        Case "okt", "oct", "oktober", "october": MonthNumberFromText = 10
        Case "nov", "november": MonthNumberFromText = 11
        Case "dez", "dec", "dezember", "december": MonthNumberFromText = 12
        Case Else: MonthNumberFromText = 0
    End Select
End Function

' Highlight ONLY the LAST assignment cell before Urlaub "U"
' - finds next WORKDAY column (Mon-Fri) to the right
' - checks Urlaub code = "U" on that next workday date
' - ensures driver is NOT assigned in ANY cells between today col and the U-day col
Public Function PreUrlaub_LastCellBeforeU(ByVal kalenderCell As Range) As Boolean
    On Error GoTo SafeExit

    If kalenderCell Is Nothing Then Exit Function
    If kalenderCell.Cells.CountLarge <> 1 Then Exit Function

    Dim wsK As Worksheet
    Set wsK = kalenderCell.Worksheet
    If wsK Is Nothing Then Exit Function
    If wsK.Name <> "Kalender" Then Exit Function

    ' Only within planning grid
    If Intersect(kalenderCell, wsK.Range("E8:OJ78")) Is Nothing Then Exit Function

    Dim drv As String
    drv = NormalizeName(CStr(kalenderCell.Value))
    If Len(drv) = 0 Then Exit Function

    ' Ignore markers
    Select Case UCase$(drv)
        Case "0", "U", "K", "R", "OHNE FAHRER", "OHNE LKW", "WERKSTATT", "ERSATZWAGEN", "O.F."
            Exit Function
    End Select

    ' Date of current column
    Dim dtToday As Date
    dtToday = GetDateFromHeaders(wsK, 2, 3, 4, kalenderCell.Column)
    If dtToday = 0 Then Exit Function

    ' If today is already U/K -> do not highlight "day before"
    Dim codeToday As String
    codeToday = GetUrlaubCodeCached(drv, dtToday)
    If codeToday = "U" Or codeToday = "K" Then Exit Function

    ' Find next WORKDAY column (Mon-Fri) + its date
    Dim colNextWork As Long, dtNextWork As Date
    If Not GetNextWorkdayColAndDate(wsK, kalenderCell.Column, colNextWork, dtNextWork) Then Exit Function

    ' Next workday must be Urlaub "U"
    Dim codeNext As String
    codeNext = GetUrlaubCodeCached(drv, dtNextWork)
    If codeNext <> "U" Then Exit Function

    ' IMPORTANT: highlight ONLY the last occurrence before U:
    ' If driver appears anywhere in between columns -> current cell is NOT the last one
    Dim c As Long
    For c = kalenderCell.Column + 1 To colNextWork - 1
        If DriverExistsInColumn(wsK, c, drv) Then
            Exit Function
        End If
    Next c

    PreUrlaub_LastCellBeforeU = True

SafeExit:
End Function

' Returns True and outputs next Mon-Fri date/col to the right of fromCol
Private Function GetNextWorkdayColAndDate(ByVal wsK As Worksheet, ByVal fromCol As Long, _
                                         ByRef outCol As Long, ByRef outDate As Date) As Boolean
    On Error GoTo SafeExit

    Dim lastCol As Long, c As Long
    lastCol = wsK.Cells(4, wsK.Columns.Count).End(xlToLeft).Column

    For c = fromCol + 1 To lastCol
        Dim dt As Date
        dt = GetDateFromHeaders(wsK, 2, 3, 4, c)
        If dt <> 0 Then
            ' Mon=1 .. Sun=7
            If Weekday(dt, vbMonday) <= 5 Then
                outCol = c
                outDate = dt
                GetNextWorkdayColAndDate = True
                Exit Function
            End If
        End If
    Next c

SafeExit:
    GetNextWorkdayColAndDate = False
End Function

' Checks if driver name exists anywhere in E8:OJ78 for a specific column
Private Function DriverExistsInColumn(ByVal wsK As Worksheet, ByVal col As Long, ByVal drvNorm As String) As Boolean
    On Error GoTo SafeExit

    Dim r As Long
    For r = 8 To 77
        If NormalizeName(CStr(wsK.Cells(r, col).Value)) = drvNorm Then
            DriverExistsInColumn = True
            Exit Function
        End If
    Next r

SafeExit:
End Function




