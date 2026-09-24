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
import { DEFAULT_GRID_COLUMNS, getGuestField, setGuestField, type Guest } from '@shared/types'
import type { GuestWarning } from '@shared/validation'
import { computeGuestWarnings } from '@shared/validation'
import { parseTsv, toTsv } from '../lib/clipboard'
import {
  applyPasteToGuests,
  normalizeSelection,
  padTo,
  totalRowCount,
  type SelectionRange
} from '../lib/gridModel'

const MIN_COLUMN_WIDTH = 60

interface GridProps {
  guests: Guest[]
  columnWidths: Record<string, number>
  searchQuery: string
  onUpdateGuests: (updater: (guests: Guest[]) => Guest[]) => void
  onColumnWidthChange: (columnId: string, width: number) => void
  onUndo: () => void
  onRedo: () => void
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
    guest.email
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

export default function Grid({
  guests,
  columnWidths,
  searchQuery,
  onUpdateGuests,
  onColumnWidthChange,
  onUndo,
  onRedo
}: GridProps): JSX.Element {
  const rowCount = totalRowCount(guests.length)
  const columns = DEFAULT_GRID_COLUMNS

  const [selection, setSelection] = useState<SelectionRange>({
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 }
  })
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const isMouseSelecting = useRef(false)
  const focusSinkRef = useRef<HTMLTextAreaElement | null>(null)
  const editInputRef = useRef<HTMLTextAreaElement | null>(null)
  const tableWrapperRef = useRef<HTMLDivElement | null>(null)

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

  const focusSink = (): void => {
    focusSinkRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!editingCell) focusSink()
  }, [editingCell])

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

  const startEditing = useCallback(
    (row: number, col: number, initialValue?: string) => {
      setEditingCell({ row, col })
      setDraftValue(initialValue !== undefined ? initialValue : getCellValue(row, col))
      requestAnimationFrame(() => {
        editInputRef.current?.focus()
        editInputRef.current?.select()
        resizeEditInput()
      })
    },
    [getCellValue, resizeEditInput]
  )

  useEffect(() => {
    resizeEditInput()
  }, [draftValue, resizeEditInput])

  const stopEditing = useCallback(
    (commit: boolean) => {
      if (editingCell && commit) {
        commitCellValue(editingCell.row, editingCell.col, draftValue)
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
    },
    [rowCount, columns.length]
  )

  const handleCellMouseDown = (row: number, col: number, shiftKey: boolean): void => {
    if (editingCell) stopEditing(true)
    isMouseSelecting.current = true
    moveSelection(row, col, shiftKey)
    focusSink()
  }

  const handleCellMouseEnter = (row: number, col: number): void => {
    if (isMouseSelecting.current) {
      moveSelection(row, col, true)
    }
  }

  useEffect(() => {
    const onMouseUp = (): void => {
      isMouseSelecting.current = false
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  const handleCellDoubleClick = (row: number, col: number): void => {
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

  const pasteAt = useCallback(
    (row: number, col: number, text: string) => {
      const block = parseTsv(text)
      if (block.length === 0) return
      let lastRow = row
      let lastCol = col
      onUpdateGuests((prev) => {
        const result = applyPasteToGuests(prev, row, col, block, columns)
        lastRow = result.lastRow
        lastCol = result.lastCol
        return result.guests
      })
      setSelection({ anchor: { row, col }, focus: { row: lastRow, col: lastCol } })
    },
    [onUpdateGuests, columns]
  )

  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
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
        moveSelection(row + 1, col, shift)
        return
      case 'ArrowUp':
        e.preventDefault()
        moveSelection(row - 1, col, shift)
        return
      case 'ArrowLeft':
        e.preventDefault()
        moveSelection(row, col - 1, shift)
        return
      case 'ArrowRight':
        e.preventDefault()
        moveSelection(row, col + 1, shift)
        return
      case 'Tab':
        e.preventDefault()
        moveSelection(row, col + (e.shiftKey ? -1 : 1), false)
        return
      case 'Enter':
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

  const handleEditKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      stopEditing(true)
      moveSelection(selection.focus.row + 1, selection.focus.col, false)
      focusSink()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      stopEditing(true)
      moveSelection(selection.focus.row, selection.focus.col + (e.shiftKey ? -1 : 1), false)
      focusSink()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      stopEditing(false)
      focusSink()
      return
    }
  }

  const handleCopy = (e: ReactClipboardEvent): void => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', copySelection())
  }

  const handleCut = (e: ReactClipboardEvent): void => {
    e.preventDefault()
    e.clipboardData.setData('text/plain', copySelection())
    clearSelection()
  }

  const handlePaste = (e: ReactClipboardEvent): void => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    pasteAt(selection.focus.row, selection.focus.col, text)
  }

  // --- Column resizing -------------------------------------------------
  const resizingRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null)

  const widthFor = (columnId: string): number => {
    const def = columns.find((c) => c.id === columnId)
    return columnWidths[columnId] ?? def?.defaultWidth ?? 120
  }

  const handleResizeStart = (columnId: string, e: ReactMouseEvent): void => {
    e.preventDefault()
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

  const { rowStart, rowEnd, colStart, colEnd } = normalizeSelection(selection)

  return (
    <div className="grid-wrapper" ref={tableWrapperRef}>
      <textarea
        ref={focusSinkRef}
        className="grid-focus-sink"
        onKeyDown={handleGridKeyDown}
        onChange={() => {}}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        value=""
        aria-hidden
      />
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
            {columns.map((c) => (
              <th key={c.id} className="col-header">
                <span>{c.label}</span>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => handleResizeStart(c.id, e)}
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
                      className={[
                        'grid-cell',
                        isSelected ? 'cell-selected' : '',
                        isPrimary ? 'cell-primary' : '',
                        cellWarnings.length > 0 ? 'cell-warning' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => handleCellMouseDown(row, col, e.shiftKey)}
                      onMouseEnter={() => handleCellMouseEnter(row, col)}
                      onDoubleClick={() => handleCellDoubleClick(row, col)}
                      title={cellWarnings.map((w) => w.message).join('\n') || undefined}
                    >
                      {isEditing ? (
                        <textarea
                          ref={editInputRef}
                          className="cell-editor"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={() => stopEditing(true)}
                          rows={1}
                        />
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
    </div>
  )
}
