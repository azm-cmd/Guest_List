import { useCallback, useRef, useState } from 'react'
import type { ExportPreset, Guest, GuestListDocument } from '@shared/types'
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
    undo,
    redo,
    markSaved
  }
}

export function createNewDocument(): GuestListDocument {
  return emptyDocument()
}
