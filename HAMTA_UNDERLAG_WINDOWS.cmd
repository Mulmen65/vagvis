@echo off
cd /d "%~dp0"
rem Lagg SCB:s TAB6568_sv och TAB6574_sv (zip eller csv) i denna mapp och dubbelklicka.
set HH=
set BEF=
if exist TAB6568_sv.zip set HH=TAB6568_sv.zip
if exist TAB6568_sv.csv set HH=TAB6568_sv.csv
if exist TAB6574_sv.zip set BEF=TAB6574_sv.zip
if exist TAB6574_sv.csv set BEF=TAB6574_sv.csv
if "%HH%"=="" goto saknas
if "%BEF%"=="" goto saknas
py -3 verktyg\importera_scb_hushall.py %HH% %BEF%
if errorlevel 1 goto slut
py -3 verktyg\bygg_underlag.py
if errorlevel 1 goto slut
node kallkod\bygg_appen.cjs
goto slut
:saknas
echo Ladda ned TAB6568_sv.zip och TAB6574_sv.zip fran https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/ och lagg dem i denna mapp.
:slut
pause
