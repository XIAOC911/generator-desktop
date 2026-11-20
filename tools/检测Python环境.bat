@echo off
chcp 65001 >nul
title Python 环境检测工具
echo ========================================
echo   Python 环境检测工具
echo ========================================
echo.

echo [1/5] 检测 python 命令...
python --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] python 可用
    python -c "import sys; print('   路径:', sys.executable)"
) else (
    echo   [X] python 命令未找到
)
echo.

echo [2/5] 检测 py 命令...
py --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] py 可用
    py -c "import sys; print('   路径:', sys.executable)"
) else (
    echo   [X] py 命令未找到
)
echo.

echo [3/5] 检测 python3 命令...
python3 --version 2>nul
if %errorlevel% == 0 (
    echo   [OK] python3 可用
) else (
    echo   [X] python3 命令未找到
)
echo.

echo [4/5] 检查环境变量 FAN_MATTING_PYTHON...
if defined FAN_MATTING_PYTHON (
    echo   [OK] FAN_MATTING_PYTHON=%FAN_MATTING_PYTHON%
) else (
    echo   [未设置] FAN_MATTING_PYTHON 环境变量
)
echo.

echo [5/5] 检测 rembg 是否已安装...
python -c "import rembg; print('   rembg 已安装')" 2>nul
if %errorlevel% neq 0 (
    py -c "import rembg; print('   rembg 已安装')" 2>nul
    if %errorlevel% neq 0 (
        echo   [X] rembg 未安装
    )
)
echo.

echo ========================================
echo 诊断结果:
echo ========================================
echo.
echo 如果上面显示 [OK] 但应用仍检测不到，
echo 可能是以下原因：
echo.
echo 1. Python 安装了但没有添加到系统 PATH
echo 2. 应用使用的是嵌入式/便携版 Python
echo 3. 权限问题导致应用无法调用 Python
echo.
echo 解决方案：
echo.
echo 方法1: 设置环境变量
echo   setx FAN_MATTING_PYTHON "你的python路径"
echo.
echo 方法2: 将 Python 添加到系统 PATH
echo   设置 -^> 系统 -^> 高级系统设置 -^> 环境变量
echo   在 Path 中添加 Python 安装目录
echo.
echo 方法3: 使用 py 命令启动应用
echo   在启动应用前执行: set FAN_MATTING_PYTHON=py
echo.
pause
