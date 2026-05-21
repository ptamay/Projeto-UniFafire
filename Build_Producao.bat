@echo off
title Build e Inicializacao Producao - Sao Jose
echo ===================================================
echo   PROCESSO DE BUILD E START EM MODO PRODUCAO
echo ===================================================

cd /d "%~dp0"

echo.
echo [1/6] Garantindo que o sistema esta parado para o build...
call pm2 stop sao-jose

echo.
echo [2/6] Verificando dependencias...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b %errorlevel%
)

echo.
echo [3/6] Limpando build anterior...
if exist ".next" (
    rmdir /s /q ".next"
    echo     Cache limpo.
)

echo.
echo [4/6] Iniciando Build de Producao (isso pode levar alguns minutos)...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha no build da aplicacao. Verifique os logs acima.
    pause
    exit /b %errorlevel%
)

echo.
echo [5/6] Verificando banco de dados...
call node scripts/init-db.js

echo.
echo [6/6] Iniciando servidor via PM2...
call pm2 restart sao-jose --update-env || call pm2 start ecosystem.config.js

echo.
echo ===================================================
echo   SISTEMA PRONTO E EM EXECUCAO (PRODUCAO)
echo ===================================================
echo.
echo Status atual do PM2:
call pm2 list
echo.
echo O sistema esta rodando em: http://localhost:3000
echo.
echo Pressione qualquer tecla para fechar esta janela.
pause
