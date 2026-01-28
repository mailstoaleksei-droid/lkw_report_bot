Attribute VB_Name = "Module1"
'=========================================
' Navigation on sheet "Kalender"
'=========================================
Public gUrlaubCacheVersion As Long

Private Type UrlaubCache
    version As Long
    driverRow As Object  ' Scripting.Dictionary: key=driverName, item=row
    dateCol As Object    ' Scripting.Dictionary: key=CLng(dateSerial), item=col
End Type
Private Const SR_ASSIGN_RANGE As String = "E8:OJ78"
Private Const SR_FIRST_ROW As Long = 8
Private Const SR_LKWID_COL As Long = 1          ' Column A
Private Const SR_SOLD_FROM_COL As Long = 375  ' Column OK (helper)
Private Const SR_HELPER_DATE_ROW As Long = 7    ' Row 7 (helper dates)
Private gCache As UrlaubCache
Sub GoToHeute_Kalender()
    Dim ws As Worksheet
    Dim firstDataCol As Long, lastDataCol As Long
    Dim y As Long, w As Long, d As Long
    Dim c As Long
    Dim found As Boolean

    Set ws = ThisWorkbook.Worksheets("Kalender")

    ' Find last and first data column by KW in row 6
    lastDataCol = ws.Cells(6, ws.Columns.Count).End(xlToLeft).Column
    firstDataCol = 1
    For c = 1 To lastDataCol
        If IsNumeric(ws.Cells(6, c).Value) And ws.Cells(6, c).Value > 0 Then
            firstDataCol = c
            Exit For
        End If
    Next c

    y = Year(Date)
    w = DatePart("ww", Date, vbMonday, vbFirstFourDays)
    d = Day(Date)

    ' Find column with today's date (Year + KW + Day)
    For c = firstDataCol To lastDataCol
        If ws.Cells(2, c).Value = y _
           And ws.Cells(6, c).Value = w _
           And ws.Cells(4, c).Value = d Then
            found = True
            Exit For
        End If
    Next c

    If Not found Then
        MsgBox "Current date " & Format(Date, "dd.mm.yyyy") & _
               " not found on sheet 'Kalender'.", vbInformation
        Exit Sub
    End If

    ws.Activate
    ws.Cells(8, c).Select

    On Error Resume Next
    Call UpdateKalenderLeaveHighlights
    On Error GoTo 0   ' jump to first driver row in this date
End Sub


Sub GoToWeek_Kalender()
    Dim ws As Worksheet
    Dim firstDataCol As Long, lastDataCol As Long
    Dim y As Variant, w As Variant
    Dim c As Long
    Dim found As Boolean

    Set ws = ThisWorkbook.Worksheets("Kalender")

    ' Find data columns by KW row
    lastDataCol = ws.Cells(6, ws.Columns.Count).End(xlToLeft).Column
    firstDataCol = 1
    For c = 1 To lastDataCol
        If IsNumeric(ws.Cells(6, c).Value) And ws.Cells(6, c).Value > 0 Then
            firstDataCol = c
            Exit For
        End If
    Next c

    ' Ask for year
    y = Application.InputBox( _
            Prompt:="Enter year (e.g. 2025):", _
            Title:="Year", _
            Default:=Year(Date), _
            Type:=1)
    If y = False Then Exit Sub
    If y < 2000 Or y > 2100 Then
        MsgBox "Invalid year.", vbExclamation
        Exit Sub
    End If

    ' Ask for KW
    w = Application.InputBox( _
            Prompt:="Enter calendar week (1-53):", _
            Title:="KW", _
            Type:=1)
    If w = False Then Exit Sub
    If w < 1 Or w > 53 Then
        MsgBox "Invalid week number.", vbExclamation
        Exit Sub
    End If

    ' Find first column with this year + KW
    For c = firstDataCol To lastDataCol
        If ws.Cells(2, c).Value = CLng(y) And _
           ws.Cells(6, c).Value = CLng(w) Then
            found = True
            Exit For
        End If
    Next c

    If Not found Then
        MsgBox "Week " & w & " / " & y & " not found on sheet 'Kalender'.", _
               vbInformation
        Exit Sub
    End If

    ws.Activate
    ws.Cells(8, c).Select
End Sub


