import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CustomFieldDef, GuestFieldPath, GuestListDocument } from '@shared/types'
import { buildGridColumns, CURRENT_FORMAT_VERSION, emptyDocument, getGuestField, migrateDocument } from '@shared/types'
import type { ImportedTable } from '@shared/import'
import { parseCsv, rowsToGuests } from '@shared/import'
import { parseXlsx } from '@shared/importXlsx'
import { toCsv } from '@shared/export'
import { sanitizeFileName } from '@shared/filename'
import { autoFitColumnWidth } from './lib/columnFit'
import Grid from './components/Grid'
import Toolbar from './components/Toolbar'
import ExportDialog from './components/ExportDialog'
import ImportMappingDialog from './components/ImportMappingDialog'
import { useGuestListDocument } from './lib/useGuestListDocument'

type SaveState = 'saved' | 'saving' | 'unsaved'

const AUTOSAVE_DELAY_MS = 1200

function parseDocumentFile(contents: string): GuestListDocument {
  const parsed = JSON.parse(contents)
  if (parsed.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new Error('This file was created by a different version of GuestList.')
  }
  return migrateDocument(parsed as GuestListDocument)
}

function serializeDocument(doc: GuestListDocument): string {
  return JSON.stringify(doc, null, 2)
}

export default function App(): JSX.Element {
  const controller = useGuestListDocument(emptyDocument())
  const [filePath, setFilePath] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [searchQuery, setSearchQuery] = useState('')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [pendingImportTable, setPendingImportTable] = useState<ImportedTable | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filePathRef = useRef<string | null>(null)
  filePathRef.current = filePath

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.trim().toLowerCase()
    return controller.guests.filter((g) =>
      [
        g.title,
        g.firstName,
        g.lastName,
        g.address.address1,
        g.address.address2,
        g.address.city,
        g.address.state,
        g.address.zip,
        g.email,
        ...Object.values(g.customFields)
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    ).length
  }, [controller.guests, searchQuery])

  const doSave = useCallback(
    async (asNewFile: boolean) => {
      let path = filePathRef.current
      if (!path || asNewFile) {
        const result = await window.guestlist.saveDialog(controller.doc.title)
        if (result.canceled || !result.path) return
        path = result.path
        setFilePath(path)
      }
      setSaveState('saving')
      await window.guestlist.writeFile(path, serializeDocument(controller.doc))
      controller.markSaved()
      setSaveState('saved')
    },
    [controller]
  )

  const handleRenameTitle = useCallback(
    async (newTitle: string) => {
      const sanitized = sanitizeFileName(newTitle)
      if (sanitized === controller.doc.title) return
      controller.setTitle(sanitized)
      const path = filePathRef.current
      if (!path) return // never saved yet -- the new title just becomes the default Save filename
      const result = await window.guestlist.renameFile(path, sanitized)
      if (!result.canceled && result.path) setFilePath(result.path)
    },
    [controller]
  )

  // Autosave: debounce writes while the document is dirty and already has a file path.
  useEffect(() => {
    if (!controller.isDirty) return
    setSaveState('unsaved')
    window.guestlist.setDirty(true)
    if (!filePath) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void doSave(false)
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [controller.isDirty, controller.doc, filePath, doSave])

  useEffect(() => {
    if (!controller.isDirty) {
      window.guestlist.setDirty(false)
    }
  }, [controller.isDirty])

  const handleNewDocument = useCallback(() => {
    controller.replaceDocument(emptyDocument())
    setFilePath(null)
    setSaveState('saved')
  }, [controller])

  const loadFromContents = useCallback(
    (path: string, contents: string) => {
      try {
        const doc = parseDocumentFile(contents)
        controller.replaceDocument(doc)
        setFilePath(path)
        setSaveState('saved')
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not open this file.')
      }
    },
    [controller]
  )

  const handleOpen = useCallback(async () => {
    const result = await window.guestlist.openFileDialog()
    if (result.canceled || !result.path || result.contents === undefined) return
    loadFromContents(result.path, result.contents)
  }, [loadFromContents])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      const result = await window.guestlist.readFile(path)
      if (result.canceled || result.contents === undefined) return
      loadFromContents(path, result.contents)
    },
    [loadFromContents]
  )

  const handleImportClick = useCallback(async () => {
    const result = await window.guestlist.importDialog()
    if (result.canceled) return
    try {
      let table: ImportedTable
      if (result.isXlsx && result.base64) {
        const binary = atob(result.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        table = parseXlsx(bytes.buffer)
      } else if (result.contents !== undefined) {
        table = parseCsv(result.contents)
      } else {
        return
      }
      if (table.headers.length === 0) {
        setErrorMessage('That file appears to be empty.')
        return
      }
      setPendingImportTable(table)
    } catch {
      setErrorMessage('Could not read that file. Make sure it is a valid CSV or XLSX file.')
    }
  }, [])

  const handleConfirmImport = useCallback(
    (mapping: Parameters<typeof rowsToGuests>[1], newCustomFields: CustomFieldDef[]) => {
      if (!pendingImportTable) return
      if (newCustomFields.length > 0) controller.addCustomFields(newCustomFields)
      const imported = rowsToGuests(pendingImportTable, mapping)
      controller.updateGuests((prev) => [...prev, ...imported])
      setPendingImportTable(null)

      // Auto-fit every mapped column to the imported content so a wide,
      // horizontally-laid-out spreadsheet doesn't get squeezed into narrow
      // default columns and read as tall/vertical instead.
      const touchedFields = new Set(mapping.filter((f): f is GuestFieldPath => f !== null))
      if (touchedFields.size > 0) {
        const allColumns = buildGridColumns([...controller.doc.customFieldDefs, ...newCustomFields])
        for (const field of touchedFields) {
          const columnDef = allColumns.find((c) => c.field === field)
          if (!columnDef) continue
          const values = imported.map((g) => getGuestField(g, field))
          const fitted = autoFitColumnWidth(columnDef.label, values, document.body)
          const current = controller.doc.columnWidths[columnDef.id] ?? columnDef.defaultWidth
          if (fitted > current) controller.setColumnWidth(columnDef.id, fitted)
        }
      }
    },
    [pendingImportTable, controller]
  )

  const handleExport = useCallback(async (fileBaseName: string, header: string[], rows: string[][]) => {
    const result = await window.guestlist.exportSaveDialog(fileBaseName)
    if (result.canceled || !result.path) return
    await window.guestlist.writeExportFile(result.path, toCsv(header, rows))
    setShowExportDialog(false)
  }, [])

  // Wire up native menu events from the main process.
  useEffect(() => {
    const offNew = window.guestlist.onNewDocumentRequested(handleNewDocument)
    const offOpen = window.guestlist.onOpenRequested(() => void handleOpen())
    const offOpenRecent = window.guestlist.onOpenRecentFile((path) => void handleOpenRecent(path))
    const offSave = window.guestlist.onSaveRequested(() => void doSave(false))
    const offSaveAs = window.guestlist.onSaveAsRequested(() => void doSave(true))
    const offExport = window.guestlist.onExportRequested(() => setShowExportDialog(true))
    const offImport = window.guestlist.onImportRequested(() => void handleImportClick())
    return () => {
      offNew()
      offOpen()
      offOpenRecent()
      offSave()
      offSaveAs()
      offExport()
      offImport()
    }
  }, [handleNewDocument, handleOpen, handleOpenRecent, doSave, handleImportClick])

  // Ctrl/Cmd+S save shortcut (menu accelerator also covers this, kept for focus-sink safety).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void doSave(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doSave])

  return (
    <div className="app">
      <Toolbar
        title={controller.doc.title}
        onRenameTitle={(t) => void handleRenameTitle(t)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        saveState={saveState}
        onSaveClick={() => void doSave(false)}
        onExport={() => setShowExportDialog(true)}
        onImport={() => void handleImportClick()}
        matchCount={matchCount}
      />

      <Grid
        guests={controller.guests}
        columnWidths={controller.doc.columnWidths}
        customFieldDefs={controller.doc.customFieldDefs}
        columnOrder={controller.doc.columnOrder}
        searchQuery={searchQuery}
        onUpdateGuests={controller.updateGuests}
        onColumnWidthChange={controller.setColumnWidth}
        onReorderColumns={controller.setColumnOrder}
        onDeleteCustomField={controller.deleteCustomField}
        onUndo={controller.undo}
        onRedo={controller.redo}
      />

      {showExportDialog && (
        <ExportDialog
          guests={controller.guests}
          presets={controller.doc.exportPresets}
          customFieldDefs={controller.doc.customFieldDefs}
          onSavePresets={controller.setExportPresets}
          onExport={handleExport}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {pendingImportTable && (
        <ImportMappingDialog
          table={pendingImportTable}
          existingCustomFields={controller.doc.customFieldDefs}
          onConfirm={handleConfirmImport}
          onCancel={() => setPendingImportTable(null)}
        />
      )}

      {errorMessage && (
        <div className="modal-overlay" onMouseDown={() => setErrorMessage(null)}>
          <div className="modal error-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <p>{errorMessage}</p>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setErrorMessage(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
