import {
  emptyGuest,
  getGuestField,
  isBlankGuest,
  setGuestField,
  type Guest,
  type GridColumnDef
} from '@shared/types'

export const INITIAL_BUFFER_ROWS = 15
export const TRAILING_BUFFER_ROWS = 15

/** Pad the guest array with blank rows so it has at least `length` entries. */
export function padTo(guests: Guest[], length: number): Guest[] {
  if (guests.length >= length) return guests
  const next = guests.slice()
  while (next.length < length) {
    next.push(emptyGuest(crypto.randomUUID()))
  }
  return next
}

/** Drop fully-blank rows from the end of the array (keeps the stored document tidy). */
export function trimTrailingBlank(guests: Guest[]): Guest[] {
  let end = guests.length
  while (end > 0 && isBlankGuest(guests[end - 1])) end--
  return end === guests.length ? guests : guests.slice(0, end)
}

/** How many rows the grid should render: real data rows plus a trailing buffer of empty rows. */
export function totalRowCount(guestCount: number): number {
  return Math.max(guestCount + TRAILING_BUFFER_ROWS, INITIAL_BUFFER_ROWS)
}

export interface CellRef {
  row: number
  col: number
}

export interface SelectionRange {
  anchor: CellRef
  focus: CellRef
}

/**
 * Apply a pasted 2D block of text to the guest array starting at (row, col),
 * padding with blank rows as needed. Columns beyond the last grid column are
 * dropped. Returns the new guests array plus the resulting selection extent.
 */
export function applyPasteToGuests(
  guests: Guest[],
  row: number,
  col: number,
  block: string[][],
  columns: GridColumnDef[]
): { guests: Guest[]; lastRow: number; lastCol: number } {
  const neededLen = row + block.length
  const next = padTo(guests, neededLen).slice()
  block.forEach((rowVals, r) => {
    let guest = next[row + r]
    rowVals.forEach((val, c) => {
      const colIndex = col + c
      if (colIndex >= columns.length) return
      guest = setGuestField(guest, columns[colIndex].field, val)
    })
    next[row + r] = guest
  })
  const lastRow = row + block.length - 1
  const lastCol = Math.min(columns.length - 1, col + (block[0]?.length ?? 1) - 1)
  return { guests: next, lastRow, lastCol }
}

export interface CellRect {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

/**
 * Where a dragged range should land: preserves the offset between the cell
 * the user grabbed and the top-left of the source range, so dragging feels
 * anchored to the cursor rather than always snapping the range's corner to it.
 * Row is clamped to >= 0 (rows can grow); columns are clamped so the whole
 * width stays within the existing column set (dragging never creates columns).
 */
export function computeMoveDestinationTopLeft(
  source: CellRect,
  grabCell: CellRef,
  hoverCell: CellRef,
  columnCount: number
): CellRef {
  const rowOffset = grabCell.row - source.rowStart
  const colOffset = grabCell.col - source.colStart
  const width = source.colEnd - source.colStart + 1
  const row = Math.max(0, hoverCell.row - rowOffset)
  const col = Math.max(0, Math.min(columnCount - width, hoverCell.col - colOffset))
  return { row, col }
}

/**
 * Move (not copy) a rectangular range of cells to a new top-left location.
 * Source values are read out before anything is mutated, so an overlapping
 * source/destination range never loses data. Cells that are only in the
 * source (not also covered by the destination) are cleared; destination
 * cells receive the moved values. Columns beyond the grid are dropped.
 */
export function applyMoveToGuests(
  guests: Guest[],
  source: CellRect,
  destTopLeft: CellRef,
  columns: GridColumnDef[]
): { guests: Guest[]; dest: CellRect } {
  const height = source.rowEnd - source.rowStart + 1
  const width = source.colEnd - source.colStart + 1
  const destRowStart = Math.max(0, destTopLeft.row)
  const destColStart = Math.max(0, destTopLeft.col)
  const destRowEnd = destRowStart + height - 1
  const destColEnd = Math.min(columns.length - 1, destColStart + width - 1)

  const values: string[][] = []
  for (let r = source.rowStart; r <= source.rowEnd; r++) {
    const row: string[] = []
    const guest = guests[r]
    for (let c = source.colStart; c <= source.colEnd; c++) {
      row.push(guest ? getGuestField(guest, columns[c].field) : '')
    }
    values.push(row)
  }

  const neededLen = Math.max(guests.length, destRowEnd + 1, source.rowEnd + 1)
  const next = padTo(guests, neededLen).slice()

  for (let r = source.rowStart; r <= source.rowEnd; r++) {
    let guest = next[r]
    for (let c = source.colStart; c <= source.colEnd; c++) {
      guest = setGuestField(guest, columns[c].field, '')
    }
    next[r] = guest
  }

  values.forEach((rowVals, r) => {
    const destRow = destRowStart + r
    let guest = next[destRow]
    rowVals.forEach((val, c) => {
      const destCol = destColStart + c
      if (destCol >= columns.length) return
      guest = setGuestField(guest, columns[destCol].field, val)
    })
    next[destRow] = guest
  })

  return {
    guests: next,
    dest: { rowStart: destRowStart, rowEnd: destRowEnd, colStart: destColStart, colEnd: destColEnd }
  }
}

/** True if any cell in `rect` outside of `excluding` currently has a non-blank value. */
export function rangeHasDataOutside(
  guests: Guest[],
  rect: CellRect,
  excluding: CellRect,
  columns: GridColumnDef[]
): boolean {
  for (let r = rect.rowStart; r <= rect.rowEnd; r++) {
    const guest = guests[r]
    if (!guest) continue
    for (let c = rect.colStart; c <= Math.min(rect.colEnd, columns.length - 1); c++) {
      const insideExcluded =
        r >= excluding.rowStart && r <= excluding.rowEnd && c >= excluding.colStart && c <= excluding.colEnd
      if (insideExcluded) continue
      if (getGuestField(guest, columns[c].field).trim()) return true
    }
  }
  return false
}

export function normalizeSelection(sel: SelectionRange): {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
} {
  return {
    rowStart: Math.min(sel.anchor.row, sel.focus.row),
    rowEnd: Math.max(sel.anchor.row, sel.focus.row),
    colStart: Math.min(sel.anchor.col, sel.focus.col),
    colEnd: Math.max(sel.anchor.col, sel.focus.col)
  }
}
