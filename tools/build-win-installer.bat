@echo off
echo == Fan Generator Desktop Windows 打包脚本 ==
echo 1/3 安装依赖...
call npm install || goto :error
echo 2/3 构建项目...
call npm run build || goto :error
echo 3/3 生成 NSIS 安装包...
call npm run dist:win || goto :error
echo 完成，请查看 release 目录。
goto :eof
:error
echo 打包失败，请根据上方日志检查错误。
exit /b 1
