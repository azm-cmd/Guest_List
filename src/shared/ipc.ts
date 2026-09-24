// Shared IPC contract between main and renderer.

export interface OpenedFile {
  path: string
  contents: string
}

export interface SaveDialogResult {
  canceled: boolean
  path?: string
}

export interface ExportSaveResult {
  canceled: boolean
  path?: string
}

export const IPC = {
  newDocumentRequested: 'app:new-document-requested',
  openRequested: 'app:open-requested',
  saveRequested: 'app:save-requested',
  saveAsRequested: 'app:save-as-requested',
  exportRequested: 'app:export-requested',
  importRequested: 'app:import-requested',

  openFileDialog: 'file:open-dialog',
  openRecentFile: 'file:open-recent',
  readFile: 'file:read',
  writeFile: 'file:write',
  saveDialog: 'file:save-dialog',
  getRecentFiles: 'file:get-recent',
  renameFile: 'file:rename',

  importDialog: 'import:dialog',
  readImportFile: 'import:read-file',

  exportSaveDialog: 'export:save-dialog',
  writeExportFile: 'export:write-file',

  setDirty: 'app:set-dirty'
} as const
