$ErrorActionPreference = 'Stop'
Write-Host '== Fan Generator Desktop Windows 打包脚本 ==' -ForegroundColor Cyan
Write-Host '1/3 安装依赖...'
npm install
Write-Host '2/3 构建项目...'
npm run build
Write-Host '3/3 生成 NSIS 安装包...'
npm run dist:win
Write-Host '完成。请查看 release 目录。' -ForegroundColor Green