Sub Search_Kalender()
    Dim ws As Worksheet
    Dim searchRange As Range
    Dim findValue As String
    Dim foundCell As Range
    Dim firstAddress As String

    Set ws = ThisWorkbook.Worksheets("Kalender")
    ws.Activate

    ' Use current selection as search range
    On Error Resume Next
    Set searchRange = Selection
    On Error GoTo 0

    If searchRange Is Nothing Then
        MsgBox "Please select a range first.", vbInformation
        Exit Sub
    End If

    ' Ask user what to search
    findValue = InputBox( _
        Prompt:="Enter text or number to search in selected range:", _
        Title:="Search in selection")
    If findValue = "" Then Exit Sub

    ' First match in selection
    Set foundCell = searchRange.Find(What:=findValue, LookIn:=xlValues, _
                                     LookAt:=xlPart, SearchOrder:=xlByRows, _
                                     SearchDirection:=xlNext, MatchCase:=False)

    If foundCell Is Nothing Then
        MsgBox "Value '" & findValue & "' not found in selected range.", vbInformation
        Exit Sub
    End If

    firstAddress = foundCell.Address
    foundCell.Select

    ' Optional loop: find next / next / next while user ???????? Yes
    Do While MsgBox("Found at " & foundCell.Address & ". Find next?", _
                    vbYesNo + vbQuestion, "Search in selection") = vbYes

        Set foundCell = searchRange.FindNext(After:=foundCell)
        If foundCell Is Nothing Then
            MsgBox "No more matches in selected range.", vbInformation
            Exit Sub
        End If

        If foundCell.Address = firstAddress Then
            MsgBox "Search wrapped to the first found cell.", vbInformation
            Exit Sub
        End If

        foundCell.Select
    Loop
End Sub



Sub GoToStatistik_Kalender()
    Dim ws As Worksheet
    Dim col As Long

    Set ws = ThisWorkbook.Worksheets("Kalender")

    ' If the active sheet is not Kalender, activate Kalender first.
    ' ActiveCell will then be on Kalender in the same column.
    If Not ws Is ActiveSheet Then
        ws.Activate
    End If

    ' Use the current active column (e.g. column EE)
    col = ActiveCell.Column

    ' Jump to row 121 in the same column
    ws.Cells(90, col).Select
End Sub


'=========================================
' One-time macro: add buttons to A1,B1,A2,C1
' on sheet "Kalender"
'=========================================
Sub AddNavButtons_Kalender()
    Dim ws As Worksheet
    Dim rng As Range
    Dim btn As Button

    Set ws = ThisWorkbook.Worksheets("Kalender")

    ' >>Heute (A1)
    Set rng = ws.Range("A1")
    On Error Resume Next
    ws.Buttons("btnKalHeute").Delete
    On Error GoTo 0
    Set btn = ws.Buttons.Add(rng.Left, rng.Top, rng.Width, rng.Height)
    With btn
        .Name = "btnKalHeute"
        .OnAction = "GoToHeute_Kalender"
        .Caption = ">>Heute"
    End With

    ' >>Zur KW (B1)
    Set rng = ws.Range("B1")
    On Error Resume Next
    ws.Shapes("btnKalHeute").Delete
    On Error GoTo 0

    Set btn = ws.Buttons.Add(rng.Left, rng.Top, rng.Width, rng.Height)
    With btn
        .Name = "btnKalZurKW"
        .OnAction = "GoToWeek_Kalender"
        .Caption = ">>Zur KW"
    End With

    ' >>Search (A2)
    Set rng = ws.Range("A2")
    On Error Resume Next
    ws.Buttons("btnKalSearch").Delete
    On Error GoTo 0
    Set btn = ws.Buttons.Add(rng.Left, rng.Top, rng.Width, rng.Height)
    With btn
        .Name = "btnKalSearch"
        .OnAction = "Search_Kalender"
        .Caption = ">>Search"
    End With

    ' >>Statistik (C1)
    Set rng = ws.Range("C1")
    On Error Resume Next
    ws.Buttons("btnKalStatistik").Delete
    On Error GoTo 0
    Set btn = ws.Buttons.Add(rng.Left, rng.Top, rng.Width, rng.Height)
    With btn
        .Name = "btnKalStatistik"
        .OnAction = "GoToStatistik_Kalender"
        .Caption = ">>Statistik"
    End With
End Sub





'=========================================
' Migration helper
'=========================================
Sub MigrateKalenderToLkwMode()
    ' Runs the Kalender migration to LKW-based planning layout
    On Error GoTo ErrH
    Call modMigration.Kalender_MigrateToLKWMode
    Exit Sub
ErrH:
    MsgBox "Migration failed: " & Err.Description, vbExclamation
End Sub



'=========================================
' Urlaub / Krank: highlight the day BEFORE
'=========================================
Private Function LeaveColorU() As Long
    LeaveColorU = RGB(191, 144, 0) ' dark orange
End Function

Private Function LeaveColorK() As Long
    LeaveColorK = RGB(255, 0, 0)   ' dark red
End Function

