import { app, shell, BrowserWindow, Menu, dialog, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { join, dirname } from 'path'
import { readFile } from 'fs/promises'
import { is } from './electronIs'
import { IPC } from '../shared/ipc'
import { sanitizeFileName } from '../shared/filename'
import { readTextFile, writeTextFile, renameFile, getRecentFiles, addRecentFile } from './fileStore'

let mainWindow: BrowserWindow | null = null
let isDirty = false

const GUESTLIST_FILTER = [{ name: 'GuestList Files', extensions: ['guestlist'] }]
const IMPORT_FILTER = [
  { name: 'Spreadsheets', extensions: ['csv', 'xlsx'] },
  { name: 'CSV', extensions: ['csv'] },
  { name: 'Excel', extensions: ['xlsx'] }
]
const EXPORT_FILTER = [{ name: 'CSV', extensions: ['csv'] }]

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isDirty) return
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'You have unsaved changes.',
      detail: 'Do you want to save your guest list before closing?'
    })
    if (choice === 2) {
      event.preventDefault()
    } else if (choice === 0) {
      event.preventDefault()
      mainWindow?.webContents.send(IPC.saveRequested)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  buildMenu()
}

function send(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args)
}

async function buildMenu(): Promise<void> {
  const recent = await getRecentFiles()

  const recentItems: MenuItemConstructorOptions[] =
    recent.length > 0
      ? recent.map((path) => ({
          label: path,
          click: () => send(IPC.openRecentFile, path)
        }))
      : [{ label: 'No Recent Files', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Guest List', accelerator: 'CmdOrCtrl+N', click: () => send(IPC.newDocumentRequested) },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => send(IPC.openRequested) },
        { label: 'Open Recent', submenu: recentItems },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send(IPC.saveRequested) },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send(IPC.saveAsRequested) },
        { type: 'separator' },
        { label: 'Import...', click: () => send(IPC.importRequested) },
        { label: 'Export...', accelerator: 'CmdOrCtrl+E', click: () => send(IPC.exportRequested) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle(IPC.openFileDialog, async () => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: GUESTLIST_FILTER
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const path = result.filePaths[0]
  const contents = await readTextFile(path)
  await addRecentFile(path)
  await buildMenu()
  return { canceled: false, path, contents }
})

ipcMain.handle(IPC.readFile, async (_event, path: string) => {
  const contents = await readTextFile(path)
  await addRecentFile(path)
  await buildMenu()
  return { canceled: false, path, contents }
})

ipcMain.handle(IPC.saveDialog, async (_event, defaultTitle: string) => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${defaultTitle}.guestlist`,
    filters: GUESTLIST_FILTER
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  return { canceled: false, path: result.filePath }
})

ipcMain.handle(IPC.writeFile, async (_event, path: string, contents: string) => {
  await writeTextFile(path, contents)
  await addRecentFile(path)
  await buildMenu()
  return true
})

ipcMain.handle(IPC.getRecentFiles, async () => getRecentFiles())

ipcMain.handle(IPC.renameFile, async (_event, oldPath: string, newBaseName: string) => {
  const newPath = join(dirname(oldPath), `${sanitizeFileName(newBaseName)}.guestlist`)
  if (newPath === oldPath) return { canceled: false, path: oldPath }
  await renameFile(oldPath, newPath)
  await addRecentFile(newPath)
  await buildMenu()
  return { canceled: false, path: newPath }
})

ipcMain.handle(IPC.importDialog, async () => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: IMPORT_FILTER
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const path = result.filePaths[0]
  const isXlsx = path.toLowerCase().endsWith('.xlsx')
  if (isXlsx) {
    const buffer = await readFile(path)
    return { canceled: false, path, isXlsx: true, base64: buffer.toString('base64') }
  }
  const contents = await readTextFile(path)
  return { canceled: false, path, isXlsx: false, contents }
})

ipcMain.handle(IPC.exportSaveDialog, async (_event, defaultName: string) => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${defaultName}.csv`,
    filters: EXPORT_FILTER
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  return { canceled: false, path: result.filePath }
})

ipcMain.handle(IPC.writeExportFile, async (_event, path: string, contents: string) => {
  await writeTextFile(path, contents)
  return true
})

ipcMain.on(IPC.setDirty, (_event, dirty: boolean) => {
  isDirty = dirty
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
