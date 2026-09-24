import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import {
  buildGridColumns,
  customFieldIdForColumn,
  getGuestField,
  moveColumnId,
  orderGridColumns,
  setGuestField,
  type CustomFieldDef,
  type Guest
} from '@shared/types'
import type { GuestWarning } from '@shared/validation'
import { computeGuestWarnings } from '@shared/validation'
import { parseTsv, toTsv } from '../lib/clipboard'
import {
  applyMoveToGuests,
  applyPasteToGuests,
  computeMoveDestinationTopLeft,
  normalizeSelection,
  padTo,
  rangeHasDataOutside,
  totalRowCount,
  type CellRect,
  type CellRef,
  type SelectionRange
} from '../lib/gridModel'
import { estimateColumnsForTextarea, isCaretOnFirstVisualLine, isCaretOnLastVisualLine } from '../lib/textWrap'
import { autoFitColumnWidth, MIN_COLUMN_WIDTH } from '../lib/columnFit'
import { buildValueFrequency, suggestCompletion } from '../lib/autocomplete'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

interface GridProps {
  guests: Guest[]
  columnWidths: Record<string, number>
  customFieldDefs: CustomFieldDef[]
  columnOrder: string[]
  searchQuery: string
  onUpdateGuests: (updater: (guests: Guest[]) => Guest[]) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onReorderColumns: (order: string[]) => void
  onDeleteCustomField: (fieldId: string) => void
  onUndo: () => void
  onRedo: () => void
}

const COLUMN_DRAG_THRESHOLD_PX = 6

interface ColumnDragState {
  columnId: string
  overColumnId: string | null
}

