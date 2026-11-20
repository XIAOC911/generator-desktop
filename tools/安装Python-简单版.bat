@echo off
chcp 65001 >nul
title Python + rembg 安装工具
echo ========================================
echo   Python + rembg 自动安装工具
echo ========================================
echo.
echo 正在检查环境...
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] 发现 Python:
    python --version
    goto install_packages
)

py --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] 发现 Python (py 命令):
    py --version
    set PYTHON_CMD=py
    goto install_packages
)

python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] 发现 Python3:
    python3 --version
    set PYTHON_CMD=python3
    goto install_packages
)

echo [X] 未检测到 Python
echo.
echo 请选择安装方式：
echo.
echo 1. 自动下载并安装 Python 3.11（推荐）
echo 2. 手动安装（打开浏览器下载）
echo.
set /p choice="请输入选项 (1 或 2): "

if "%choice%"=="1" goto auto_install_python
if "%choice%"=="2" goto manual_install_python
echo 无效选项
goto end

:auto_install_python
echo.
echo [1/3] 正在下载 Python 3.11...
echo 下载地址: https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
echo.
echo 请稍候，下载约需 2-5 分钟...
echo.

:: 使用 PowerShell 下载
curl -L -o "%TEMP%\python-installer.exe" "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" 2>nul

if not exist "%TEMP%\python-installer.exe" (
    echo 下载失败，尝试使用 PowerShell 下载...
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '%TEMP%\python-installer.exe' -UseBasicParsing"
)

if not exist "%TEMP%\python-installer.exe" (
    echo.
    echo [错误] 下载失败，请手动下载安装
    echo 访问: https://www.python.org/downloads/
    pause
    goto end
)

echo [2/3] 正在安装 Python...
echo.
echo 安装中，请稍候（约 1-2 分钟）...

"%TEMP%\python-installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1

if %errorlevel% neq 0 (
    echo.
    echo [错误] Python 安装失败
    pause
    goto end
)

del "%TEMP%\python-installer.exe" 2>nul

echo [3/3] Python 安装完成
echo.
echo 请重新运行此脚本以安装 rembg
pause
goto end

:manual_install_python
echo.
echo 正在打开 Python 下载页面...
start https://www.python.org/downloads/
echo.
echo 请按以下步骤操作：
echo 1. 下载 Python 3.10 或更高版本
echo 2. 运行安装程序
echo 3. 勾选 "Add Python to PATH"
echo 4. 点击 Install Now
echo 5. 安装完成后重新运行此脚本
echo.
pause
goto end

:install_packages
echo.
echo ========================================
echo   安装 rembg 及相关库
echo ========================================
echo.

:: 确定 Python 命令
if not defined PYTHON_CMD (
    set PYTHON_CMD=python
)

echo 使用命令: %PYTHON_CMD%
echo.

:: 升级 pip
echo [1/3] 升级 pip...
%PYTHON_CMD% -m pip install --upgrade pip --quiet
if %errorlevel% neq 0 (
    echo pip 升级失败（可能不影响后续安装）
)
echo 完成
echo.

:: 安装 rembg
echo [2/3] 安装 rembg...
echo 这可能需要下载约 500MB 的模型文件
echo 请耐心等待，不要关闭窗口...
echo.

%PYTHON_CMD% -m pip install rembg --quiet

if %errorlevel% neq 0 (
    echo.
    echo 安装失败，尝试使用国内镜像...
    %PYTHON_CMD% -m pip install rembg -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
)

if %errorlevel% neq 0 (
    echo.
    echo [错误] rembg 安装失败
    echo 请检查网络连接，或手动运行：
    echo pip install rembg pillow onnxruntime
    pause
    goto end
)

echo 完成
echo.

:: 安装 pillow 和 onnxruntime
echo [3/3] 安装 pillow 和 onnxruntime...
%PYTHON_CMD% -m pip install pillow onnxruntime --quiet

echo 完成
echo.

:: 验证安装
echo ========================================
echo   验证安装结果
echo ========================================
echo.

echo Python 版本:
%PYTHON_CMD% --version
echo.

echo 检查 rembg:
%PYTHON_CMD% -c "import rembg; print('  rembg 安装成功')" 2>nul
if %errorlevel% neq 0 echo   rembg 可能未正确安装

echo 检查 Pillow:
%PYTHON_CMD% -c "from PIL import Image; print('  Pillow 安装成功')" 2>nul
if %errorlevel% neq 0 echo   Pillow 可能未正确安装

echo 检查 onnxruntime:
%PYTHON_CMD% -c "import onnxruntime; print('  onnxruntime 安装成功')" 2>nul
if %errorlevel% neq 0 echo   onnxruntime 可能未正确安装

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 请重启 "电商魔丸" 应用
echo 高精度抠图功能现在可以使用了
echo.
pause

:end
