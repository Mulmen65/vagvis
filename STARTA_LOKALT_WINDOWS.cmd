@echo off
cd /d "%~dp0"
py -3 -m pip install -r requirements.txt
if errorlevel 1 goto slut
py -3 -m streamlit run streamlit_app.py
:slut
pause
