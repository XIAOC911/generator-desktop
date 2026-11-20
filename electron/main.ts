import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { registerFileIpc } from './ipc/file.ipc'
import { registerProjectIpc } from './ipc/project.ipc'
import { registerTemplateIpc } from './ipc/template.ipc'
import { registerPsdIpc } from './ipc/psd.ipc'
import { registerExportIpc } from './ipc/export.ipc'
import { registerMattingIpc } from './ipc/matting.ipc'
import { registerLlmIpc } from './ipc/llm.ipc'

const isDev = !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    title: '电商魔丸',
    backgroundColor: '#0b1836',
    icon: path.join(app.getAppPath(), 'build-resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.log('did-fail-load:', { code, desc, url })
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.log('render-process-gone:', details)
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  // 注册 IPC handlers
  registerFileIpc({ ipcMain, dialog, fs, app })
  registerProjectIpc({ ipcMain, dialog, fs, app })
  registerTemplateIpc({ ipcMain, fs, app })
  registerPsdIpc({ ipcMain, dialog, fs })
  registerExportIpc({ ipcMain, fs, app })
  registerMattingIpc({ ipcMain, fs, app })
  registerLlmIpc({ ipcMain, app })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