Public Sub UpdateKalenderLeaveHighlights()
    Dim wsK As Worksheet, wsU As Worksheet
    Set wsK = ThisWorkbook.Worksheets("Kalender")
    Set wsU = ThisWorkbook.Worksheets("Urlaub")

    Dim lastRowK As Long, lastColK As Long, c As Long, r As Long
    lastRowK = wsK.Cells(wsK.Rows.Count, "A").End(xlUp).Row
    If lastRowK < 8 Then Exit Sub

    lastColK = wsK.Cells(4, wsK.Columns.Count).End(xlToLeft).Column ' day numbers row
    If lastColK < 5 Then Exit Sub

    Dim dictNext As Object, dictCur As Object
    Set dictNext = CreateObject("Scripting.Dictionary")
    Set dictCur = CreateObject("Scripting.Dictionary")

    Dim curDate As Date, nextDate As Date

    Application.ScreenUpdating = False

    For c = 5 To lastColK
        If TryGetDateFromKalenderHeader(wsK, c, curDate) Then
            nextDate = curDate + 1

            dictNext.RemoveAll
            dictCur.RemoveAll
            BuildUrlaubStatusDict wsU, nextDate, dictNext
            BuildUrlaubStatusDict wsU, curDate, dictCur

            For r = 8 To lastRowK
                Dim drv As String
                drv = Trim$(CStr(wsK.Cells(r, c).Value))

                If Len(drv) = 0 Then
                    ClearLeaveFillIfOwned wsK.Cells(r, c)
                Else
                    Dim key As String
                    key = UCase$(drv)

                    If dictNext.exists(key) Then
                        ' Highlight ONLY if leave/sick starts tomorrow (today is NOT U/K)
                        If dictCur.exists(key) Then
                            ClearLeaveFillIfOwned wsK.Cells(r, c)
                        Else
                            Dim code As String
                            code = dictNext(key)

                            If code = "U" Then
                                ApplyLeaveFill wsK.Cells(r, c), LeaveColorU()
                            ElseIf code = "K" Then
                                ApplyLeaveFill wsK.Cells(r, c), LeaveColorK()
                            Else
                                ClearLeaveFillIfOwned wsK.Cells(r, c)
                            End If
                        End If
                    Else
                        ClearLeaveFillIfOwned wsK.Cells(r, c)
                    End If
                End If
            Next r
        End If
    Next c

    Application.ScreenUpdating = True
End Sub

Private Sub ApplyLeaveFill(ByVal cell As Range, ByVal fillColor As Long)
    ' Do not overwrite other formatting; only set if empty or already our leave-colors.
    If cell.Interior.Pattern = xlNone _
        Or cell.Interior.Color = LeaveColorU() _
        Or cell.Interior.Color = LeaveColorK() Then

        cell.Interior.Pattern = xlSolid
        cell.Interior.Color = fillColor
    End If
End Sub

Private Sub ClearLeaveFillIfOwned(ByVal cell As Range)
    If cell.Interior.Pattern <> xlNone Then
        If cell.Interior.Color = LeaveColorU() Or cell.Interior.Color = LeaveColorK() Then
            cell.Interior.Pattern = xlNone
        End If
    End If
End Sub

Private Sub BuildUrlaubStatusDict(ByVal wsU As Worksheet, ByVal targetDate As Date, ByRef dict As Object)
    Dim dateCol As Long
    dateCol = FindUrlaubColByDate(wsU, targetDate)
    If dateCol = 0 Then Exit Sub

    Dim lastRowU As Long, r As Long
    lastRowU = wsU.Cells(wsU.Rows.Count, "A").End(xlUp).Row

    For r = 6 To lastRowU
        Dim nameVal As String
        nameVal = Trim$(CStr(wsU.Cells(r, 2).Value))
        If Len(nameVal) > 0 Then
            Dim code As String
            code = UCase$(Trim$(CStr(wsU.Cells(r, dateCol).Value)))
            If code = "U" Or code = "K" Then
                dict(UCase$(nameVal)) = code
            End If
        End If
    Next r
End Sub

Private Function FindUrlaubColByDate(ByVal wsU As Worksheet, ByVal targetDate As Date) As Long
    Dim lastCol As Long, c As Long
    lastCol = wsU.Cells(3, wsU.Columns.Count).End(xlToLeft).Column

    For c = 8 To lastCol ' date columns start at H
        Dim y As Variant, mTxt As String, d As Variant
        y = wsU.Cells(1, c).Value
        mTxt = CStr(wsU.Cells(2, c).Value)
        d = wsU.Cells(3, c).Value

        If IsNumeric(y) And IsNumeric(d) Then
            Dim m As Integer
            m = MonthTextToNumber(mTxt)
            If m > 0 Then
                If DateSerial(CLng(y), m, CLng(d)) = targetDate Then
                    FindUrlaubColByDate = c
                    Exit Function
                End If
            End If
        End If
    Next c
End Function

Private Function TryGetDateFromKalenderHeader(ByVal wsK As Worksheet, ByVal col As Long, ByRef outDate As Date) As Boolean
    Dim y As Variant, mTxt As String, d As Variant
    y = wsK.Cells(2, col).Value
    mTxt = CStr(wsK.Cells(3, col).Value)
    d = wsK.Cells(4, col).Value

    If Not IsNumeric(y) Then Exit Function
    If Not IsNumeric(d) Then Exit Function

    Dim m As Integer
    m = MonthTextToNumber(mTxt)
    If m = 0 Then Exit Function

    outDate = DateSerial(CLng(y), m, CLng(d))
    TryGetDateFromKalenderHeader = True
End Function

