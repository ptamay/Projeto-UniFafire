@echo off
title Ligar Sistema UniFAFIRE
echo ===================================================
echo   INICIANDO SISTEMA UNIFAFIRE (MODO SILENCIOSO)
echo ===================================================
echo.

cd /d "%~dp0"

:: Tentar pegar o IP local usando PowerShell
for /f "tokens=*" %%a in ('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPv4Address -notlike '169.254.*' } | Select-Object -ExpandProperty IPv4Address -First 1"') do set LOCAL_IP=%%a

if "%LOCAL_IP%"=="" set LOCAL_IP=localhost

echo Iniciando o PM2...
pm2 start ecosystem.config.js --env production

echo.
echo ---------------------------------------------------
echo STATUS ATUAL:
pm2 list unifafire
echo ---------------------------------------------------
echo.
echo SISTEMA ONLINE NA REDE INTERNA!
echo.
echo ACESSO LOCAL:   http://localhost:3000
echo ACESSO NA REDE:  http://%LOCAL_IP%:3000
echo.
echo Pode fechar esta janela. O sistema continuara rodando em segundo plano.
echo.
pause
