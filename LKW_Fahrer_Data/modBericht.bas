Attribute VB_Name = "modBericht"
Option Explicit

' =========================
' Sheet names
' =========================
Private Const SH_BERICHT As String = "Bericht"
Private Const SH_LKW As String = "LKW"
Private Const SH_KAL As String = "Kalender"

' =========================
' LKW table (mapping)
' Columns in LKW:
'   B = LKW-Nummer
'   D = LKW-Typ (Container / Planen)
'   F = Firma
' =========================
Private Const LKW_FIRST_ROW As Long = 4

' =========================
' Kalender layout
' Year row = 2, Week row = 6
' Data grid = E8:OJ116 (Fahrername / U,K,R,0, etc.)
' =========================
Private Const KAL_LEFT_COL As String = "E"
Private Const KAL_RIGHT_COL As String = "OJ"
Private Const KAL_YEAR_ROW As Long = 2
Private Const KAL_WEEK_ROW As Long = 6
Private Const KAL_DATA_TOP As Long = 8
Private Const KAL_DATA_BOTTOM As Long = 116

' =========================
' Bericht layout (Container block)
' Firms in A4:A11, output in B4:F11
' Header: years in row 2, weeks in row 3
' =========================
Private Const B_CONT_YEAR_ROW As Long = 2
Private Const B_CONT_WEEK_ROW As Long = 3
Private Const B_CONT_FIRM_COL As Long = 1          ' Column A
Private Const B_CONT_OUT_LEFT As Long = 2          ' Column B
Private Const B_CONT_OUT_RIGHT As Long = 6         ' Column F
Private Const B_CONT_TOP As Long = 4
Private Const B_CONT_BOTTOM As Long = 11

' =========================
' Bericht layout (Planen block)
' Firms in A18:A25, output in B18:F25
' Header: years in row 16, weeks in row 17
' =========================
Private Const B_PLAN_YEAR_ROW As Long = 16
Private Const B_PLAN_WEEK_ROW As Long = 17
Private Const B_PLAN_FIRM_COL As Long = 1          ' Column A
Private Const B_PLAN_OUT_LEFT As Long = 2          ' Column B
Private Const B_PLAN_OUT_RIGHT As Long = 6         ' Column F
Private Const B_PLAN_TOP As Long = 18
Private Const B_PLAN_BOTTOM As Long = 25

' =========================
' MAIN button macro:
' 1) Ask Start Year + Start KW
' 2) Write 5 weeks to Bericht headers
' 3) Recalculate counts for Container and Planen tables
' =========================
Public Sub Bericht_SelectWeeksAndRecalc()
    Dim y As Variant, w As Variant

    y = Application.InputBox( _
            Prompt:="Enter START year (e.g., 2025):", _
            Title:="Start Year", _
            Default:=Year(Date), _
            Type:=1)
    If y = False Then Exit Sub
    If CLng(y) < 2000 Or CLng(y) > 2100 Then
        MsgBox "Invalid year.", vbExclamation
        Exit Sub
    End If

    w = Application.InputBox( _
            Prompt:="Enter START calendar week (1-53):", _
            Title:="Start KW", _
            Default:=WorksheetFunction.IsoWeekNum(Date), _
            Type:=1)
    If w = False Then Exit Sub
    If CLng(w) < 1 Or CLng(w) > 53 Then
        MsgBox "Invalid week number.", vbExclamation
        Exit Sub
    End If

    UpdateBerichtWeeks CLng(y), CLng(w)
    RecalcBerichtCounts

    MsgBox "Done: weeks updated and tables recalculated.", vbInformation
End Sub