Private Function MonthTextToNumber(ByVal mText As String) As Integer
    mText = LCase$(Trim$(CStr(mText)))
    If Len(mText) = 0 Then Exit Function

    If IsNumeric(mText) Then
        MonthTextToNumber = CInt(mText)
        Exit Function
    End If

    Select Case mText
        Case "jan", "januar", "january": MonthTextToNumber = 1
        Case "feb", "februar", "february": MonthTextToNumber = 2
        Case "mar", "maer", "maerz", "marz", "march": MonthTextToNumber = 3
        Case "apr", "april": MonthTextToNumber = 4
        Case "mai", "may": MonthTextToNumber = 5
        Case "jun", "juni", "june": MonthTextToNumber = 6
        Case "jul", "juli", "july": MonthTextToNumber = 7
        Case "aug", "august": MonthTextToNumber = 8
        Case "sep", "sept", "september": MonthTextToNumber = 9
        Case "okt", "oct", "october", "oktober": MonthTextToNumber = 10
        Case "nov", "november": MonthTextToNumber = 11
        Case "dez", "dec", "december": MonthTextToNumber = 12
    End Select
End Function
' ===== Pre-leave highlight via Conditional Formatting (works even if weekend has gray CF) =====



Public Sub InvalidateUrlaubCache()
    gUrlaubCacheVersion = gUrlaubCacheVersion + 1
End Sub

' Returns: 0 none, 1 U, 2 K for "tomorrow" relative to Kalender cell
Public Function PreLeaveType(ByVal kalenderCell As Range) As Long
    On Error GoTo SafeExit

    If kalenderCell Is Nothing Then GoTo SafeExit
    If kalenderCell.Worksheet Is Nothing Then GoTo SafeExit

    Dim drv As String
    drv = Trim$(CStr(kalenderCell.Value))
    If Len(drv) = 0 Then GoTo SafeExit

    Select Case UCase$(drv)
        Case "0", "U", "K", "R", "OHNE FAHRER", "OHNE LKW"
            GoTo SafeExit
    End Select

    Dim wsK As Worksheet, wsU As Worksheet
    Set wsK = kalenderCell.Worksheet
    Set wsU = ThisWorkbook.Worksheets("Urlaub")

    ' Get "tomorrow" date from Kalender headers (year row 2, month row 3, day row 4)
    Dim cTomorrow As Long
    cTomorrow = kalenderCell.Column + 1
    If cTomorrow > wsK.Columns.Count Then GoTo SafeExit

    Dim y As Variant, mTxt As Variant, d As Variant
    y = wsK.Cells(2, cTomorrow).Value
    mTxt = wsK.Cells(3, cTomorrow).Value
    d = wsK.Cells(4, cTomorrow).Value

    If Not IsNumeric(y) Or Not IsNumeric(d) Then GoTo SafeExit

    Dim m As Long
    m = MonthNumberFromText(CStr(mTxt))
    If m < 1 Or m > 12 Then GoTo SafeExit

    Dim dtTomorrow As Date
    dtTomorrow = DateSerial(CLng(y), m, CLng(d))

    ' Build / reuse cache for Urlaub mapping
    EnsureUrlaubCache wsU

    Dim rowU As Long, colU As Long
    rowU = 0: colU = 0

    If gCache.driverRow.exists(drv) Then rowU = CLng(gCache.driverRow(drv))
    If gCache.dateCol.exists(CLng(dtTomorrow)) Then colU = CLng(gCache.dateCol(CLng(dtTomorrow)))

    If rowU = 0 Or colU = 0 Then GoTo SafeExit

    Dim v As String
    v = UCase$(Trim$(CStr(wsU.Cells(rowU, colU).Value)))

    ' Important: highlight only "day before start" (tomorrow is U/K, today is NOT U/K)
    Dim dtToday As Date
    dtToday = GetKalenderDateFromHeaders(wsK, kalenderCell.Column)
    If dtToday = 0 Then GoTo SafeExit

    Dim colToday As Long
    colToday = 0
    If gCache.dateCol.exists(CLng(dtToday)) Then colToday = CLng(gCache.dateCol(CLng(dtToday)))

    Dim vToday As String
    vToday = ""
    If colToday > 0 Then vToday = UCase$(Trim$(CStr(wsU.Cells(rowU, colToday).Value)))

    If (vToday = "U" Or vToday = "K") Then GoTo SafeExit

    If v = "U" Then
        PreLeaveType = 1
    ElseIf v = "K" Then
        PreLeaveType = 2
    End If

SafeExit:
End Function

