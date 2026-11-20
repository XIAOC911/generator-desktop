@echo off
echo ========================================
echo   Python Environment Checker
echo ========================================
echo.

echo [1/5] Checking python command...
python --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] python is available
    python -c "import sys; print('   Path:', sys.executable)"
) else (
    echo   [X] python command not found
)
echo.

echo [2/5] Checking py command...
py --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] py is available
    py -c "import sys; print('   Path:', sys.executable)"
) else (
    echo   [X] py command not found
)
echo.

echo [3/5] Checking python3 command...
python3 --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] python3 is available
) else (
    echo   [X] python3 command not found
)
echo.

echo [4/5] Checking FAN_MATTING_PYTHON env variable...
if defined FAN_MATTING_PYTHON (
    echo   [OK] FAN_MATTING_PYTHON=%FAN_MATTING_PYTHON%
) else (
    echo   [Not Set] FAN_MATTING_PYTHON environment variable
)
echo.

echo [5/5] Checking rembg installation...
python -c "import rembg; print('   rembg is installed')" 2>nul
if %errorlevel% neq 0 (
    py -c "import rembg; print('   rembg is installed')" 2>nul
    if %errorlevel% neq 0 (
        echo   [X] rembg not installed
    )
)
echo.

echo ========================================
echo Diagnostic Results:
echo ========================================
echo.
echo If [OK] is shown above but the app still cannot detect Python,
echo possible reasons:
echo.
echo 1. Python is installed but not in system PATH
echo 2. The app uses a different Python installation
echo 3. Permission issues prevent the app from calling Python
echo.
echo Solutions:
echo.
echo Method 1: Set environment variable
echo   setx FAN_MATTING_PYTHON "your_python_path"
echo.
echo Method 2: Add Python to system PATH
echo   Settings -^> System -^> Advanced system settings -^> Environment Variables
echo   Add Python installation directory to Path
echo.
echo Method 3: Use py command
echo   Before starting the app: set FAN_MATTING_PYTHON=py
echo.
pause
