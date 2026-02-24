Attribute VB_Name = "modSync_WeeklyGrid"
Option Explicit

' ============================================================
' Build weekly grid (Plan) from daily calendar (Data!Kalender) and detect transfers.
' This module ONLY writes within the selected week columns (minSelCol..maxSelCol, rows LKW).
' ============================================================

Private Const PLAN_LKW_FIRSTROW As Long = 4
Private Const PLAN_LKWID_COL As Long = 1 'A

Private Const DATA_YEAR_ROW As Long = 2
Private Const DATA_KW_ROW As Long = 6
Private Const DATA_LKW_FIRSTROW As Long = 8
Private Const DATA_LKWID_COL As Long = 1 'A
Private Const DATA_GRID_LEFTCOL As Long = 5 'E

Private Const SEP As String = " / "

Public Sub Sync_WeeklyGrid_FromDataKalender(ByVal wsPlan As Worksheet, ByVal wsKal As Worksheet, ByVal wsUrlaub As Worksheet, _
                                           ByVal startCode As Long, ByVal endCode As Long, ByVal endCodePlus1 As Long, _
                                           ByVal dictPlanWeekCol As Object, _
                                           ByVal minSelCol As Long, ByVal maxSelCol As Long)

    Dim lastPlanLKWRow As Long
    lastPlanLKWRow = GetLastPlanLKWRow(wsPlan)
    
    ' --- Build Urlaub maps (DriverName -> row, WeekCode -> day columns) ---
    Dim dictUrlaubNameRow As Object
    Set dictUrlaubNameRow = CreateObject("Scripting.Dictionary")
    dictUrlaubNameRow.CompareMode = vbTextCompare
    
    Dim dictUrlaubWeekCols As Object
    Set dictUrlaubWeekCols = CreateObject("Scripting.Dictionary")
    dictUrlaubWeekCols.CompareMode = vbTextCompare
    
    BuildUrlaubMaps wsUrlaub, startCode, endCodePlus1, dictUrlaubNameRow, dictUrlaubWeekCols

    ' Build plan row map (LKW-ID -> relative row in output array)
    Dim dictPlanRowRel As Object
    Set dictPlanRowRel = CreateObject("Scripting.Dictionary")
    dictPlanRowRel.CompareMode = vbTextCompare

    Dim r As Long, relR As Long, lkwId As String
    relR = 0
    For r = PLAN_LKW_FIRSTROW To lastPlanLKWRow
        lkwId = Trim$(CStr(wsPlan.Cells(r, PLAN_LKWID_COL).Value2))
        If lkwId Like "L###" Then
            relR = relR + 1
            dictPlanRowRel.Add lkwId, relR
        End If
    Next r

    ' Read existing values into buffer (so we don't touch weeks outside the configured range)
    Dim rngOut As Range
    Set rngOut = wsPlan.Range(wsPlan.Cells(PLAN_LKW_FIRSTROW, minSelCol), wsPlan.Cells(lastPlanLKWRow, maxSelCol))
    Dim arrOut As Variant
    arrOut = rngOut.Value2

    ' Build Data week -> day columns map (only for needed range start..endPlus1)
    Dim dictDataWeekCols As Object, maxDataColNeeded As Long
    Set dictDataWeekCols = CreateObject("Scripting.Dictionary")
    dictDataWeekCols.CompareMode = vbTextCompare

    BuildDataWeekDayCols wsKal, startCode, endCodePlus1, dictDataWeekCols, maxDataColNeeded
    If maxDataColNeeded = 0 Then Err.Raise vbObjectError + 2001, , "No matching week columns found in Data!Kalender."

    ' Determine last populated LKW row dynamically to avoid truncation when new rows are added.
    Dim lastDataRow As Long
    lastDataRow = wsKal.Cells(wsKal.Rows.Count, DATA_LKWID_COL).End(xlUp).Row
    If lastDataRow < DATA_LKW_FIRSTROW Then Err.Raise vbObjectError + 2002, , "No LKW IDs found in Data!Kalender."

    ' Read Data grid into array (rows 8..lastDataRow, cols E..maxDataColNeeded)
    Dim rngData As Range
    Set rngData = wsKal.Range(wsKal.Cells(DATA_LKW_FIRSTROW, DATA_GRID_LEFTCOL), wsKal.Cells(lastDataRow, maxDataColNeeded))
    Dim arrD As Variant
    arrD = rngData.Value2

    ' Read Data LKW IDs (A8:A lastDataRow)
    Dim arrDataIDs As Variant
    arrDataIDs = wsKal.Range(wsKal.Cells(DATA_LKW_FIRSTROW, DATA_LKWID_COL), wsKal.Cells(lastDataRow, DATA_LKWID_COL)).Value2

    ' Build Data row map: LKW-ID -> row index in arrD
    Dim dictDataRow As Object
    Set dictDataRow = CreateObject("Scripting.Dictionary")
    dictDataRow.CompareMode = vbTextCompare

    Dim i As Long, kId As Variant, id As String
    For i = 1 To UBound(arrDataIDs, 1)
        id = Trim$(CStr(arrDataIDs(i, 1)))
        If Len(id) > 0 Then dictDataRow(id) = i
    Next i

    ' For each selected Plan week column: aggregate values from Data day columns
    Dim kCode As Variant, code As Long, planCol As Long, outColRel As Long
    Dim weekCols As Variant

    For Each kCode In dictPlanWeekCol.Keys
        code = CLng(kCode)
        If code >= startCode And code <= endCode Then
            planCol = CLng(dictPlanWeekCol(CStr(code)))
            If planCol >= minSelCol And planCol <= maxSelCol Then
                outColRel = planCol - minSelCol + 1

                If dictDataWeekCols.Exists(CStr(code)) Then
                    weekCols = dictDataWeekCols(CStr(code)) ' 1D array of day col indices (absolute in wsKal)
                Else
                    weekCols = Empty
                End If

                For Each kId In dictPlanRowRel.Keys
                    id = CStr(kId)
                    relR = CLng(dictPlanRowRel(id))
                    Dim dataRow As Long
                    If dictDataRow.Exists(id) Then
                        dataRow = CLng(dictDataRow(id))
                        arrOut(relR, outColRel) = AggregateWeekCell(arrD, dataRow, weekCols, dictDataWeekCols, code, wsUrlaub, dictUrlaubNameRow, dictUrlaubWeekCols)
                    Else
                        arrOut(relR, outColRel) = vbNullString
                    End If
                Next kId
            End If
        End If
    Next kCode

    ' === Transfer arrows ? ===
    DetectTransfers_AndAnnotate arrOut, dictPlanRowRel, dictPlanWeekCol, minSelCol, startCode, endCode, _
                                wsKal, arrD, arrDataIDs, dictDataWeekCols, startCode, endCodePlus1, _
                                wsUrlaub, dictUrlaubNameRow, dictUrlaubWeekCols

    ' Write back
    rngOut.Value2 = arrOut