Private Sub EnsureUrlaubCache(ByVal wsU As Worksheet)
    If gCache.driverRow Is Nothing Or gCache.dateCol Is Nothing Or gCache.version <> gUrlaubCacheVersion Then
        Dim drvDict As Object, dateDict As Object
        Set drvDict = CreateObject("Scripting.Dictionary")
        Set dateDict = CreateObject("Scripting.Dictionary")

        ' Driver rows: assume names in column B, starting from row 6 (safe scan)
        Dim lastRow As Long, r As Long
        lastRow = wsU.Cells(wsU.Rows.Count, 2).End(xlUp).Row
        For r = 1 To lastRow
            Dim nm As String
            nm = Trim$(CStr(wsU.Cells(r, 2).Value))
            If Len(nm) >= 3 Then
                If Not drvDict.exists(nm) Then drvDict.Add nm, r
            End If
        Next r

        ' Date columns: read headers (year row 2, month row 3, day row 4)
        Dim lastCol As Long, c As Long
        lastCol = wsU.Cells(4, wsU.Columns.Count).End(xlToLeft).Column
        For c = 1 To lastCol
            Dim yy As Variant, mmTxt As Variant, dd As Variant
            yy = wsU.Cells(2, c).Value
            mmTxt = wsU.Cells(3, c).Value
            dd = wsU.Cells(4, c).Value

            If IsNumeric(yy) And IsNumeric(dd) Then
                Dim mm As Long
                mm = MonthNumberFromText(CStr(mmTxt))
                If mm >= 1 And mm <= 12 Then
                    Dim dt As Date
                    dt = DateSerial(CLng(yy), mm, CLng(dd))
                    If Not dateDict.exists(CLng(dt)) Then dateDict.Add CLng(dt), c
                End If
            End If
        Next c

        Set gCache.driverRow = drvDict
        Set gCache.dateCol = dateDict
        gCache.version = gUrlaubCacheVersion
    End If
End Sub

Private Function GetKalenderDateFromHeaders(ByVal ws As Worksheet, ByVal col As Long) As Date
    On Error GoTo Bad

    Dim yearRow As Long, monthRow As Long, dayRow As Long
    Dim yy As Variant, mmTxt As Variant, dd As Variant

    ' Kalender: Jahr in row 2; Urlaub: Jahr in row 1
    yy = ws.Cells(2, col).Value
    If IsNumeric(yy) Then
        yearRow = 2: monthRow = 3: dayRow = 4
    ElseIf IsNumeric(ws.Cells(1, col).Value) Then
        yearRow = 1: monthRow = 2: dayRow = 3
        yy = ws.Cells(yearRow, col).Value
    Else
        GoTo Bad
    End If

    mmTxt = ws.Cells(monthRow, col).Value
    dd = ws.Cells(dayRow, col).Value

    If Not IsNumeric(yy) Or Not IsNumeric(dd) Then GoTo Bad

    Dim mm As Long
    mm = MonthNumberFromText(CStr(mmTxt))
    If mm < 1 Or mm > 12 Then GoTo Bad

    GetKalenderDateFromHeaders = DateSerial(CLng(yy), mm, CLng(dd))
    Exit Function

Bad:
    GetKalenderDateFromHeaders = 0
End Function


Private Function MonthNumberFromText(ByVal s As String) As Long
    s = LCase$(Trim$(s))

    ' German
    If s Like "jan*" Then MonthNumberFromText = 1: Exit Function
    If s Like "feb*" Then MonthNumberFromText = 2: Exit Function
    If s Like "maer*" Or s Like "mar*" Then MonthNumberFromText = 3: Exit Function
    If s Like "apr*" Then MonthNumberFromText = 4: Exit Function
    If s Like "mai*" Or s Like "may*" Then MonthNumberFromText = 5: Exit Function
    If s Like "jun*" Then MonthNumberFromText = 6: Exit Function
    If s Like "jul*" Then MonthNumberFromText = 7: Exit Function
    If s Like "aug*" Then MonthNumberFromText = 8: Exit Function
    If s Like "sep*" Then MonthNumberFromText = 9: Exit Function
    If s Like "okt*" Or s Like "oct*" Then MonthNumberFromText = 10: Exit Function
    If s Like "nov*" Then MonthNumberFromText = 11: Exit Function
    If s Like "dez*" Or s Like "dec*" Then MonthNumberFromText = 12: Exit Function

    MonthNumberFromText = 0
End Function

Public Sub InstallPreLeaveConditionalFormatting()
    Dim wsK As Worksheet
    Set wsK = ThisWorkbook.Worksheets("Kalender")

    ' IMPORTANT: update this range if your assignment area differs
    Dim rng As Range
    Set rng = wsK.Range("E8:OJ78")

    ' Add two CF rules at TOP with StopIfTrue so weekend gray won't override
    Dim fcU As FormatCondition, fcK As FormatCondition

    ' Rule for K (red)
    Set fcK = rng.FormatConditions.Add(Type:=xlExpression, Formula1:="=PreLeaveType(E8)=2")
    fcK.Interior.Color = RGB(255, 0, 0) ' red
    fcK.StopIfTrue = True
    fcK.SetFirstPriority

    ' Rule for U (dark orange)
    Set fcU = rng.FormatConditions.Add(Type:=xlExpression, Formula1:="=PreLeaveType(E8)=1")
    fcU.Interior.Color = RGB(191, 144, 0) ' dark orange
    fcU.StopIfTrue = True
    fcU.SetFirstPriority

    MsgBox "Pre-leave CF installed (U/K rules are now above weekend gray).", vbInformation
End Sub

' ===== When Urlaub gets U/K -> remove assignments in Kalender for those dates =====

