import { useCallback, useRef, useState } from 'react'
import type { CustomFieldDef, ExportPreset, Guest, GuestListDocument } from '@shared/types'
import { emptyDocument } from '@shared/types'
import { trimTrailingBlank } from './gridModel'

const HISTORY_LIMIT = 200

export interface GuestListController {
  doc: GuestListDocument
  guests: Guest[]
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  replaceDocument: (doc: GuestListDocument) => void
  updateGuests: (updater: (guests: Guest[]) => Guest[]) => void
  setTitle: (title: string) => void
  setExportPresets: (presets: ExportPreset[]) => void
  setColumnWidth: (columnId: string, width: number) => void
  addCustomFields: (defs: CustomFieldDef[]) => void
  setColumnOrder: (order: string[]) => void
  deleteCustomField: (fieldId: string) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
}

export function useGuestListDocument(initial: GuestListDocument): GuestListController {
  const [doc, setDoc] = useState<GuestListDocument>(initial)
  const [isDirty, setIsDirty] = useState(false)
  const undoStack = useRef<Guest[][]>([])
  const redoStack = useRef<Guest[][]>([])
  const [, forceRender] = useState(0)

  const replaceDocument = useCallback((next: GuestListDocument) => {
    setDoc(next)
    setIsDirty(false)
    undoStack.current = []
    redoStack.current = []
    forceRender((n) => n + 1)
  }, [])

  const updateGuests = useCallback((updater: (guests: Guest[]) => Guest[]) => {
    setDoc((prev) => {
      const next = trimTrailingBlank(updater(prev.guests))
      undoStack.current.push(prev.guests)
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      return { ...prev, guests: next, updatedAt: new Date().toISOString() }
    })
    setIsDirty(true)
  }, [])

  const setTitle = useCallback((title: string) => {
    setDoc((prev) => ({ ...prev, title, updatedAt: new Date().toISOString() }))
    setIsDirty(true)
  }, [])

  const setExportPresets = useCallback((presets: ExportPreset[]) => {
    setDoc((prev) => ({ ...prev, exportPresets: presets, updatedAt: new Date().toISOString() }))
    setIsDirty(true)
  }, [])

  const setColumnWidth = useCallback((columnId: string, width: number) => {
    setDoc((prev) => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [columnId]: width }
    }))
    setIsDirty(true)
  }, [])

  const addCustomFields = useCallback((defs: CustomFieldDef[]) => {
    if (defs.length === 0) return
    setDoc((prev) => {
      const existingIds = new Set(prev.customFieldDefs.map((d) => d.id))
      const toAdd = defs.filter((d) => !existingIds.has(d.id))
      if (toAdd.length === 0) return prev
      return {
        ...prev,
        customFieldDefs: [...prev.customFieldDefs, ...toAdd],
        // New columns join the display order at the end, same place they'd
        // naturally render if no saved order mentioned them yet.
        columnOrder: [...prev.columnOrder, ...toAdd.map((d) => `custom-${d.id}`)],
        updatedAt: new Date().toISOString()
      }
    })
    setIsDirty(true)
  }, [])

  const setColumnOrder = useCallback((order: string[]) => {
    setDoc((prev) => ({ ...prev, columnOrder: order }))
    setIsDirty(true)
  }, [])

  /**
   * Delete a custom column: drops its definition, its display-order entry,
   * its value from every guest, and any export-preset columns that source
   * from it (otherwise a saved preset would silently export a permanently
   * blank column). Built-in columns can't be deleted at all -- callers
   * should never invoke this for one; Grid.tsx's column menu disables that
   * option in the UI rather than relying on this guard alone, but it's kept
   * here too as a last line of defense against corrupting the guest model.
   * This is a structural change, not a cell edit, so it intentionally does
   * NOT go through the undo/redo stack (like column widths or the title) --
   * the confirmation prompt before calling this is the safeguard instead.
   */
  const deleteCustomField = useCallback((fieldId: string) => {
    setDoc((prev) => {
      if (!prev.customFieldDefs.some((d) => d.id === fieldId)) return prev
      const columnId = `custom-${fieldId}`
      return {
        ...prev,
        customFieldDefs: prev.customFieldDefs.filter((d) => d.id !== fieldId),
        columnOrder: prev.columnOrder.filter((id) => id !== columnId),
        exportPresets: prev.exportPresets.map((preset) => ({
          ...preset,
          columns: preset.columns.filter((c) => c.source !== `custom.${fieldId}`)
        })),
        guests: prev.guests.map((g) => {
          if (!(fieldId in g.customFields)) return g
          const rest = { ...g.customFields }
          delete rest[fieldId]
          return { ...g, customFields: rest }
        }),
        updatedAt: new Date().toISOString()
      }
    })
    setIsDirty(true)
  }, [])

  const undo = useCallback(() => {
    setDoc((prev) => {
      const previousGuests = undoStack.current.pop()
      if (previousGuests === undefined) return prev
      redoStack.current.push(prev.guests)
      return { ...prev, guests: previousGuests, updatedAt: new Date().toISOString() }
    })
    setIsDirty(true)
  }, [])

  const redo = useCallback(() => {
    setDoc((prev) => {
      const nextGuests = redoStack.current.pop()
      if (nextGuests === undefined) return prev
      undoStack.current.push(prev.guests)
      return { ...prev, guests: nextGuests, updatedAt: new Date().toISOString() }
    })
    setIsDirty(true)
  }, [])

  const markSaved = useCallback(() => setIsDirty(false), [])

  return {
    doc,
    guests: doc.guests,
    isDirty,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    replaceDocument,
    updateGuests,
    setTitle,
    setExportPresets,
    setColumnWidth,
    addCustomFields,
    setColumnOrder,
    deleteCustomField,
    undo,
    redo,
    markSaved
  }
}

export function createNewDocument(): GuestListDocument {
  return emptyDocument()
}
