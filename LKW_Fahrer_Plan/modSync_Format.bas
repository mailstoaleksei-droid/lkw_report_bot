Attribute VB_Name = "modSync_Format"
Option Explicit

' ============================================================
' Formatting helpers (U/K letters + transfer fill).
' Partial text formatting uses Range.Characters(Start, Length).
' ============================================================

Public Sub FormatStatusLetters_UK(ByVal wsPlan As Worksheet, _
                                 ByVal firstRow As Long, ByVal lastRow As Long, _
                                 ByVal firstCol As Long, ByVal lastCol As Long)
    Dim r As Long, c As Long
    Dim txt As String, p As Long, chAfter As String

    For r = firstRow To lastRow
        For c = firstCol To lastCol
            If wsPlan.Cells(r, c).HasFormula Then GoTo NextCell

            txt = CStr(wsPlan.Cells(r, c).Value2)
            If Len(txt) = 0 Then GoTo NextCell

            ' ---- Format standalone " U" ----
            p = InStr(1, txt, " U", vbTextCompare)
            Do While p > 0
                If p + 2 <= Len(txt) Then
                    chAfter = Mid$(txt, p + 2, 1)
                Else
                    chAfter = vbNullString
                End If

                If chAfter = vbNullString Or chAfter = " " Or chAfter = "/" Or chAfter = ChrW(8596) Then
                    With wsPlan.Cells(r, c).Characters(p + 1, 1).Font
                        .Bold = True
                        .Color = RGB(192, 96, 0) ' dark orange
                    End With
                End If
                p = InStr(p + 1, txt, " U", vbTextCompare)
            Loop

            ' ---- Format standalone " K" ----
            p = InStr(1, txt, " K", vbTextCompare)
            Do While p > 0
                If p + 2 <= Len(txt) Then
                    chAfter = Mid$(txt, p + 2, 1)
                Else
                    chAfter = vbNullString
                End If

                If chAfter = vbNullString Or chAfter = " " Or chAfter = "/" Or chAfter = ChrW(8596) Then
                    With wsPlan.Cells(r, c).Characters(p + 1, 1).Font
                        .Bold = True
                        .Color = RGB(139, 0, 0) ' dark red
                    End With
                End If
                p = InStr(p + 1, txt, " K", vbTextCompare)
            Loop

NextCell:
        Next c
    Next r
End Sub

Public Sub FormatTransferCells(ByVal wsPlan As Worksheet, _
                               ByVal firstRow As Long, ByVal lastRow As Long, _
                               ByVal firstCol As Long, ByVal lastCol As Long)
    Dim r As Long, c As Long, txt As String
    Dim transferColor As Long
    Dim legacyTransferColor As Long
    transferColor = RGB(204, 238, 255)
    legacyTransferColor = RGB(204, 255, 255)

    For r = firstRow To lastRow
        For c = firstCol To lastCol
            txt = CStr(wsPlan.Cells(r, c).Value2)
            If InStr(1, txt, ChrW(8596), vbBinaryCompare) > 0 Then
                wsPlan.Cells(r, c).Interior.Color = transferColor
            Else
                If wsPlan.Cells(r, c).Interior.Color = transferColor _
                   Or wsPlan.Cells(r, c).Interior.Color = legacyTransferColor Then
                    wsPlan.Cells(r, c).Interior.Pattern = xlNone
                End If
            End If
        Next c
    Next r
End Sub

Public Sub ClearLegacyYellowFill(ByVal wsPlan As Worksheet, _
                                 ByVal firstRow As Long, ByVal lastRow As Long, _
                                 ByVal firstCol As Long, ByVal lastCol As Long)
    Dim r As Long, c As Long
    Dim txt As String
    Dim clr As Long
    Dim yellow1 As Long, yellow2 As Long, yellow3 As Long
    Dim transferColor As Long, legacyTransferColor As Long
    yellow1 = RGB(255, 255, 0)       ' pure yellow
    yellow2 = RGB(255, 242, 204)     ' common Excel light yellow
    yellow3 = RGB(255, 235, 156)     ' Excel highlight yellow
    transferColor = RGB(204, 238, 255)
    legacyTransferColor = RGB(204, 255, 255)

    For r = firstRow To lastRow
        For c = firstCol To lastCol
            txt = CStr(wsPlan.Cells(r, c).Value2)

            ' Keep transfer fill where arrow exists.
            If InStr(1, txt, ChrW(8596), vbBinaryCompare) > 0 Then GoTo NextCell

            On Error Resume Next
            clr = CLng(wsPlan.Cells(r, c).Interior.Color)
            On Error GoTo 0

            If clr = yellow1 Or clr = yellow2 Or clr = yellow3 _
               Or clr = transferColor Or clr = legacyTransferColor Then
                wsPlan.Cells(r, c).Interior.Pattern = xlNone
            End If
NextCell:
        Next c
    Next r
End Sub