Public Sub RemoveAssignmentsFromKalenderOnUrlaubChange(ByVal Target As Range)
    On Error GoTo SafeExit

    Dim wsU As Worksheet, wsK As Worksheet
    Set wsU = ThisWorkbook.Worksheets("Urlaub")
    Set wsK = ThisWorkbook.Worksheets("Kalender")

    Dim changed As Range
    Set changed = Intersect(Target, wsU.UsedRange)
    If changed Is Nothing Then GoTo SafeExit

    ' Build date->column map for Kalender once
    Dim kDateCol As Object
    Set kDateCol = BuildDateColDict(wsK)

    Dim msgDict As Object
    Set msgDict = CreateObject("Scripting.Dictionary")

    Dim cell As Range
    Dim v As String, drv As String
    Dim dt As Date
    Dim colK As Long, cleared As Long, totalCleared As Long

    Application.EnableEvents = False

    For Each cell In changed.Cells
        v = UCase$(Trim$(CStr(cell.Value)))
        If v <> "U" And v <> "K" Then GoTo NextCell

        ' Driver name must be in column B on Urlaub
        drv = Trim$(CStr(wsU.Cells(cell.Row, 2).Value))
        If Len(drv) < 3 Then GoTo NextCell

        ' Date from Urlaub headers (rows 2/3/4)
        dt = GetKalenderDateFromHeaders(wsU, cell.Column)
        If dt = 0 Then GoTo NextCell

        If Not kDateCol.exists(CLng(dt)) Then GoTo NextCell
        colK = CLng(kDateCol(CLng(dt)))

        ' Clear assignments in Kalender in that day column (only within assignment range)
        cleared = ClearDriverInKalenderDay(wsK, drv, colK)
        If cleared > 0 Then
            totalCleared = totalCleared + cleared

            ' Old had non-ASCII text -> replaced with ASCII English
            Dim oneMsg As String
            oneMsg = "Assignment removed: " & drv & " - " & Format$(dt, "dd/mm/yyyy") & _
                     " (Urlaub has '" & v & "')"


            If Not msgDict.exists(oneMsg) Then msgDict.Add oneMsg, 1
        End If

NextCell:
    Next cell

SafeExit:
    Application.EnableEvents = True

    ' Refresh cache + highlights
    On Error Resume Next
    InvalidateUrlaubCache
    UpdateKalenderLeaveHighlights
    On Error GoTo 0

    If msgDict.Count > 0 Then
        Dim k As Variant, outMsg As String
        outMsg = ""
        For Each k In msgDict.Keys
            outMsg = outMsg & CStr(k) & vbCrLf
        Next k
        MsgBox outMsg, vbExclamation + vbOKOnly, "Assignments cleared (Urlaub U/K)"
    End If

End Sub

Private Function ClearDriverInKalenderDay(ByVal wsK As Worksheet, ByVal drv As String, ByVal colK As Long) As Long
    ' IMPORTANT: adjust if your assignment range changes
    Dim rngAssign As Range
    Set rngAssign = wsK.Range("E8:OJ78")

    If colK < rngAssign.Column Or colK > (rngAssign.Column + rngAssign.Columns.Count - 1) Then Exit Function

    Dim r As Long, firstRow As Long, lastRow As Long
    firstRow = rngAssign.Row
    lastRow = rngAssign.Row + rngAssign.Rows.Count - 1

    For r = firstRow To lastRow
        If Trim$(CStr(wsK.Cells(r, colK).Value)) = drv Then
            wsK.Cells(r, colK).ClearContents
            ClearDriverInKalenderDay = ClearDriverInKalenderDay + 1
        End If
    Next r
End Function

Private Function BuildDateColDict(ByVal ws As Worksheet) As Object
    Dim dict As Object
    Set dict = CreateObject("Scripting.Dictionary")

    Dim lastCol As Long, c As Long
    lastCol = ws.Cells(4, ws.Columns.Count).End(xlToLeft).Column

    For c = 1 To lastCol
        Dim dt As Date
        dt = GetKalenderDateFromHeaders(ws, c)
        If dt <> 0 Then
            If Not dict.exists(CLng(dt)) Then dict.Add CLng(dt), c
        End If
    Next c

    Set BuildDateColDict = dict
End Function

