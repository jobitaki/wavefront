@echo off
REM Wavefront launcher script for Windows

cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if requirements are installed
python -c "import PyQt6" >nul 2>&1
if %errorlevel% neq 0 (
    echo PyQt6 not found. Installing dependencies...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if graphviz is installed
where dot >nul 2>&1
if %errorlevel% neq 0 (
    echo Warning: Graphviz 'dot' command not found.
    echo Please install graphviz from https://graphviz.org/download/
    echo.
    pause
)

REM Run the application
echo Starting Wavefront Visualizer...
python wavefront_qt.py
pause
