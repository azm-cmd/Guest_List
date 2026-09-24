import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

export interface OpenFileResult {
  canceled: boolean
  path?: string
  contents?: string
}

export interface SaveDialogResult {
  canceled: boolean
  path?: string
}

export interface ImportDialogResult {
  canceled: boolean
  path?: string
  isXlsx?: boolean
  contents?: string
  base64?: string
}

const api = {
  onNewDocumentRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.newDocumentRequested, cb)
    return () => ipcRenderer.removeListener(IPC.newDocumentRequested, cb)
  },
  onOpenRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.openRequested, cb)
    return () => ipcRenderer.removeListener(IPC.openRequested, cb)
  },
  onOpenRecentFile: (cb: (path: string) => void) => {
    const listener = (_e: unknown, path: string): void => cb(path)
    ipcRenderer.on(IPC.openRecentFile, listener)
    return () => ipcRenderer.removeListener(IPC.openRecentFile, listener)
  },
  onSaveRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.saveRequested, cb)
    return () => ipcRenderer.removeListener(IPC.saveRequested, cb)
  },
  onSaveAsRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.saveAsRequested, cb)
    return () => ipcRenderer.removeListener(IPC.saveAsRequested, cb)
  },
  onExportRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.exportRequested, cb)
    return () => ipcRenderer.removeListener(IPC.exportRequested, cb)
  },
  onImportRequested: (cb: () => void) => {
    ipcRenderer.on(IPC.importRequested, cb)
    return () => ipcRenderer.removeListener(IPC.importRequested, cb)
  },

  openFileDialog: (): Promise<OpenFileResult> => ipcRenderer.invoke(IPC.openFileDialog),
  readFile: (path: string): Promise<OpenFileResult> => ipcRenderer.invoke(IPC.readFile, path),
  saveDialog: (defaultTitle: string): Promise<SaveDialogResult> =>
    ipcRenderer.invoke(IPC.saveDialog, defaultTitle),
  writeFile: (path: string, contents: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.writeFile, path, contents),
  getRecentFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.getRecentFiles),
  renameFile: (oldPath: string, newBaseName: string): Promise<SaveDialogResult> =>
    ipcRenderer.invoke(IPC.renameFile, oldPath, newBaseName),

  importDialog: (): Promise<ImportDialogResult> => ipcRenderer.invoke(IPC.importDialog),

  exportSaveDialog: (defaultName: string): Promise<SaveDialogResult> =>
    ipcRenderer.invoke(IPC.exportSaveDialog, defaultName),
  writeExportFile: (path: string, contents: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.writeExportFile, path, contents),

  setDirty: (dirty: boolean): void => ipcRenderer.send(IPC.setDirty, dirty)
}

contextBridge.exposeInMainWorld('guestlist', api)

export type GuestListApi = typeof api