' === Block assignments if LKW is sold/returned since a given date (sheet "LKW") ===
Public Function IsLkwSoldReturnedOnDate(ByVal lkwID As String, ByVal assignDate As Date, ByRef msg As String) As Boolean
    On Error GoTo SafeExit

    Dim wsL As Worksheet
    Set wsL = ThisWorkbook.Worksheets("LKW")

    Dim r As Variant
    r = Application.Match(lkwID, wsL.Columns(1), 0) ' Col A = LKW-ID
    If IsError(r) Then GoTo SafeExit

    Dim statusRaw As String, statusNorm As String
    statusRaw = Trim$(CStr(wsL.Cells(CLng(r), 12).Value)) ' Col L = Status
    statusNorm = UCase$(statusRaw)

    ' Normalize German umlauts/variants: Rueckgabe / Rueckgabe / Ruckgabe
    statusNorm = Replace(statusNorm, "UE", "U")
    statusNorm = Replace(statusNorm, "UE", "U")

    If statusNorm <> "VERKAUFT" And statusNorm <> "RUCKGABE" Then GoTo SafeExit

    Dim dVal As Variant
    dVal = wsL.Cells(CLng(r), 13).Value ' Col M = Date (Datum verkauft / Rueckgabe date)
    
    ' Assumption (safer): if status is set but date is missing/not a date -> block anyway
    If Not IsDate(dVal) Then
        msg = "LKW " & lkwID & " has status '" & statusRaw & "' but no valid date in LKW!M. Assignment blocked."
        IsLkwSoldReturnedOnDate = True
        Exit Function
    End If

    Dim d0 As Date
    d0 = CDate(dVal)

    If assignDate >= d0 Then
        msg = "LKW " & lkwID & " is '" & statusRaw & "' since " & Format$(d0, "dd/mm/yyyy") & ". Assignment not allowed."
        IsLkwSoldReturnedOnDate = True
        Exit Function
    End If

SafeExit:
End Function
Public Sub Refresh_All_Kalender()
    ThisWorkbook.Worksheets("Kalender").Rows(7).Hidden = False
    Dim oldCalc As XlCalculation
    oldCalc = Application.Calculation

    On Error GoTo CleanFail

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    ' 1) Pre-leave highlights (U/K day-before)
    UpdateKalenderLeaveHighlights

    ' 2) Sold/Returned helpers + clear blocked assignments
    'EnsureKalenderHelperDates_Row7
    UpdateSoldReturnedHelpersAndClear False

    ' Force full recalculation so Excel does not show "stale" strikethrough
    Application.CalculateFullRebuild

CleanExit:
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub

CleanFail:
    ' Always restore
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "Refresh failed: " & Err.Description, vbExclamation, "Refresh"
End Sub



' =========================================================
' Sold/Returned (Verkauft / Ruckgabe) support for Kalender
' - Fills helper dates into row 7 (real Excel dates per column)
' - Writes SoldFromDate into column D (per LKW row)
' - Clears assignments from SoldFromDate onwards
' - Adds conditional formatting to paint blocked cells red
' =========================================================



Public Sub EnsureKalenderHelperDates_Row7()
    Dim wsK As Worksheet
    Set wsK = ThisWorkbook.Worksheets("Kalender")

    Dim lastCol As Long, c As Long
    lastCol = wsK.Cells(4, wsK.Columns.Count).End(xlToLeft).Column

    For c = 5 To lastCol ' from column E
        Dim dt As Date
        dt = 0
        If TryGetDateFromKalenderHeader(wsK, c, dt) Then
            wsK.Cells(SR_HELPER_DATE_ROW, c).Value = dt
            wsK.Cells(SR_HELPER_DATE_ROW, c).NumberFormat = "dd.mm.yyyy"
        Else
            wsK.Cells(SR_HELPER_DATE_ROW, c).ClearContents
        End If
    Next c

    ' Optional: hide helper row
    ' wsK.Rows(SR_HELPER_DATE_ROW).Hidden = True

End Sub

Public Sub UpdateSoldReturnedHelpersAndClear(Optional ByVal showMsg As Boolean = False)
    Dim wsK As Worksheet, wsL As Worksheet
    Set wsK = ThisWorkbook.Worksheets("Kalender")
    Set wsL = ThisWorkbook.Worksheets("LKW")

    Call EnsureKalenderHelperDates_Row7

    'Dim soldDict As Object
    'Set soldDict = CreateObject("Scripting.Dictionary") ' key = LKW-ID, item = Date

    ' LKW sheet:
    ' Col A = LKW-ID
    ' Col L = Status (Verkauft / Ruckgabe / Rueckgabe)
    ' Col M = Date
    'Dim lastRowL As Long, i As Long
    'lastRowL = wsL.Cells(wsL.Rows.Count, 1).End(xlUp).Row

    'For i = 2 To lastRowL
        'Dim id As String, st As String, stNorm As String, dv As Variant
        'id = Trim$(CStr(wsL.Cells(i, 1).Value))
        'If Len(id) = 0 Then GoTo NextL

        'st = Trim$(CStr(wsL.Cells(i, 12).Value)) ' L
        'stNorm = UCase$(st)
        
        ' Normalize variants: RUECKGABE / RUCKGABE
        'stNorm = Replace(stNorm, "UE", "U")
        'stNorm = Replace(stNorm, "UE", "U")
        
        ' Only act for sold/returned
        'If stNorm <> "VERKAUFT" And stNorm <> "RUCKGABE" Then GoTo NextL
        
        'dv = wsL.Cells(i, 13).Value ' M (status date)
        
        'Dim dParsed As Date
        'If TryParseDateLoose(dv, dParsed) Then
            'soldDict(id) = dParsed
        'End If


        
