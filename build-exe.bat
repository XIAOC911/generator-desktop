@echo off
chcp 65001 >nul
echo ==========================================
echo  电商魔丸 - 构建打包脚本
echo ==========================================

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo.
echo [1/3] 安装依赖...
call npm install
if errorlevel 1 (
    echo [错误] 安装依赖失败！
    pause
    exit /b 1
)

echo.
echo [2/3] 构建项目（前端 + Electron）...
call npm run build
if errorlevel 1 (
    echo [错误] 构建失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 打包 Windows 安装程序...
call npm run dist:win
if errorlevel 1 (
    echo [错误] 打包失败！
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  打包完成！
echo  安装包位置: release\电商魔丸-Setup-4.9.0.exe
echo ==========================================
pause