' =========================
' Write 5 consecutive ISO weeks into Bericht headers
' Container: B2:F3
' Planen:    B16:F17
' =========================
Private Sub UpdateBerichtWeeks(ByVal startYear As Long, ByVal startWeek As Long)
    Dim wsB As Worksheet: Set wsB = ThisWorkbook.Worksheets(SH_BERICHT)

    Dim y As Long, w As Long, i As Long
    y = startYear
    w = startWeek

    ' Container headers (B..F)
    For i = 0 To 4
        wsB.Cells(B_CONT_YEAR_ROW, B_CONT_OUT_LEFT + i).Value = y
        wsB.Cells(B_CONT_WEEK_ROW, B_CONT_OUT_LEFT + i).Value = w
        NextISOWeek y, w
    Next i

    ' Planen headers (B..F) - same week range
    y = startYear
    w = startWeek
    For i = 0 To 4
        wsB.Cells(B_PLAN_YEAR_ROW, B_PLAN_OUT_LEFT + i).Value = y
        wsB.Cells(B_PLAN_WEEK_ROW, B_PLAN_OUT_LEFT + i).Value = w
        NextISOWeek y, w
    Next i
End Sub

' =========================
' Recalculate both blocks for the 5 weeks shown in headers
' =========================
Public Sub RecalcBerichtCounts()
    Dim wsLKW As Worksheet: Set wsLKW = ThisWorkbook.Worksheets(SH_LKW)
    Dim wsKal As Worksheet: Set wsKal = ThisWorkbook.Worksheets(SH_KAL)
    Dim wsB As Worksheet: Set wsB = ThisWorkbook.Worksheets(SH_BERICHT)

    Dim lastRowLKW As Long
    lastRowLKW = wsLKW.Cells(wsLKW.Rows.Count, 1).End(xlUp).Row
    If lastRowLKW < 80 Then lastRowLKW = 80 ' ensure we scan at least 80 rows

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual

    ' --- Build mapping: LKW-ID -> Type / Firm
    Dim dictType As Object, dictFirm As Object
    Set dictType = CreateObject("Scripting.Dictionary")
    Set dictFirm = CreateObject("Scripting.Dictionary")
    dictType.CompareMode = vbTextCompare
    dictFirm.CompareMode = vbTextCompare

    Dim arrL As Variant
    arrL = wsLKW.Range("A" & LKW_FIRST_ROW & ":F" & lastRowLKW).Value

    Dim r As Long
    For r = 1 To UBound(arrL, 1)
        Dim lkwID As String: lkwID = Trim$(CStr(arrL(r, 1)))  ' LKW col A (LKW-ID)
        If Len(lkwID) > 0 Then
            dictType(lkwID) = Trim$(CStr(arrL(r, 4)))        ' LKW col D (Type)
            dictFirm(lkwID) = Trim$(CStr(arrL(r, 6)))        ' LKW col F (Company)
        End If
    Next r

    ' --- Load Kalender block into array for fast scanning
    Dim rngKal As Range
    Set rngKal = wsKal.Range(KAL_LEFT_COL & KAL_YEAR_ROW & ":" & KAL_RIGHT_COL & KAL_DATA_BOTTOM)
    Dim arrK As Variant
    arrK = rngKal.Value


    ' --- Load LKW-IDs for Kalender rows (A8:A116)
    Dim arrID As Variant
    arrID = wsKal.Range("A" & KAL_DATA_TOP & ":A" & KAL_DATA_BOTTOM).Value

    ' Indices inside arrK
    Dim yearIdx As Long: yearIdx = 1
    Dim weekIdx As Long: weekIdx = (KAL_WEEK_ROW - KAL_YEAR_ROW) + 1
    Dim dataTopIdx As Long: dataTopIdx = (KAL_DATA_TOP - KAL_YEAR_ROW) + 1

    Dim colCount As Long: colCount = UBound(arrK, 2)
    Dim rowCount As Long: rowCount = UBound(arrK, 1)

    ' --- For each of the 5 weeks (B..F)
    Dim iWeek As Long
    For iWeek = 0 To 4
        Dim yC As Long, wC As Long
        yC = CLng(wsB.Cells(B_CONT_YEAR_ROW, B_CONT_OUT_LEFT + iWeek).Value)
        wC = CLng(wsB.Cells(B_CONT_WEEK_ROW, B_CONT_OUT_LEFT + iWeek).Value)

        FillBlockForWeek wsB, arrK, arrID, dictType, dictFirm, "Container", yC, wC, _
                         B_CONT_TOP, B_CONT_BOTTOM, (B_CONT_OUT_LEFT + iWeek), _
                         B_CONT_FIRM_COL, yearIdx, weekIdx, dataTopIdx, rowCount, colCount

        Dim yP As Long, wP As Long
        yP = CLng(wsB.Cells(B_PLAN_YEAR_ROW, B_PLAN_OUT_LEFT + iWeek).Value)
        wP = CLng(wsB.Cells(B_PLAN_WEEK_ROW, B_PLAN_OUT_LEFT + iWeek).Value)

        FillBlockForWeek wsB, arrK, arrID, dictType, dictFirm, "Planen", yP, wP, _
                         B_PLAN_TOP, B_PLAN_BOTTOM, (B_PLAN_OUT_LEFT + iWeek), _
                         B_PLAN_FIRM_COL, yearIdx, weekIdx, dataTopIdx, rowCount, colCount
    Next iWeek

