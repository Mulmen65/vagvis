@echo off
chcp 65001 >nul
echo Vagvis - hamtar offentliga geografiska underlag.
echo Sjalva modellen kraver inte Python. Detta frivilliga hamtningssteg gor det.
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0hamta_underlag.py"
) else (
  python "%~dp0hamta_underlag.py"
)
echo.
echo Las loggen ovan. Importera Vagvis_underlag.json i modellen.
pause