End Sub

' ============================================================
' Week aggregation (daily -> weekly)
' ============================================================
Private Function AggregateWeekCell(ByRef arrD As Variant, ByVal dataRow As Long, ByVal weekCols As Variant, _
                                   ByVal dictDataWeekCols As Object, ByVal thisCode As Long, _
                                   ByVal wsUrlaub As Worksheet, ByVal dictUrlaubNameRow As Object, ByVal dictUrlaubWeekCols As Object) As String
    Dim dictDrivers As Object, dictStatus As Object
    Set dictDrivers = CreateObject("Scripting.Dictionary")
    dictDrivers.CompareMode = vbTextCompare
    Set dictStatus = CreateObject("Scripting.Dictionary")
    dictStatus.CompareMode = vbTextCompare

    Dim c As Variant, v As String
    If IsEmpty(weekCols) Then
        AggregateWeekCell = vbNullString
        Exit Function
    End If

    For Each c In weekCols
        v = NormalizeCellValue(CStr(arrD(dataRow, CLng(c) - DATA_GRID_LEFTCOL + 1)))
        If Len(v) > 0 Then
            CollectTokens v, dictDrivers, dictStatus
        End If
    Next c

    Dim outText As String
    outText = BuildOutputText(dictDrivers, dictStatus)

    ' Next-week U/K indicator (from Data!Urlaub)
    If dictDrivers.Count > 0 Then
        outText = AppendNextWeekUK_FromUrlaub(outText, dictDrivers, dictUrlaubNameRow, dictUrlaubWeekCols, thisCode, wsUrlaub)
    End If

    AggregateWeekCell = outText
