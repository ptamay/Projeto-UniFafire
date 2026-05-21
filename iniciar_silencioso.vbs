Set oShell = CreateObject("WScript.Shell")
' Restaura todos os processos PM2 salvos, sem abrir janela alguma (0 = oculto)
oShell.Run "cmd /c pm2 resurrect", 0, False
