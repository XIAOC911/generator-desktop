@echo off
chcp 65001 >nul
echo ========================================
echo  电商魔丸 - 自动构建监听模式
echo  修改源码后自动编译，无需手动操作
echo  按 Ctrl+C 停止
echo ========================================

:loop
echo.
echo [%date% %time%] 正在检测文件变更并编译...
call npm run build 2>&1
if %errorlevel% neq 0 (
    echo [错误] 编译失败，请检查源码后按任意键重试
    pause >nul
)
echo [完成] 编译成功，等待文件变更...
echo.

:wait
timeout /t 3 /nobreak >nul
for /f "tokens=*" %%f in ('dir /s /b /a-d "src\*" "electron\*" 2^>nul') do (
    for %%v in ("%%~tf") do (
        if not exist "%~dp0\.watch-state\%%~nxf" (
            mkdir "%~dp0\.watch-state" 2>nul
            echo %%~tf> "%~dp0\.watch-state\%%~nxf"
        ) else (
            set /p prev=< "%~dp0\.watch-state\%%~nxf"
            if not "%%~tf"=="!prev!" (
                echo   ✓ 检测到变更: %%~nxf
                echo %%~tf> "%~dp0\.watch-state\%%~nxf"
                goto loop
            )
        )
    )
)
goto wait