End Function

Private Sub BuildUrlaubMaps(ByVal wsUrlaub As Worksheet, ByVal startCode As Long, ByVal endCodePlus1 As Long, _
                            ByRef dictNameRow As Object, ByRef dictWeekCols As Object)
    ' Urlaub layout (source):
    ' Names: B6:B96
    ' Year: row 1
    ' KW: row 5
    ' Grid: H6:OM96
    Const NAME_COL As Long = 2 'B
    Const FIRST_ROW As Long = 6
    Const LAST_ROW As Long = 96
    Const YEAR_ROW As Long = 1
    Const KW_ROW As Long = 5
    Const GRID_LEFTCOL As Long = 8 'H

    dictNameRow.RemoveAll
    dictWeekCols.RemoveAll

    Dim r As Long, nm As String
    For r = FIRST_ROW To LAST_ROW
        nm = Trim$(CStr(wsUrlaub.Cells(r, NAME_COL).Value2))
        If Len(nm) > 0 Then
            If Not dictNameRow.Exists(nm) Then dictNameRow.Add nm, r
        End If
    Next r

    Dim lastCol As Long
    lastCol = wsUrlaub.Cells(KW_ROW, wsUrlaub.Columns.Count).End(xlToLeft).Column

    Dim c As Long, y As Long, w As Long, code As Long
    For c = GRID_LEFTCOL To lastCol
        y = CLng(Val(wsUrlaub.Cells(YEAR_ROW, c).Value2))
        w = CLng(Val(wsUrlaub.Cells(KW_ROW, c).Value2))
        If y > 0 And w > 0 Then
            code = WeekCode(y, w)
            If code >= startCode And code <= endCodePlus1 Then
                If Not dictWeekCols.Exists(CStr(code)) Then
                    dictWeekCols.Add CStr(code), Array(c)
                Else
                    dictWeekCols(CStr(code)) = AppendLongToArray(dictWeekCols(CStr(code)), c)
                End If
            End If
        End If
    Next c
End Sub

Private Function AppendNextWeekUK_FromUrlaub(ByVal baseText As String, ByVal dictDrivers As Object, _
                                            ByVal dictUrlaubNameRow As Object, ByVal dictUrlaubWeekCols As Object, _
                                            ByVal thisCode As Long, ByVal wsUrlaub As Worksheet) As String
    Dim nextCode As Long
    nextCode = FindNextCodeInData(dictUrlaubWeekCols, thisCode)
    If nextCode = 0 Then
        AppendNextWeekUK_FromUrlaub = baseText
        Exit Function
    End If
    If Not dictUrlaubWeekCols.Exists(CStr(nextCode)) Then
        AppendNextWeekUK_FromUrlaub = baseText
        Exit Function
    End If

    Dim cols As Variant
    cols = dictUrlaubWeekCols(CStr(nextCode)) ' absolute columns in wsUrlaub for that week

    Dim parts() As String
    parts = Split(baseText, SEP)

    Dim i As Long, namePart As String, drv As Variant
    For Each drv In dictDrivers.Keys
        Dim drvName As String
        drvName = CStr(drv)

        If dictUrlaubNameRow.Exists(drvName) Then
            Dim rUr As Long
            rUr = CLng(dictUrlaubNameRow(drvName))

            Dim cntU As Long, cntK As Long
            Dim c As Variant, t As String
            For Each c In cols
                t = UCase$(Trim$(CStr(wsUrlaub.Cells(rUr, CLng(c)).Value2)))
                If t = "U" Then cntU = cntU + 1
                If t = "K" Then cntK = cntK + 1
            Next c

            If (cntU > 0) Or (cntK > 0) Then
                Dim letter As String
                If cntU > cntK Then
                    letter = " U"
                Else
                    letter = " K"
                End If

                ' append to matching driver token(s)
                For i = LBound(parts) To UBound(parts)
                    namePart = Trim$(parts(i))
                    If StrComp(ExtractDriverBaseName(namePart), drvName, vbTextCompare) = 0 Then
                        If Right$(namePart, 2) <> " U" And Right$(namePart, 2) <> " K" Then
                            parts(i) = namePart & letter
                        End If
                    End If
                Next i
            End If
        End If
    Next drv

    AppendNextWeekUK_FromUrlaub = Join(parts, SEP)
