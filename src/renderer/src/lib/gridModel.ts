import { emptyGuest, isBlankGuest, setGuestField, type Guest, type GridColumnDef } from '@shared/types'

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