function matchesSearch(guest: Guest, query: string): boolean {
  if (!query.trim()) return true
  const haystack = [
    guest.title,
    guest.firstName,
    guest.lastName,
    guest.address.address1,
    guest.address.address2,
    guest.address.city,
    guest.address.state,
    guest.address.zip,
    guest.email,
    ...Object.values(guest.customFields)
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

interface MoveDragState {
  source: CellRect
  grab: CellRef
  hover: CellRef
}

/**
 * Selection/editing architecture:
 *
 * - The grid wrapper (`gridWrapperRef`) is a plain, focusable `<div>` that
 *   owns "selection mode": whenever no cell is being edited, it holds real
 *   DOM focus and is the single target for navigation keys, Delete/Backspace,
 *   typing-to-start-edit, and native copy/cut/paste. Because it's a plain
 *   div (not a form control), it never fights the browser's readonly/
 *   disabled paste-suppression rules the way an `<input readOnly>` sink did.
 * - Editing is a separate, explicit state (`editingCell`). Only the single
 *   cell being edited ever mounts a `<textarea>`, and only that textarea
 *   ever receives focus while editing. Selection and editing therefore
 *   never contend for focus: exactly one of {wrapper, editor textarea}
 *   is focused at any time, and each transition (click, type, F2,
 *   double-click, commit, cancel) explicitly moves focus to the other.
 */
export default function Grid({
  guests,
  columnWidths,
  customFieldDefs,
  columnOrder,
  searchQuery,
  onUpdateGuests,
  onColumnWidthChange,
  onReorderColumns,
  onDeleteCustomField,
  onUndo,
  onRedo
}: GridProps): JSX.Element {
  const naturalColumns = useMemo(() => buildGridColumns(customFieldDefs), [customFieldDefs])
  const columns = useMemo(() => orderGridColumns(naturalColumns, columnOrder), [naturalColumns, columnOrder])
  const rowCount = totalRowCount(guests.length)

  const [selection, setSelection] = useState<SelectionRange>({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 }
  })
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [columnMenu, setColumnMenu] = useState<{ columnId: string; x: number; y: number } | null>(null)
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null)
  const [columnDrag, setColumnDrag] = useState<ColumnDragState | null>(null)
  const columnDragRef = useRef<{ columnId: string; startX: number; startY: number; dragging: boolean } | null>(
    null
  )

  const isMouseSelecting = useRef(false)
  const dragModeRef = useRef<'select' | 'pending-move' | 'move'>('select')
  const gridWrapperRef = useRef<HTMLDivElement | null>(null)
  const editInputRef = useRef<HTMLTextAreaElement | null>(null)
  // Mirrors `editingCell` synchronously (state updates are async/batched).
  // Programmatically moving focus away from the editor (e.g. in Escape/
  // Enter/Tab handlers, via `focusWrapper()`) fires a real DOM 'blur' on
  // the still-mounted textarea *before* React re-renders, which would
  // otherwise re-invoke the editor's onBlur-commit handler a second time
  // and stomp on an explicit cancel (Escape) or double-apply a commit.
  // stopEditing() checks this ref to make repeat calls within the same
  // transition a no-op.
  const isEditingRef = useRef(false)
  // Kept current every render so the window-level mouseup handler (added
  // once) always sees the latest data/columns without needing to
  // re-subscribe on every guest edit.
  const guestsRef = useRef(guests)
  guestsRef.current = guests
  const columnsRef = useRef(columns)
  columnsRef.current = columns

  const warnings = useMemo(() => computeGuestWarnings(guests), [guests])

  const activeSearch = searchQuery.trim().length > 0
  const matchSet = useMemo(() => {
    if (!activeSearch) return null
    const set = new Set<number>()
    guests.forEach((g, i) => {
      if (matchesSearch(g, searchQuery)) set.add(i)
    })
    return set
  }, [guests, searchQuery, activeSearch])

  const focusWrapper = (): void => {
    gridWrapperRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!editingCell) focusWrapper()
  }, [editingCell])

  const scrollCellIntoView = useCallback((row: number, col: number) => {
    const el = gridWrapperRef.current?.querySelector(`[data-row="${row}"][data-col="${col}"]`)
    // Guard for test environments (jsdom) that don't implement scrollIntoView.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [])

  const getCellValue = useCallback(
    (row: number, col: number): string => {
      const guest = guests[row]
      if (!guest) return ''
      return getGuestField(guest, columns[col].field)
    },
    [guests, columns]
  )

  const commitCellValue = useCallback(
    (row: number, col: number, value: string) => {
      onUpdateGuests((prev) => {
        const next = padTo(prev, row + 1).slice()
        next[row] = setGuestField(next[row], columns[col].field, value)
        return next
      })
    },
    [onUpdateGuests, columns]
  )

  const resizeEditInput = useCallback(() => {
    const el = editInputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  /**
   * Begin editing a cell.
   * - `initialValue` set (typing-to-edit): the draft REPLACES the old value
   *   entirely, caret lands at the end (normal spreadsheet "start fresh"
   *   behavior -- no need to delete the old value first).
   * - `initialValue` omitted (F2 / double-click): the existing value is
   *   preserved for normal editing, caret placed at the end.
   */
  const startEditing = useCallback(
    (row: number, col: number, initialValue?: string) => {
      isEditingRef.current = true
      setEditingCell({ row, col })
      setDraftValue(initialValue !== undefined ? initialValue : getCellValue(row, col))
      requestAnimationFrame(() => {
        const el = editInputRef.current
        if (!el) return
        el.focus()
        const pos = el.value.length
        el.setSelectionRange(pos, pos)
        resizeEditInput()
      })
    },
    [getCellValue, resizeEditInput]
  )

  useEffect(() => {
    resizeEditInput()
  }, [draftValue, resizeEditInput])

  const stopEditing = useCallback(
    (commit: boolean, overrideValue?: string) => {
      if (!isEditingRef.current) return // already stopped this transition (see isEditingRef comment above)
      isEditingRef.current = false
      if (editingCell && commit) {
        commitCellValue(editingCell.row, editingCell.col, overrideValue !== undefined ? overrideValue : draftValue)
      }
      setEditingCell(null)
      setDraftValue('')
    },
    [editingCell, draftValue, commitCellValue]
  )

  const moveSelection = useCallback(
    (row: number, col: number, extend: boolean) => {
      const clampedRow = Math.max(0, Math.min(rowCount - 1, row))
      const clampedCol = Math.max(0, Math.min(columns.length - 1, col))
      setSelection((prev) => ({
        anchor: extend ? prev.anchor : { row: clampedRow, col: clampedCol },
        focus: { row: clampedRow, col: clampedCol }
      }))
      return { row: clampedRow, col: clampedCol }
    },
    [rowCount, columns.length]
  )

  /** Keyboard-driven selection move: also keeps the target cell scrolled into view. */
  const moveSelectionAndScroll = useCallback(
    (row: number, col: number, extend: boolean) => {
      const clamped = moveSelection(row, col, extend)
      scrollCellIntoView(clamped.row, clamped.col)
    },
    [moveSelection, scrollCellIntoView]
  )

  const commitAndMove = useCallback(
    (row: number, col: number, overrideValue?: string) => {
      stopEditing(true, overrideValue)
      const clamped = moveSelection(row, col, false)
      focusWrapper()
      scrollCellIntoView(clamped.row, clamped.col)
    },
    [stopEditing, moveSelection, scrollCellIntoView]
  )

  const handleCellMouseDown = (row: number, col: number, shiftKey: boolean): void => {
    if (editingCell) stopEditing(true)
    setContextMenu(null)
    setColumnMenu(null)
    const current = normalizeSelection(selection)
    const insideSelection =
      !shiftKey && row >= current.rowStart && row <= current.rowEnd && col >= current.colStart && col <= current.colEnd
    if (insideSelection) {
      // Might become a drag-to-move; resolved on mouseup/mouseenter (see below).
      dragModeRef.current = 'pending-move'
    } else {
      dragModeRef.current = 'select'
      isMouseSelecting.current = true
      moveSelection(row, col, shiftKey)
    }
    focusWrapper()
  }

  const handleCellMouseEnter = (row: number, col: number): void => {
    if (dragModeRef.current === 'select') {
      if (isMouseSelecting.current) moveSelection(row, col, true)
      return
    }
    if (dragModeRef.current === 'pending-move') {
      const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)
      const grab = { row: selection.focus.row, col: selection.focus.col }
      if (row !== grab.row || col !== grab.col) {
        dragModeRef.current = 'move'
        setMoveDrag({ source: { rowStart, rowEnd, colStart, colEnd }, grab, hover: { row, col } })
      }
      return
    }
    if (dragModeRef.current === 'move') {
      setMoveDrag((prev) => (prev ? { ...prev, hover: { row, col } } : prev))
    }
  }

  useEffect(() => {
    const onMouseUp = (): void => {
      isMouseSelecting.current = false
      if (dragModeRef.current === 'move' && moveDrag) {
        const cols = columnsRef.current
        const currentGuests = guestsRef.current
        const dest = computeMoveDestinationTopLeft(moveDrag.source, moveDrag.grab, moveDrag.hover, cols.length)
        const height = moveDrag.source.rowEnd - moveDrag.source.rowStart
        const width = moveDrag.source.colEnd - moveDrag.source.colStart
        const destRect: CellRect = {
          rowStart: dest.row,
          rowEnd: dest.row + height,
          colStart: dest.col,
          colEnd: Math.min(cols.length - 1, dest.col + width)
        }
        const wouldOverwrite = rangeHasDataOutside(currentGuests, destRect, moveDrag.source, cols)
        const proceed =
          !wouldOverwrite ||
          window.confirm('This will overwrite existing data in the destination cells. Move anyway?')
        if (proceed) {
          const result = applyMoveToGuests(currentGuests, moveDrag.source, dest, cols)
          onUpdateGuests(() => result.guests)
          setSelection({
            anchor: { row: result.dest.rowStart, col: result.dest.colStart },
            focus: { row: result.dest.rowEnd, col: result.dest.colEnd }
          })
        }
      } else if (dragModeRef.current === 'pending-move') {
        // A plain click (no drag) on an already-selected cell: collapse to it, like a normal click.
        moveSelection(selection.focus.row, selection.focus.col, false)
      }
      dragModeRef.current = 'select'
      setMoveDrag(null)
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveDrag, onUpdateGuests, selection.focus.row, selection.focus.col])

  const handleCellDoubleClick = (row: number, col: number): void => {
    // Defensive: a real mouse double-click's preceding mousedown already
    // selects (row, col) via handleCellMouseDown, but don't rely on that --
    // explicitly sync selection here too so editingCell and selection.focus
    // can never point at different cells.
    moveSelection(row, col, false)
    startEditing(row, col)
  }

  const clearSelection = useCallback(() => {
    const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)
    onUpdateGuests((prev) => {
      const next = padTo(prev, rowEnd + 1).slice()
      for (let r = rowStart; r <= rowEnd; r++) {
        let guest = next[r]
        for (let c = colStart; c <= colEnd; c++) {
          guest = setGuestField(guest, columns[c].field, '')
        }
        next[r] = guest
      }
      return next
    })
  }, [selection, onUpdateGuests, columns])

  const copySelection = useCallback(() => {
    const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)
    const grid: string[][] = []
    for (let r = rowStart; r <= rowEnd; r++) {
      const rowVals: string[] = []
      for (let c = colStart; c <= colEnd; c++) {
        rowVals.push(getCellValue(r, c))
      }
      grid.push(rowVals)
    }
    return toTsv(grid)
  }, [selection, getCellValue])

  /** Auto-fit each touched column's width to its (post-write) content. Keeps horizontally-pasted/imported data from looking artificially tall in narrow default columns. */
  const autoFitColumns = useCallback(
    (nextGuests: Guest[], colStart: number, colEnd: number) => {
      const referenceEl = gridWrapperRef.current
      if (!referenceEl) return
      for (let c = colStart; c <= colEnd && c < columns.length; c++) {
        const def = columns[c]
        const values = nextGuests.map((g) => getGuestField(g, def.field))
        const fitted = autoFitColumnWidth(def.label, values, referenceEl)
        const current = columnWidths[def.id] ?? def.defaultWidth
        if (fitted > current) onColumnWidthChange(def.id, fitted)
      }
    },
    [columns, columnWidths, onColumnWidthChange]
  )

  const pasteAt = useCallback(
    (row: number, col: number, text: string) => {
      const block = parseTsv(text)
      if (block.length === 0) return
      const result = applyPasteToGuests(guests, row, col, block, columns)
      onUpdateGuests(() => result.guests)
      setSelection({ anchor: { row, col }, focus: { row: result.lastRow, col: result.lastCol } })
      autoFitColumns(result.guests, col, result.lastCol)
    },
    [guests, columns, onUpdateGuests, autoFitColumns]
  )

  // --- Selection-mode keyboard handling (grid wrapper has focus) ----------
  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const { row, col } = selection.focus
    const shift = e.shiftKey

    if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (shift) onRedo()
      else onUndo()
      return
    }
    if (e.key === 'y' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onRedo()
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveSelectionAndScroll(row + 1, col, shift)
        return
      case 'ArrowUp':
        e.preventDefault()
        moveSelectionAndScroll(row - 1, col, shift)
        return
      case 'ArrowLeft':
        e.preventDefault()
        moveSelectionAndScroll(row, col - 1, shift)
        return
      case 'ArrowRight':
        e.preventDefault()
        moveSelectionAndScroll(row, col + 1, shift)
        return
      case 'Tab':
        e.preventDefault()
        moveSelectionAndScroll(row, col + (e.shiftKey ? -1 : 1), false)
        return
      case 'Enter':
        // Not editing: Enter moves down, matching normal spreadsheet feel
        // (F2 / double-click / typing are what open the editor).
        e.preventDefault()
        moveSelectionAndScroll(row + 1, col, false)
        return
      case 'F2':
        e.preventDefault()
        startEditing(row, col)
        return
      case 'Backspace':
      case 'Delete':
        e.preventDefault()
        clearSelection()
        return
      default:
        break
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      startEditing(row, col, e.key)
    }
  }

  const handleGridPaste = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    pasteAt(selection.focus.row, selection.focus.col, text)
  }

  const handleGridCopy = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', copySelection())
  }

  const handleGridCut = (e: ReactClipboardEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', copySelection())
    clearSelection()
  }

  // --- Context menu (right-click) ------------------------------------------
  const handleCellContextMenu = (row: number, col: number, e: ReactMouseEvent): void => {
    e.preventDefault()
    if (editingCell) stopEditing(true)
    const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)
    const inside = row >= rowStart && row <= rowEnd && col >= colStart && col <= colEnd
    if (!inside) moveSelection(row, col, false)
    focusWrapper()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) pasteAt(selection.focus.row, selection.focus.col, text)
    } catch {
      // Clipboard permission denied or unavailable -- silently no-op rather than crash the menu.
    }
  }, [pasteAt, selection.focus])

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'Cut',
      onSelect: () => {
        void navigator.clipboard.writeText(copySelection())
        clearSelection()
      }
    },
    { label: 'Copy', onSelect: () => void navigator.clipboard.writeText(copySelection()) },
    { label: 'Paste', onSelect: () => void pasteFromClipboard() },
    { label: 'Delete', onSelect: clearSelection }
  ]

  // --- Ghost autocomplete (while editing) ----------------------------------
  const suggestionFreq = useMemo(() => {
    if (!editingCell) return null
    return buildValueFrequency(guests, columns[editingCell.col].field)
  }, [editingCell, guests, columns])

  const suggestion = useMemo(() => {
    if (!suggestionFreq) return null
    return suggestCompletion(draftValue, suggestionFreq)
  }, [suggestionFreq, draftValue])

  // --- Editing-mode keyboard handling (cell's own textarea has focus) -----
  const handleEditKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    // The editor textarea is nested inside the grid wrapper, which has its
    // own onKeyDown for selection-mode navigation (unconditional arrows,
    // Backspace/Delete-clears-cell, etc). Without stopping propagation here,
    // every keystroke while editing would ALSO bubble up and re-trigger
    // those grid-level handlers -- e.g. Backspace to delete a character
    // would simultaneously wipe the cell via the wrapper's clearSelection().
    e.stopPropagation()
    const el = e.currentTarget
    const { row, col } = selection.focus
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitAndMove(row + 1, col)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (suggestion && atEnd) {
        commitAndMove(row, col + (e.shiftKey ? -1 : 1), draftValue + suggestion)
        return
      }
      commitAndMove(row, col + (e.shiftKey ? -1 : 1))
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      stopEditing(false)
      focusWrapper()
      return
    }

    if (e.key === 'ArrowRight') {
      if (suggestion && atEnd) {
        e.preventDefault()
        const accepted = draftValue + suggestion
        setDraftValue(accepted)
        requestAnimationFrame(() => el.setSelectionRange(accepted.length, accepted.length))
        return
      }
      if (atEnd) {
        e.preventDefault()
        commitAndMove(row, col + 1)
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      if (el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault()
        commitAndMove(row, col - 1)
      }
      return
    }
    if (e.key === 'ArrowUp') {
      const columnsEstimate = estimateColumnsForTextarea(el)
      if (isCaretOnFirstVisualLine(el.value, el.selectionStart, columnsEstimate)) {
        e.preventDefault()
        commitAndMove(row - 1, col)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      const columnsEstimate = estimateColumnsForTextarea(el)
      if (isCaretOnLastVisualLine(el.value, el.selectionStart, columnsEstimate)) {
        e.preventDefault()
        commitAndMove(row + 1, col)
      }
      return
    }
  }

  // --- Column resizing -------------------------------------------------
  const resizingRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null)

  const widthFor = (columnId: string): number => {
    const def = columns.find((c) => c.id === columnId)
    return columnWidths[columnId] ?? def?.defaultWidth ?? 120
  }

  const handleResizeStart = (columnId: string, e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { columnId, startX: e.clientX, startWidth: widthFor(columnId) }
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
  }
  const handleResizeMove = (e: MouseEvent): void => {
    const r = resizingRef.current
    if (!r) return
    const delta = e.clientX - r.startX
    const newWidth = Math.max(MIN_COLUMN_WIDTH, r.startWidth + delta)
    onColumnWidthChange(r.columnId, newWidth)
  }
  const handleResizeEnd = (): void => {
    resizingRef.current = null
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', handleResizeEnd)
  }

  const handleResizeDoubleClick = (columnId: string, e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const def = columns.find((c) => c.id === columnId)
    const referenceEl = gridWrapperRef.current
    if (!def || !referenceEl) return
    const values = guests.map((g) => getGuestField(g, def.field))
    onColumnWidthChange(columnId, autoFitColumnWidth(def.label, values, referenceEl))
  }

  // --- Column header: select / action menu / drag-to-reorder --------------
  //
  // A single mousedown on a header is ambiguous until it either releases in
  // place (a click -> select the column) or moves past a small threshold
  // (a drag -> reorder). This mirrors the cell move-drag pattern above, and
  // deliberately requires that threshold so reordering (uncommon) can't be
  // triggered by an ordinary click (common).
  const selectColumn = useCallback(
    (columnId: string) => {
      const colIndex = columns.findIndex((c) => c.id === columnId)
      if (colIndex === -1) return
      setSelection({ anchor: { row: 0, col: colIndex }, focus: { row: rowCount - 1, col: colIndex } })
      focusWrapper()
    },
    [columns, rowCount]
  )

  const handleHeaderMouseDown = (columnId: string, e: ReactMouseEvent): void => {
    if (e.button !== 0) return
    e.preventDefault() // avoid native text-selection drag across header labels
    if (editingCell) stopEditing(true)
    setContextMenu(null)
    setColumnMenu(null)
    columnDragRef.current = { columnId, startX: e.clientX, startY: e.clientY, dragging: false }
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const drag = columnDragRef.current
      if (!drag) return
      if (!drag.dragging) {
        const distance = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
        if (distance < COLUMN_DRAG_THRESHOLD_PX) return
        drag.dragging = true
        setColumnDrag({ columnId: drag.columnId, overColumnId: drag.columnId })
      }
      // e.target for a mousemove is normally an Element, but isn't guaranteed
      // to be one (e.g. it can be the document during fast pointer movement
      // that briefly exits the viewport) -- guard defensively.
      const eventTarget = e.target instanceof Element ? e.target : null
      const target = eventTarget?.closest<HTMLElement>('th[data-column-id]')
      const overId = target?.dataset.columnId
      if (overId) setColumnDrag((prev) => (prev ? { ...prev, overColumnId: overId } : prev))
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  useEffect(() => {
    const onMouseUp = (): void => {
      const drag = columnDragRef.current
      if (!drag) return
      if (drag.dragging) {
        if (columnDrag?.overColumnId && columnDrag.overColumnId !== drag.columnId) {
          onReorderColumns(moveColumnId(columnOrder, drag.columnId, columnDrag.overColumnId))
        }
      } else {
        // Released without ever passing the drag threshold: an ordinary click.
        selectColumn(drag.columnId)
      }
      columnDragRef.current = null
      setColumnDrag(null)
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [columnDrag, columnOrder, onReorderColumns, selectColumn])

  const openColumnMenu = (columnId: string, e: ReactMouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    selectColumn(columnId)
    setColumnMenu({ columnId, x: e.clientX, y: e.clientY })
  }

  const columnMenuItemsFor = (columnId: string): ContextMenuItem[] => {
    const def = columns.find((c) => c.id === columnId)
    const fieldId = def ? customFieldIdForColumn(def) : null
    return [
      {
        label: 'Delete Column',
        disabled: !fieldId,
        disabledReason: "Built-in columns can't be deleted",
        onSelect: () => {
          if (!def || !fieldId) return
          const confirmed = window.confirm(
            `Delete the "${def.label}" column? This removes it and its data from every guest. This can't be undone.`
          )
          if (confirmed) onDeleteCustomField(fieldId)
        }
      }
    ]
  }

  const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)
  const isColumnFullySelected = (col: number): boolean =>
    colStart === col && colEnd === col && rowStart === 0 && rowEnd === rowCount - 1
  const moveDestRect: CellRect | null = moveDrag
    ? (() => {
        const dest = computeMoveDestinationTopLeft(moveDrag.source, moveDrag.grab, moveDrag.hover, columns.length)
        const height = moveDrag.source.rowEnd - moveDrag.source.rowStart
        const width = moveDrag.source.colEnd - moveDrag.source.colStart
        return {
          rowStart: dest.row,
          rowEnd: dest.row + height,
          colStart: dest.col,
          colEnd: Math.min(columns.length - 1, dest.col + width)
        }
      })()
    : null

  return (
    <div
      className={`grid-wrapper${moveDrag ? ' is-moving' : ''}`}
      data-testid="grid-wrapper"
      ref={gridWrapperRef}
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
      onPaste={handleGridPaste}
      onCopy={handleGridCopy}
      onCut={handleGridCut}
    >
      <table className="grid-table">
        <colgroup>
          <col className="row-header-col" />
          {columns.map((c) => (
            <col key={c.id} style={{ width: widthFor(c.id) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="row-header-cell" />
            {columns.map((c, col) => (
              <th
                key={c.id}
                data-column-id={c.id}
                className={[
                  'col-header',
                  isColumnFullySelected(col) ? 'col-header-selected' : '',
                  columnDrag?.columnId === c.id ? 'col-header-dragging' : '',
                  columnDrag && columnDrag.columnId !== c.id && columnDrag.overColumnId === c.id
                    ? 'col-header-drop-target'
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseDown={(e) => handleHeaderMouseDown(c.id, e)}
              >
                <span className="col-header-label">{c.label}</span>
                <button
                  type="button"
                  className="col-menu-button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => openColumnMenu(c.id, e)}
                  aria-label={`${c.label} column options`}
                  title="Column options"
                >
                  ⋮
                </button>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => handleResizeStart(c.id, e)}
                  onDoubleClick={(e) => handleResizeDoubleClick(c.id, e)}
                  title="Drag to resize, double-click to fit content"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, row) => {
            const guest = guests[row]
            const isDataRow = Boolean(guest)
            const rowWarnings: GuestWarning[] = (guest && warnings.get(guest.id)) || []
            const dimmed = activeSearch && isDataRow && !matchSet?.has(row)
            const highlighted = activeSearch && isDataRow && matchSet?.has(row)

            return (
              <tr key={row} className={dimmed ? 'row-dimmed' : highlighted ? 'row-highlighted' : ''}>
                <td className="row-header-cell">{row + 1}</td>
                {columns.map((c, col) => {
                  const isEditing = editingCell?.row === row && editingCell?.col === col
                  const isSelected =
                    row >= rowStart && row <= rowEnd && col >= colStart && col <= colEnd
                  const isPrimary = selection.focus.row === row && selection.focus.col === col
                  const isMoveSource =
                    moveDrag &&
                    row >= moveDrag.source.rowStart &&
                    row <= moveDrag.source.rowEnd &&
                    col >= moveDrag.source.colStart &&
                    col <= moveDrag.source.colEnd
                  const isMoveTarget =
                    moveDestRect &&
                    row >= moveDestRect.rowStart &&
                    row <= moveDestRect.rowEnd &&
                    col >= moveDestRect.colStart &&
                    col <= moveDestRect.colEnd
                  const value = getCellValue(row, col)
                  const cellWarnings = rowWarnings.filter((w) => {
                    if (w.kind === 'malformed-email') return c.field === 'email'
                    if (w.kind === 'incomplete-address') return c.id === 'address1'
                    if (w.kind === 'possible-duplicate') return c.id === 'firstName'
                    return false
                  })

                  return (
                    <td
                      key={c.id}
                      data-row={row}
                      data-col={col}
                      className={[
                        'grid-cell',
                        isSelected ? 'cell-selected' : '',
                        isPrimary ? 'cell-primary' : '',
                        cellWarnings.length > 0 ? 'cell-warning' : '',
                        isMoveSource ? 'cell-move-source' : '',
                        isMoveTarget ? 'cell-move-target' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => handleCellMouseDown(row, col, e.shiftKey)}
                      onMouseEnter={() => handleCellMouseEnter(row, col)}
                      onDoubleClick={() => handleCellDoubleClick(row, col)}
                      onContextMenu={(e) => handleCellContextMenu(row, col, e)}
                      title={cellWarnings.map((w) => w.message).join('\n') || undefined}
                    >
                      {isEditing ? (
                        <div className="cell-editor-container">
                          <textarea
                            ref={editInputRef}
                            className="cell-editor"
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            onBlur={() => stopEditing(true)}
                            rows={1}
                          />
                          {suggestion && (
                            <div className="cell-ghost-overlay" aria-hidden>
                              <span className="cell-ghost-typed">{draftValue}</span>
                              <span className="cell-ghost-suggestion">{suggestion}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="cell-display">{value}</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />
      )}
      {columnMenu && (
        <ContextMenu
          x={columnMenu.x}
          y={columnMenu.y}
          items={columnMenuItemsFor(columnMenu.columnId)}
          onClose={() => setColumnMenu(null)}
        />
      )}
    </div>
  )
}
