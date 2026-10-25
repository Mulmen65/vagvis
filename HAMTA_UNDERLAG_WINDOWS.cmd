@echo off
cd /d "%~dp0"
py -3 verktyg\hamta_underlag.py --out underlag\hamtat
if errorlevel 1 goto slut
echo Las kvittot i underlag\hamtat. Appens indata har inte ersatts.
:slut
pause