CleanExit:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
End Sub

' =========================
' Fill one output column (one week) for a given type:
' - Scan all Kalender columns that match (yearVal, weekVal)
' - Collect UNIQUE vehicles per firm (Dictionary)
' - Write counts into Bericht rows (firms list)
' =========================
Private Sub FillBlockForWeek( _
    ByVal wsB As Worksheet, _
    ByVal arrK As Variant, _
    ByVal arrID As Variant, _
    ByVal dictType As Object, _
    ByVal dictFirm As Object, _
    ByVal needType As String, _
    ByVal yearVal As Long, _
    ByVal weekVal As Long, _
    ByVal firmTop As Long, _
    ByVal firmBottom As Long, _
    ByVal outCol As Long, _
    ByVal firmCol As Long, _
    ByVal yearIdx As Long, _
    ByVal weekIdx As Long, _
    ByVal dataTopIdx As Long, _
    ByVal rowCount As Long, _
    ByVal colCount As Long)

    Dim firmVehicles As Object
    Set firmVehicles = CreateObject("Scripting.Dictionary")
    firmVehicles.CompareMode = vbTextCompare

    Dim c As Long, rr As Long

    For c = 1 To colCount
        If CLng(Val(arrK(yearIdx, c))) = yearVal And CLng(Val(arrK(weekIdx, c))) = weekVal Then

            For rr = dataTopIdx To rowCount
                Dim raw As String: raw = Trim$(CStr(arrK(rr, c)))
                If Len(raw) > 0 Then
                    ' New logic: Kalender rows are LKW (A = LKW-ID), cells contain Fahrername or markers
                    Dim cellVal As String: cellVal = Trim$(CStr(raw))
                    Dim up As String: up = UCase$(cellVal)

                    ' Ignore markers / empty
                    ' Ignore markers / empty / non-working statuses
                    Dim upClean As String
                    upClean = Replace(Replace(up, ".", ""), " ", "")   ' to catch "O.F." / "OF" / "O F"
                    
                    If Len(cellVal) = 0 _
                       Or up = "U" _
                       Or up = "K" _
                       Or up = "R" _
                       Or cellVal = "0" _
                       Or up = "OHNE LKW" _
                       Or up = "WERKSTATT" _
                       Or up = "ERSATZWAGEN" _
                       Or up = "O.F." _
                       Or upClean = "OF" Then
                        ' ignore
                    Else
                        Dim idIdx As Long: idIdx = rr - dataTopIdx + 1
                        If idIdx >= 1 And idIdx <= UBound(arrID, 1) Then
                            Dim lkwID As String: lkwID = Trim$(CStr(arrID(idIdx, 1)))
                            If Len(lkwID) > 0 Then
                                If dictType.exists(lkwID) Then
                                    If StrComp(dictType(lkwID), needType, vbTextCompare) = 0 Then
                                        Dim fm As String: fm = CStr(dictFirm(lkwID))
                                        If Len(fm) > 0 Then
                                            If Not firmVehicles.exists(fm) Then
                                                Dim d As Object: Set d = CreateObject("Scripting.Dictionary")
                                                d.CompareMode = vbTextCompare
                                                firmVehicles.Add fm, d
                                            End If
                                            If Not firmVehicles(fm).exists(lkwID) Then
                                                firmVehicles(fm)(lkwID) = True
                                                Debug.Print needType & " | " & yearVal & "-" & weekVal & " | " & fm & " | " & lkwID
                                            End If
                                        End If
                                    End If
                                End If
                            End If
                        End If
                    End If


                End If
            Next rr

        End If
    Next c

    ' Write results into Bericht
    Dim rB As Long
    For rB = firmTop To firmBottom
        Dim firmName As String: firmName = Trim$(CStr(wsB.Cells(rB, firmCol).Value))

        If Len(firmName) = 0 Then
            wsB.Cells(rB, outCol).Value = ""
        ElseIf firmVehicles.exists(firmName) Then
            wsB.Cells(rB, outCol).Value = firmVehicles(firmName).Count
        Else
            wsB.Cells(rB, outCol).Value = 0
        End If
    Next rB
