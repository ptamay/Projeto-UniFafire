@echo off
title Desligar Sistema Sao Jose
echo Desligando o sistema...
pm2 stop sao-jose
echo.
echo ------------------------------------------
echo Sistema desligado com sucesso.
echo ------------------------------------------
echo.
pause
