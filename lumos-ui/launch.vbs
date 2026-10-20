Set FSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
ParentFolder = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ParentFolder
WshShell.Run "cmd.exe /c npm start", 0, false
