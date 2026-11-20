# 自动安装 Python 和 rembg 环境
# 以管理员身份运行 PowerShell 后执行此脚本

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Python + rembg 自动安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员身份运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "警告：建议以管理员身份运行此脚本" -ForegroundColor Yellow
    Write-Host ""
}

# 检查 Python 是否已安装
Write-Host "[1/4] 检查 Python 安装状态..." -ForegroundColor Green
$pythonCmd = $null
try {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
} catch {}

try {
    if (-not $pythonCmd) {
        $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
    }
} catch {}

try {
    if (-not $pythonCmd) {
        $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
    }
} catch {}

if ($pythonCmd) {
    Write-Host "      发现 Python: $($pythonCmd.Source)" -ForegroundColor Gray
    try {
        $version = & $pythonCmd.Source --version 2>&1
        Write-Host "      版本: $version" -ForegroundColor Gray

        # 检查版本号
        $versionStr = $version -replace "Python ", ""
        $versionParts = $versionStr.Split(".")
        $major = [int]$versionParts[0]
        $minor = [int]$versionParts[1]

        if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
            Write-Host "      警告: Python 版本过低，需要 3.10+" -ForegroundColor Yellow
            $installPython = $true
        } else {
            Write-Host "      Python 版本符合要求" -ForegroundColor Green
            $installPython = $false
        }
    } catch {
        Write-Host "      无法检测版本，尝试重新安装" -ForegroundColor Yellow
        $installPython = $true
    }
} else {
    Write-Host "      未检测到 Python" -ForegroundColor Yellow
    $installPython = $true
}

# 下载并安装 Python
if ($installPython) {
    Write-Host ""
    Write-Host "[2/4] 下载 Python 3.11..." -ForegroundColor Green

    $pythonUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    $installerPath = "$env:TEMP\python-3.11.9-amd64.exe"

    Write-Host "      下载地址: $pythonUrl" -ForegroundColor Gray
    Write-Host "      下载中，请稍候..." -ForegroundColor Gray

    try {
        Invoke-WebRequest -Uri $pythonUrl -OutFile $installerPath -UseBasicParsing
        Write-Host "      下载完成" -ForegroundColor Green
    } catch {
        Write-Host "      下载失败: $_" -ForegroundColor Red
        Write-Host "      请手动下载安装: https://www.python.org/downloads/" -ForegroundColor Yellow
        pause
        exit 1
    }

    Write-Host ""
    Write-Host "[3/4] 安装 Python..." -ForegroundColor Green
    Write-Host "      安装中，请稍候（约 1-2 分钟）..." -ForegroundColor Gray

    # 安装参数：添加到 PATH、为所有用户安装、安装 pip
    $installArgs = "/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1"

    try {
        $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru
        if ($process.ExitCode -eq 0) {
            Write-Host "      Python 安装成功" -ForegroundColor Green
        } else {
            Write-Host "      安装失败，退出码: $($process.ExitCode)" -ForegroundColor Red
            pause
            exit 1
        }
    } catch {
        Write-Host "      安装失败: $_" -ForegroundColor Red
        pause
        exit 1
    }

    # 清理安装文件
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    # 刷新环境变量
    Write-Host "      刷新环境变量..." -ForegroundColor Gray
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
} else {
    Write-Host ""
    Write-Host "[2/4] 跳过 Python 安装" -ForegroundColor Green
    Write-Host "[3/4] 跳过 Python 安装" -ForegroundColor Green
}

# 重新检测 Python
Write-Host ""
Write-Host "[4/4] 安装 rembg 及相关库..." -ForegroundColor Green

$pythonExe = $null
$possiblePaths = @("python", "py", "python3")
$pythonRoots = @($env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
foreach ($root in $pythonRoots) {
    foreach ($version in @("313", "312", "311", "310")) {
        $possiblePaths += Join-Path $root "Python$version\python.exe"
    }
}
$possiblePaths = $possiblePaths | Select-Object -Unique

foreach ($path in $possiblePaths) {
    try {
        $result = & $path --version 2>&1
        if ($result -match "Python") {
            $pythonExe = $path
            Write-Host "      使用 Python: $path" -ForegroundColor Gray
            break
        }
    } catch {}
}

if (-not $pythonExe) {
    Write-Host "      错误: 无法找到可用的 Python" -ForegroundColor Red
    pause
    exit 1
}

# 升级 pip
Write-Host "      升级 pip..." -ForegroundColor Gray
try {
    & $pythonExe -m pip install --upgrade pip --quiet
    Write-Host "      pip 升级完成" -ForegroundColor Green
} catch {
    Write-Host "      pip 升级失败（可能不影响后续安装）" -ForegroundColor Yellow
}

# 安装 rembg、pillow、onnxruntime
Write-Host "      安装 rembg pillow onnxruntime..." -ForegroundColor Gray
Write-Host "      这需要下载约 500MB 的模型文件，请耐心等待..." -ForegroundColor Yellow

try {
    & $pythonExe -m pip install rembg pillow onnxruntime --quiet
    Write-Host "      安装完成" -ForegroundColor Green
} catch {
    Write-Host "      安装失败: $_" -ForegroundColor Red
    Write-Host "      尝试使用国内镜像..." -ForegroundColor Yellow

    try {
        & $pythonExe -m pip install rembg pillow onnxruntime -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
        Write-Host "      安装完成" -ForegroundColor Green
    } catch {
        Write-Host "      安装失败，请手动执行:" -ForegroundColor Red
        Write-Host "      pip install rembg pillow onnxruntime" -ForegroundColor Yellow
        pause
        exit 1
    }
}

# 验证安装
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  验证安装结果" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "Python 版本:" -ForegroundColor Green
& $pythonExe --version

Write-Host ""
Write-Host "rembg 版本:" -ForegroundColor Green
try {
    & $pythonExe -c "import rembg; print('rembg 已安装')"
} catch {
    Write-Host "rembg 可能未正确安装" -ForegroundColor Red
}

Write-Host ""
Write-Host "PIL (Pillow) 版本:" -ForegroundColor Green
try {
    & $pythonExe -c "from PIL import Image; print('Pillow 已安装')"
} catch {
    Write-Host "Pillow 可能未正确安装" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请重启 '电商魔丸' 应用，高精度抠图功能应该可以使用了。" -ForegroundColor Green
Write-Host ""

pause
