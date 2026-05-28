@echo off
cd /d "%~dp0"
if exist .env for /f "usebackq tokens=*" %%a in (".env") do set %%a
if not defined MYSQL_USER set MYSQL_USER=root
if not defined MYSQL_PASSWORD set MYSQL_PASSWORD=
if not defined MYSQL_HOST set MYSQL_HOST=127.0.0.1
if not defined MYSQL_PORT set MYSQL_PORT=3306
call .\venv\Scripts\activate.bat
waitress-serve --port=5000 run:app
