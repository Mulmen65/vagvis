@echo off
cd /d "%~dp0"
py -3 verktyg\hamta_underlag.py
echo.
echo Las hamtningskvittot i underlag\hamtningar. Appens data andras inte.
pause
