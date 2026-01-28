VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Sheet13"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
' ============================================
' Global variable for storing previous values
' ============================================
Public PrevValues As Object

' ============================================
' CODE FOR SHEET "Data"
' Right-click on sheet "Data" -> View Code
' ============================================

Private Sub Worksheet_SelectionChange(ByVal Target As Range)
    If PrevValues Is Nothing Then
        Set PrevValues = CreateObject("Scripting.Dictionary")
    End If
    
    If Not Intersect(Target, Me.Range("G:G")) Is Nothing Then
        If Target.Cells.Count = 1 And Target.Row > 1 Then
            On Error Resume Next
            PrevValues(Target.Address) = CStr(Target.Value)
        End If
    End If
End Sub

Private Sub Worksheet_Change(ByVal Target As Range)
    Dim cell As Range
    Dim oldValue As String
    Dim newValue As String
    Dim logCell As Range
    Dim userName As String
    Dim changeDate As String
    Dim logEntry As String
    Dim wasProtected As Boolean
    
    On Error GoTo ErrorHandler
    
    Application.EnableEvents = False
    
    If PrevValues Is Nothing Then
        Set PrevValues = CreateObject("Scripting.Dictionary")
    End If
    
    If Not Intersect(Target, Me.Range("G:G")) Is Nothing Then
        For Each cell In Intersect(Target, Me.Range("G:G"))
            If cell.Row > 1 Then
                newValue = CStr(cell.Value)
                
                If PrevValues.exists(cell.Address) Then
                    oldValue = CStr(PrevValues(cell.Address))
                Else
                    oldValue = ""
                End If
                
                If oldValue = newValue Then GoTo NextCell
                
                userName = Environ("USERNAME")
                If userName = "" Then userName = Application.userName
                changeDate = Format(Now, "dd.mm.yyyy")
                
                Set logCell = Me.Cells(cell.Row, 11)
                
                wasProtected = Me.ProtectContents
                If wasProtected Then Me.Unprotect
                
                logEntry = changeDate & " | " & userName & " | latest data: " & oldValue
                
                logCell.Value = logEntry
                
                If wasProtected Then
                    Me.Range("G:G").Locked = False
                    Me.Columns(11).Locked = True
                    Me.Protect DrawingObjects:=True, Contents:=True, Scenarios:=True, UserInterfaceOnly:=True
                End If
                
                PrevValues(cell.Address) = newValue
                
NextCell:
            End If
        Next cell
    End If
    
ErrorHandler:
    Application.EnableEvents = True
    If Err.Number <> 0 Then
        Debug.Print "Error " & Err.Number & ": " & Err.Description
    End If
End Sub


