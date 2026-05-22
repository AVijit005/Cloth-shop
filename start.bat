@echo off
cd /d "%~dp0"
set MYSQL_USER=root
set MYSQL_PASSWORD=Avijitpal123.
call .\venv\Scripts\activate.bat
waitress-serve --port=5000 app:app
