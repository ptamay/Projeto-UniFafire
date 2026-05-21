@echo off
title Servidor de Desenvolvimento UniFAFIRE
echo ===================================================
echo   INICIANDO SISTEMA UNIFAFIRE (MODO DEV)
echo ===================================================

cd /d "%~dp0"

:: Tentar pegar o IP local usando PowerShell
for /f "tokens=*" %%a in ('powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPv4Address -notlike '169.254.*' } | Select-Object -ExpandProperty IPv4Address -First 1"') do set LOCAL_IP=%%a

if "%LOCAL_IP%"=="" set LOCAL_IP=localhost

echo.
echo [1/4] Verificando dependencias...
if not exist "node_modules" (
    echo     Dependencias nao encontradas. Instalando...
    call npm install
) else (
    echo     Dependencias prontas.
)

echo.
echo [2/4] Limpando cache...
if exist ".next" rmdir /s /q ".next"

echo.
echo [3/4] Inicializando Banco de Dados...
call node scripts/init-db.js

echo.
echo [4/4] Iniciando Servidor...
echo.
echo ---------------------------------------------------
echo ACESSO LOCAL:   http://localhost:3000
echo ACESSO NA REDE:  http://%LOCAL_IP%:3000
echo ---------------------------------------------------
echo.

start "" "http://localhost:3000"
call npm run dev