End Function

Private Sub CollectTokens(ByVal cellText As String, ByVal dictDrivers As Object, ByVal dictStatus As Object)
    Dim cleaned As String
    cleaned = Replace(cellText, vbCr, vbLf)

    Dim pieces() As String, i As Long
    pieces = Split(cleaned, vbLf)

    For i = LBound(pieces) To UBound(pieces)
        Dim lineText As String
        lineText = Trim$(pieces(i))
        If Len(lineText) = 0 Then GoTo NextLine

        Dim norm As String
        norm = Replace(Replace(Replace(lineText, " / ", "/"), " /", "/"), "/ ", "/")

        Dim subTokens() As String, j As Long, t As String
        subTokens = Split(norm, "/")

        For j = LBound(subTokens) To UBound(subTokens)
            t = NormalizeDriverToken(Trim$(subTokens(j)))
            If Len(t) > 0 Then
                If IsSpecialMarker(t) Then
                    If Not dictStatus.Exists(t) Then dictStatus.Add t, True
                Else
                    If Not dictDrivers.Exists(t) Then dictDrivers.Add t, True
                End If
            End If
        Next j
NextLine:
    Next i
End Sub

Private Function BuildOutputText(ByVal dictDrivers As Object, ByVal dictStatus As Object) As String
    Dim outText As String
    Dim k As Variant

    If dictDrivers.Count = 0 Then
        If dictStatus.Count = 0 Then
            BuildOutputText = vbNullString
            Exit Function
        End If

        For Each k In dictStatus.Keys
            If Len(outText) > 0 Then outText = outText & SEP
            outText = outText & CStr(k)
        Next k
        BuildOutputText = outText
        Exit Function
    End If

    For Each k In dictDrivers.Keys
        If Len(outText) > 0 Then outText = outText & SEP
        outText = outText & CStr(k)
    Next k

    ' OPTIONAL: append statuses after drivers
    For Each k In dictStatus.Keys
        If Len(outText) > 0 Then outText = outText & SEP
        outText = outText & CStr(k)
    Next k

    BuildOutputText = outText
End Function

Private Function NormalizeCellValue(ByVal s As String) As String
    NormalizeCellValue = Trim$(Replace(Replace(s, ChrW(160), " "), vbTab, " "))
End Function

Private Function NormalizeDriverToken(ByVal rawToken As String) As String
    Dim t As String
    t = Trim$(rawToken)
    If Len(t) = 0 Then
        NormalizeDriverToken = vbNullString
        Exit Function
    End If

    ' Keep pure marker tokens as-is.
    If IsSpecialMarker(t) Then
        NormalizeDriverToken = t
        Exit Function
    End If

    ' Defensive cleanup: source can contain trailing " U"/" K" in names.
    ' Remove it so U/K is controlled only by next-week Urlaub logic.
    NormalizeDriverToken = StripStandaloneSuffixUK(t)
End Function

Private Function StripStandaloneSuffixUK(ByVal token As String) As String
    Dim s As String
    s = Trim$(token)
    Do While Len(s) >= 2
        Dim suf As String
        suf = UCase$(Right$(s, 2))
        If suf = " U" Or suf = " K" Then
            s = Trim$(Left$(s, Len(s) - 2))
        Else
            Exit Do
        End If
    Loop
    StripStandaloneSuffixUK = s
End Function

Private Function ExtractDriverBaseName(ByVal token As String) As String
    Dim s As String
    s = Trim$(token)
    s = Replace(s, ChrW(8596), "")
    s = StripStandaloneSuffixUK(s)
    ExtractDriverBaseName = Trim$(s)
