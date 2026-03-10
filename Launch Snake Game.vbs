Option Explicit
Dim fso, shell, gameDir, runFile, py, candidates, i, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

gameDir = fso.GetParentFolderName(WScript.ScriptFullName)
runFile = gameDir & "\\run_game.py"

candidates = Array( _
  shell.ExpandEnvironmentStrings("%LocalAppData%\\Programs\\Python\\Python314\\pythonw.exe"), _
  shell.ExpandEnvironmentStrings("%LocalAppData%\\Programs\\Python\\Python313\\pythonw.exe"), _
  shell.ExpandEnvironmentStrings("%LocalAppData%\\Programs\\Python\\Python312\\pythonw.exe") _
)

py = ""
For i = 0 To UBound(candidates)
  If fso.FileExists(candidates(i)) Then
    py = candidates(i)
    Exit For
  End If
Next

If py = "" Then
  py = "pythonw"
End If

cmd = Chr(34) & py & Chr(34) & " " & Chr(34) & runFile & Chr(34)
shell.CurrentDirectory = gameDir
shell.Run cmd, 0, False
