@echo off
set "GAME_DIR=%~dp0"
set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python314\pythonw.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python313\pythonw.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python312\pythonw.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=pythonw"
cd /d "%GAME_DIR%"
start "" /b "%PYTHON_EXE%" run_game.py