End Function

' ============================================================
' Special marker detection
' FIX: treat VERKAUFT / MIETE as markers (not drivers), so no transfer arrows are added.
' Also robust to dots/spaces/slashes/dashes and case.
' ============================================================
Private Function IsSpecialMarker(ByVal s As String) As Boolean
    Dim up As String, upClean As String
    up = UCase$(Trim$(CStr(s)))

    upClean = up
    upClean = Replace(upClean, ".", "")
    upClean = Replace(upClean, " ", "")
    upClean = Replace(upClean, "/", "")
    upClean = Replace(upClean, "-", "")

    Select Case upClean
        Case "", "0", "U", "K", "R", "OF", "OHNELKW", "WERKSTATT", "ERSATZWAGEN", "VERKAUFT", "MIETE"
            IsSpecialMarker = True
        Case Else
            IsSpecialMarker = False
    End Select
End Function

' ============================================================
' Data!Kalender: build weekCode -> list of day columns (absolute)
' ============================================================
Private Sub BuildDataWeekDayCols(ByVal wsKal As Worksheet, _
                                ByVal startCode As Long, ByVal endCodePlus1 As Long, _
                                ByRef dictWeekCols As Object, _
                                ByRef maxColNeeded As Long)

    dictWeekCols.RemoveAll
    maxColNeeded = 0

    Dim lastCol As Long
    lastCol = wsKal.Cells(DATA_KW_ROW, wsKal.Columns.Count).End(xlToLeft).Column

    Dim c As Long, y As Long, w As Long, code As Long
    For c = DATA_GRID_LEFTCOL To lastCol
        y = CLng(Val(wsKal.Cells(DATA_YEAR_ROW, c).Value2))
        w = CLng(Val(wsKal.Cells(DATA_KW_ROW, c).Value2))
        If y > 0 And w > 0 Then
            code = WeekCode(y, w)
            If code >= startCode And code <= endCodePlus1 Then
                If Not dictWeekCols.Exists(CStr(code)) Then
                    dictWeekCols.Add CStr(code), Array(c)
                Else
                    dictWeekCols(CStr(code)) = AppendLongToArray(dictWeekCols(CStr(code)), c)
                End If
                If c > maxColNeeded Then maxColNeeded = c
            End If
        End If
    Next c
End Sub

Private Function AppendLongToArray(ByVal arr As Variant, ByVal v As Long) As Variant
    Dim n As Long
    If IsEmpty(arr) Then
        AppendLongToArray = Array(v)
        Exit Function
    End If
    n = UBound(arr) - LBound(arr) + 1
    ReDim Preserve arr(0 To n)
    arr(n) = v
    AppendLongToArray = arr
End Function

Private Function FindNextCodeInData(ByVal dictDataWeekCols As Object, ByVal code As Long) As Long
    Dim k As Variant, best As Long
    best = 0
    For Each k In dictDataWeekCols.Keys
        If CLng(k) > code Then
            If best = 0 Or CLng(k) < best Then best = CLng(k)
        End If
    Next k
    FindNextCodeInData = best
End Function