End Sub

' =========================
' Normalize a Kalender cell value into a vehicle number from LKW!B
' Rules:
' - Ignore U, K, R, 0, OHNE LKW
' - Take the first token before space/line break
' - Cut trailing letters after the last digit (e.g., GR-OO2457Nacht -> GR-OO2457)
' =========================
Private Function NormalizeVehicle(ByVal s As String) As String
    s = Trim$(s)
    If Len(s) = 0 Then NormalizeVehicle = "": Exit Function

    Select Case UCase$(s)
        Case "U", "K", "R", "0", "OHNE LKW"
            NormalizeVehicle = "": Exit Function
    End Select

    s = Replace(s, vbCr, " ")
    s = Replace(s, vbLf, " ")
    If InStr(1, s, " ", vbTextCompare) > 0 Then s = Split(s, " ")(0)

    Dim i As Long
    For i = Len(s) To 1 Step -1
        If Mid$(s, i, 1) Like "#" Then
            NormalizeVehicle = Left$(s, i)
            Exit Function
        End If
    Next i

    NormalizeVehicle = s
End Function

' =========================
' Advance to next ISO week (handles year change)
' =========================
Private Sub NextISOWeek(ByRef y As Long, ByRef w As Long)
    Dim maxW As Long: maxW = ISOWeeksInYear(y)
    w = w + 1
    If w > maxW Then
        w = 1
        y = y + 1
    End If
End Sub

' ISO weeks in year: 52 or 53
Private Function ISOWeeksInYear(ByVal y As Long) As Long
    ISOWeeksInYear = Application.WorksheetFunction.IsoWeekNum(DateSerial(y, 12, 28))
End Function

' =========================
' One-time macro: add the button on Bericht (top-right)
' =========================
Public Sub Bericht_AddButton_SelectKW()
    Dim wsB As Worksheet: Set wsB = ThisWorkbook.Worksheets(SH_BERICHT)

    Dim btn As Shape
    On Error Resume Next
    wsB.Shapes("btnKWRange").Delete
    On Error GoTo 0

    ' Place button near J2 (adjust as you like)
    Set btn = wsB.Shapes.AddShape(msoShapeRoundedRectangle, wsB.Range("J2").Left, wsB.Range("J2").Top, 180, 36)

        With btn
        .Name = "btnKWRange"
        .TextFrame2.TextRange.Text = ">>KW waehlen (5 Wochen)"
        .OnAction = "Bericht_SelectWeeksAndRecalc"
    End With
End Sub
Public Sub Report_Run_Bericht(ByVal startYear As Long, ByVal startWeek As Long)
    On Error GoTo EH

    ' Non-UI entry: write week headers + recalc tables
    UpdateBerichtWeeks startYear, startWeek
    RecalcBerichtCounts
    Exit Sub

EH:
    Err.Raise Err.Number, "Report_Run_Bericht", Err.Description
End Sub
