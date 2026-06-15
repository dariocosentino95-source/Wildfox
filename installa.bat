@echo off
cd /d "%~dp0"
echo ============================================
echo  IDU Price Manager - Installazione
echo ============================================
echo.

rem Usa il launcher "py" se presente, altrimenti "python".
where py >nul 2>nul && (set "PYCMD=py") || (set "PYCMD=python")

%PYCMD% --version >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Python non trovato. Scarica Python 3.10+ da https://python.org
    echo          Durante l'installazione spunta "Add Python to PATH".
    pause
    exit /b 1
)

echo [1/4] Installazione dipendenze Python...
%PYCMD% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERRORE] Installazione dipendenze fallita.
    pause
    exit /b 1
)

echo [2/4] Installazione browser Playwright (Chromium)...
%PYCMD% -m playwright install chromium
if errorlevel 1 (
    echo [ATTENZIONE] Playwright browser non installato. Lo scraping automatico non funzionera'.
    echo Riprova manualmente con: %PYCMD% -m playwright install chromium
)

echo [3/4] Inizializzazione database...
%PYCMD% -c "import db; db.init_db(); print('DB OK')"

echo [4/4] Pronto!
echo.
echo Avvia l'app con: avvia.bat  oppure  %PYCMD% main.py
echo.
pause
