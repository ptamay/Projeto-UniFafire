@echo off
echo ===================================================
echo   INICIANDO SISTEMA PROJETO SAO JOSE
echo ===================================================

cd /d "%~dp0"

echo.
echo [1/3] Verificando dependencias...
if not exist "node_modules" (
    echo     Dependencias nao encontradas. Instalando...
    call npm install
    if %errorlevel% neq 0 (
        echo     ERRO: Falha ao instalar dependencias.
        pause
        exit /b %errorlevel%
    )
    echo     Dependencias instaladas com sucesso.
) else (
    echo     Dependencias ja instaladas.
)

echo.
echo [2/3] Limpando cache do Turbopack (.next)...
if exist ".next" (
    rmdir /s /q ".next"
    echo     Cache limpo.
) else (
    echo     Cache ja estava limpo.
)

echo.
echo [3/4] Verificando banco de dados...
call node scripts/init-db.js

echo.
echo [4/4] Iniciando servidor...
echo     O navegador sera aberto em alguns instantes...

start "" "http://localhost:3000"
call npm run dev -- --turbo