' ============================================================
' Transfer detection (daily timeline -> annotate weekly cells)
' ============================================================
Public Sub DetectTransfers_AndAnnotate(ByRef arrOut As Variant, _
                                      ByVal dictPlanRowRel As Object, _
                                      ByVal dictPlanWeekCol As Object, _
                                      ByVal minSelCol As Long, _
                                      ByVal startCode As Long, ByVal endCode As Long, _
                                      ByVal wsKal As Worksheet, _
                                      ByRef arrD As Variant, _
                                      ByRef arrDataIDs As Variant, _
                                      ByVal dictDataWeekCols As Object, _
                                      ByVal scanStartCode As Long, ByVal scanEndCode As Long, _
                                      ByVal wsUrlaub As Worksheet, _
                                      ByVal dictUrlaubNameRow As Object, _
                                      ByVal dictUrlaubWeekCols As Object)

    Dim dictTransfers As Object
    Set dictTransfers = CreateObject("Scripting.Dictionary")
    dictTransfers.CompareMode = vbTextCompare

    Dim dayCols As Variant, dayCodes As Variant
    BuildDayColList wsKal, scanStartCode, scanEndCode, dayCols, dayCodes
    If IsEmpty(dayCols) Then Exit Sub

    Dim dayIdxInWeek() As Long
    dayIdxInWeek = BuildDayIndexWithinWeek(dayCodes)

    Dim dictLast As Object
    Set dictLast = CreateObject("Scripting.Dictionary")
    dictLast.CompareMode = vbTextCompare

    Dim pos As Long, cAbs As Long, wkCode As Long
    Dim dataRowRel As Long, lkwId As String, txt As String
    Dim norm As String, tokens As Variant, t As Variant, driver As String

    For pos = LBound(dayCols) To UBound(dayCols)
        cAbs = CLng(dayCols(pos))
        wkCode = CLng(dayCodes(pos))

        For dataRowRel = 1 To UBound(arrDataIDs, 1)
            lkwId = Trim$(CStr(arrDataIDs(dataRowRel, 1)))
            If Len(lkwId) = 0 Then GoTo NextRow

            txt = NormalizeCellValue(CStr(arrD(dataRowRel, cAbs - DATA_GRID_LEFTCOL + 1)))
            If Len(txt) = 0 Then GoTo NextRow

            norm = Replace(Replace(Replace(txt, " / ", "/"), " /", "/"), "/ ", "/")
            tokens = Split(norm, "/")

            For Each t In tokens
                driver = Trim$(CStr(t))
                If Len(driver) = 0 Then GoTo NextToken
                If IsSpecialMarker(driver) Then GoTo NextToken

                If dictLast.Exists(driver) Then
                    Dim lastInfo As Variant
                    lastInfo = dictLast(driver)

                    Dim lastLKW As String, lastCode As Long, lastPos As Long
                    lastLKW = CStr(lastInfo(0))
                    lastCode = CLng(lastInfo(1))
                    lastPos = CLng(lastInfo(2))

                    If StrComp(lastLKW, lkwId, vbTextCompare) <> 0 Then
                        If Not HasUrlaubUKBetween(driver, lastPos + 1, pos - 1, _
                                                 dayCodes, dayIdxInWeek, _
                                                 wsUrlaub, dictUrlaubNameRow, dictUrlaubWeekCols) Then
                            Dim key As String
                            key = lastLKW & "|" & CStr(lastCode) & "|" & driver
                            If Not dictTransfers.Exists(key) Then dictTransfers.Add key, True
                        End If
                    End If
                End If

                dictLast(driver) = Array(lkwId, wkCode, pos)

NextToken:
            Next t

NextRow:
        Next dataRowRel
    Next pos

    Dim k As Variant, parts() As String
    For Each k In dictTransfers.Keys
        parts = Split(CStr(k), "|")
        If UBound(parts) = 2 Then
            Dim oldLKW As String, oldCode As Long, drv As String
            oldLKW = parts(0)
            oldCode = CLng(parts(1))
            drv = parts(2)

            If oldCode >= startCode And oldCode <= endCode Then
                If dictPlanRowRel.Exists(oldLKW) And dictPlanWeekCol.Exists(CStr(oldCode)) Then
                    Dim planCol As Long, outColRel As Long, outRowRel As Long
                    planCol = CLng(dictPlanWeekCol(CStr(oldCode)))
                    outColRel = planCol - minSelCol + 1
                    outRowRel = CLng(dictPlanRowRel(oldLKW))

                    Dim cur As String
                    cur = CStr(arrOut(outRowRel, outColRel))
                    If Len(cur) > 0 Then
                        arrOut(outRowRel, outColRel) = InsertArrowForDriver(cur, drv)
                    End If
                End If
            End If
        End If
    Next k

End Sub

