@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 starta_lokalt.py
  goto done
)
where python >nul 2>nul
if %errorlevel% equ 0 (
  python starta_lokalt.py
  goto done
)
echo För OpenStreetMap från den lokala modellen behövs Python 3 som lokal webbserver.
echo Öppnar nu HTML-filen. Beräkning och kustklippta områden fungerar utan Python.
start "" "%~dp0Vagvis_2.0.html"
:done
pause