'NextL:
    'Next i

    Dim lastRowK As Long
    lastRowK = wsK.Cells(wsK.Rows.Count, SR_LKWID_COL).End(xlUp).Row
    If lastRowK < SR_FIRST_ROW Then Exit Sub

    Dim lastColK As Long, r As Long, c As Long
    lastColK = wsK.Cells(4, wsK.Columns.Count).End(xlToLeft).Column

    Dim clearedTotal As Long
    clearedTotal = 0

    Application.ScreenUpdating = False
    Application.EnableEvents = False

    For r = SR_FIRST_ROW To lastRowK
        Dim lkwID As String
        lkwID = Trim$(CStr(wsK.Cells(r, SR_LKWID_COL).Value))

        If Len(lkwID) = 0 Then
            'wsK.Cells(r, SR_SOLD_FROM_COL).ClearContents
            GoTo NextR
        End If

        If soldDict.exists(lkwID) Then
            Dim soldFromV As Variant
            soldFromV = wsK.Cells(r, SR_SOLD_FROM_COL).Value  ' OK has a formula
            
            If IsDate(soldFromV) Then
                Dim soldFrom As Date
                soldFrom = CDate(soldFromV)
            
                ' Clear assignments from soldFrom onwards
                For c = 5 To lastColK
                    Dim colDate As Date
                    colDate = 0
            
                    If TryGetDateFromKalenderHeader(wsK, c, colDate) Then
                        If colDate >= soldFrom Then
                            If Len(Trim$(CStr(wsK.Cells(r, c).Value))) > 0 Then
                                wsK.Cells(r, c).ClearContents
                                clearedTotal = clearedTotal + 1
                            End If
                        End If
                    End If
                Next c
            End If

        Else
            'wsK.Cells(r, SR_SOLD_FROM_COL).ClearContents
        End If

NextR:
    Next r

    Application.EnableEvents = True
    Application.ScreenUpdating = True

    If showMsg And clearedTotal > 0 Then
        MsgBox "Cleared " & clearedTotal & " assignment(s) due to Sold/Returned dates.", vbExclamation, "Sold/Returned"
    End If
End Sub

Public Sub InstallSoldReturnedCF_Red()
    Dim wsK As Worksheet
    Set wsK = ThisWorkbook.Worksheets("Kalender")

    Call EnsureKalenderHelperDates_Row7

    Dim rng As Range
    Set rng = wsK.Range(SR_ASSIGN_RANGE)

    ' Formula uses helper column D (SoldFromDate) and helper row 7 (column date)
    ' Works without weekend gray rule.
    Dim f As String
    f = "=AND($OK8<>"""",E$7>=$OK8)"

    Dim fc As FormatCondition
    Set fc = rng.FormatConditions.Add(Type:=xlExpression, Formula1:=f)
    fc.Interior.Pattern = xlSolid
    fc.Interior.Color = RGB(255, 0, 0) ' red

    MsgBox "Sold/Returned red CF installed.", vbInformation, "Install"
End Sub

' Parse a date value that might be a real Date or a text like "08/12/2025" or "08.12.2025".
' Assumption: default is DMY (common in Germany). If ambiguous (<=12/<=12), DMY is used.
' Robust date parser:
' - accepts real Date
' - accepts Excel serial numbers (numeric or numeric text)
' - accepts text like "08/12/2025", "08.12.2025", "08-12-2025"
' Assumption: if ambiguous (<=12/<=12), DMY is used (common in Germany).
Private Function TryParseDateLoose(ByVal v As Variant, ByRef outDate As Date) As Boolean
    On Error GoTo Fail

    ' Real date
    If IsDate(v) Then
        outDate = CDate(v)
        TryParseDateLoose = True
        Exit Function
    End If

    ' Excel serial as number or numeric text
    If IsNumeric(v) Then
        outDate = DateSerial(1899, 12, 30) + CDbl(v)
        TryParseDateLoose = True
        Exit Function
    End If

    Dim s As String
    s = CStr(v)

    ' Clean spaces (including non-breaking space)
    s = Replace(s, Chr$(160), " ")
    s = Trim$(s)
    If Len(s) = 0 Then Exit Function

    ' Normalize separators
    s = Replace(s, "-", "/")
    s = Replace(s, ".", "/")

    Dim parts() As String
    parts = Split(s, "/")
    If UBound(parts) <> 2 Then Exit Function

    Dim p0 As String, p1 As String, p2 As String
    p0 = Trim$(parts(0))
    p1 = Trim$(parts(1))
    p2 = Trim$(parts(2))

    If Not (IsNumeric(p0) And IsNumeric(p1) And IsNumeric(p2)) Then Exit Function

    Dim a As Long, b As Long, y As Long
    a = CLng(p0)
    b = CLng(p1)
    y = CLng(p2)

    ' 2-digit year fallback
    If y < 100 Then y = 2000 + y

    ' Decide DMY vs MDY if possible
    If a > 12 Then
        outDate = DateSerial(y, b, a) ' DMY
    ElseIf b > 12 Then
        outDate = DateSerial(y, a, b) ' MDY
    Else
        outDate = DateSerial(y, b, a) ' default DMY
    End If

    TryParseDateLoose = True
    Exit Function

Fail:
    TryParseDateLoose = False
End Function