Private Function BuildDayIndexWithinWeek(ByRef dayCodes As Variant) As Long()
    Dim res() As Long
    ReDim res(LBound(dayCodes) To UBound(dayCodes))

    Dim dictCnt As Object
    Set dictCnt = CreateObject("Scripting.Dictionary")
    dictCnt.CompareMode = vbTextCompare

    Dim i As Long, codeKey As String, cnt As Long
    For i = LBound(dayCodes) To UBound(dayCodes)
        codeKey = CStr(dayCodes(i))
        If dictCnt.Exists(codeKey) Then
            cnt = CLng(dictCnt(codeKey)) + 1
            dictCnt(codeKey) = cnt
        Else
            cnt = 1
            dictCnt.Add codeKey, cnt
        End If
        res(i) = cnt
    Next i

    BuildDayIndexWithinWeek = res
End Function

Private Function HasUrlaubUKBetween(ByVal driver As String, _
                                   ByVal startPos As Long, ByVal endPos As Long, _
                                   ByRef dayCodes As Variant, ByRef dayIdxInWeek() As Long, _
                                   ByVal wsUrlaub As Worksheet, _
                                   ByVal dictUrlaubNameRow As Object, _
                                   ByVal dictUrlaubWeekCols As Object) As Boolean

    HasUrlaubUKBetween = False
    If startPos > endPos Then Exit Function
    If Not dictUrlaubNameRow.Exists(driver) Then Exit Function

    Dim rU As Long
    rU = CLng(dictUrlaubNameRow(driver))

    Dim p As Long, wk As Long, di As Long
    For p = startPos To endPos
        wk = CLng(dayCodes(p))
        di = dayIdxInWeek(p)

        If dictUrlaubWeekCols.Exists(CStr(wk)) Then
            Dim cols As Variant
            cols = dictUrlaubWeekCols(CStr(wk))

            If di >= 1 And di <= (UBound(cols) - LBound(cols) + 1) Then
                Dim cU As Long
                cU = CLng(cols(LBound(cols) + (di - 1)))

                Dim v As String
                v = UCase$(Trim$(CStr(wsUrlaub.Cells(rU, cU).Value2)))

                If v = "U" Or v = "K" Then
                    HasUrlaubUKBetween = True
                    Exit Function
                End If
            End If
        End If
    Next p
End Function

Private Sub BuildDayColList(ByVal wsKal As Worksheet, ByVal startCode As Long, ByVal endCode As Long, _
                           ByRef outCols As Variant, ByRef outCodes As Variant)
    Dim lastCol As Long
    lastCol = wsKal.Cells(DATA_KW_ROW, wsKal.Columns.Count).End(xlToLeft).Column

    Dim tmpCols() As Long, tmpCodes() As Long
    Dim n As Long: n = -1

    Dim c As Long, y As Long, w As Long, code As Long
    For c = DATA_GRID_LEFTCOL To lastCol
        y = CLng(Val(wsKal.Cells(DATA_YEAR_ROW, c).Value2))
        w = CLng(Val(wsKal.Cells(DATA_KW_ROW, c).Value2))
        If y > 0 And w > 0 Then
            code = WeekCode(y, w)
            If code >= startCode And code <= endCode Then
                n = n + 1
                ReDim Preserve tmpCols(0 To n)
                ReDim Preserve tmpCodes(0 To n)
                tmpCols(n) = c
                tmpCodes(n) = code
            End If
        End If
    Next c

    If n >= 0 Then
        outCols = tmpCols
        outCodes = tmpCodes
    End If
End Sub

Private Function InsertArrowForDriver(ByVal cellText As String, ByVal driver As String) As String
    Dim arrow As String
    arrow = ChrW(8596)

    Dim parts() As String
    parts = Split(cellText, SEP)

    Dim i As Long, p As String
    For i = LBound(parts) To UBound(parts)
        p = parts(i)

        If StrComp(ExtractDriverBaseName(p), driver, vbTextCompare) = 0 Then
            Dim rest As String
            rest = Mid$(Trim$(p), Len(driver) + 1)

            If Left$(rest, 1) <> arrow Then
                parts(i) = driver & arrow & rest
                InsertArrowForDriver = Join(parts, SEP)
                Exit Function
            Else
                InsertArrowForDriver = cellText
                Exit Function
            End If
        End If
    Next i

    InsertArrowForDriver = cellText
End Function


