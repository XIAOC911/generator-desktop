# Fan Generator Desktop Windows 安装包打包说明

## 1. 先说明当前状态

这份源码已经补齐了 Windows 打包所需的基础配置和 npm 脚本，但当前容器环境无法直接产出可安装的 `.exe`，原因有两个：

1. `electron` 安装时需要从 GitHub 下载二进制，当前环境无法访问该地址。
2. Windows 的 NSIS 安装包打包通常需要在 Windows 本机，或者有 Wine / NSIS 的完整工具链。

所以正确做法是：**把当前源码放到 Windows 电脑上执行打包。**

---

## 2. 推荐打包环境

建议在以下环境中打包：
- Windows 10 或 Windows 11
- Node.js 22 LTS
- npm 10+
- Python 仅在你需要高精度抠图时需要，不影响基本安装包生成

---

## 3. 第一次打包前要做什么

### 第一步：安装 Node.js
确保命令可用：

```bash
node -v
npm -v
```

### 第二步：进入项目目录

```bash
cd fan-generator-desktop
```

### 第三步：安装依赖

```bash
npm install
```

---

## 4. 可用打包命令

### 开发运行

```bash
npm run dev
```

### 只构建前端和 Electron 输出

```bash
npm run build
```

### 打 Windows 安装包（NSIS）

```bash
npm run dist:win
```

### 打 Windows 便携版

```bash
npm run dist:portable
```

### 只打目录，不做安装器

```bash
npm run dist:dir
```

---

## 5. 打包产物在哪里

默认输出目录：

```text
release/
```

常见产物：
- `Fan Generator Desktop Setup x.x.x.exe`：安装版
- `Fan Generator Desktop x.x.x.exe`：便携版（如果选择 portable）
- `win-unpacked/`：解包后的目录版

---

## 6. 推荐你实际怎么打

如果你现在的目标是“先拿到一个能装的软件”，建议顺序是：

### 方案 A：先打目录版验证

```bash
npm run dist:dir
```

验证：
- 能启动
- 画布正常
- 导入素材正常
- 导出正常
- AI 和抠图面板不报错

### 方案 B：再打正式安装包

```bash
npm run dist:win
```

这样更稳。

---

## 7. 如果打包失败，优先检查什么

### 7.1 Electron 下载失败
表现：
- `npm install` 阶段报下载 Electron 失败

处理：
- 确保本机网络可以访问 GitHub 资源
- 或配置镜像源

### 7.2 electron-builder 打包失败
表现：
- `npm run dist:win` 报错

处理：
- 先执行 `npm run build`，确认基础构建没问题
- 再执行 `npm run dist:dir` 看是不是安装器阶段才失败

### 7.3 TypeScript 类型报错
处理：
- 执行 `npm run build`
- 看是前端还是 Electron 主进程报错
- 优先处理 `electron/ipc/*` 和 `src/types/global.d.ts` 的类型不一致问题

---

## 8. 推荐打包前自测清单

打正式安装包前，建议先在开发模式确认以下功能：

- 新建 / 打开 / 保存项目
- 导入素材
- 快速抠图
- 高精度抠图（如果你本机已装 Python 环境）
- 固定排版
- 自由排版
- 记忆模板
- 背景模板
- 场景轮播模板
- 导出当前画布
- 批量导出
- AI 文案
- AI 场景图

---

## 9. 高精度抠图额外说明

如果你希望安装包在你的电脑上也能使用高精度抠图，除了安装软件本身，还需要本机安装：

```bash
pip install rembg pillow onnxruntime
```

这一步不是安装包内置的，而是运行时依赖。

---

## 10. 附带脚本

项目里已经附带了两个 Windows 打包辅助脚本：

- `tools/build-win-installer.ps1`
- `tools/build-win-installer.bat`

你可以直接在 Windows 上运行它们。
