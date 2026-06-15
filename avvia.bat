@echo off
cd /d "%~dp0"

rem Usa il launcher "py" se presente (piu' affidabile su Windows: evita
rem l'alias del Microsoft Store che intercetta "python"), altrimenti python.
where py >nul 2>nul && (set "PYCMD=py") || (set "PYCMD=python")

%PYCMD% main.py
if errorlevel 1 (
    echo.
    echo [ERRORE] Controlla data\idu_price_manager.log per i dettagli.
    pause
)
