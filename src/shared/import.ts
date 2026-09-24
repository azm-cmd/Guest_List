import type { CustomFieldDef, Guest, GuestFieldPath } from './types'
import { buildGridColumns, DEFAULT_GRID_COLUMNS, emptyGuest, setGuestField } from './types'

export interface ImportedTable {
  headers: string[]
  rows: string[][]
}

/** Guess a source-column -> guest-field mapping from header text. Best-effort only; the user confirms/edits it. */
const HEADER_HINTS: Array<{ field: GuestFieldPath; patterns: RegExp[] }> = [
  { field: 'title', patterns: [/^title$/i, /^prefix$/i, /^salutation$/i] },
  { field: 'firstName', patterns: [/^first\s*name$/i, /^first$/i, /^given\s*name$/i] },
  { field: 'lastName', patterns: [/^last\s*name$/i, /^last$/i, /^surname$/i, /^family\s*name$/i] },
  {
    field: 'address.address1',
    patterns: [/^address(\s*1)?$/i, /^street(\s*address)?$/i, /^address\s*line\s*1$/i]
  },
  { field: 'address.address2', patterns: [/^address\s*2$/i, /^apt|unit|suite$/i, /^address\s*line\s*2$/i] },
  { field: 'address.city', patterns: [/^city$/i, /^town$/i] },
  { field: 'address.state', patterns: [/^state$/i, /^province$/i, /^st$/i] },
  { field: 'address.zip', patterns: [/^zip(\s*code)?$/i, /^postal(\s*code)?$/i] },
  { field: 'email', patterns: [/^e-?mail(\s*address)?$/i] }
]

export function guessFieldForHeader(header: string): GuestFieldPath | null {
  const trimmed = header.trim()
  for (const hint of HEADER_HINTS) {
    if (hint.patterns.some((re) => re.test(trimmed))) return hint.field
  }
  return null
}

export function guessColumnMapping(headers: string[]): Array<GuestFieldPath | null> {
  return headers.map(guessFieldForHeader)
}

/** Turn an imported table + a header->field mapping into Guest records. Unmapped columns are ignored. */
export function rowsToGuests(table: ImportedTable, mapping: Array<GuestFieldPath | null>): Guest[] {
  const guests: Guest[] = []
  for (const row of table.rows) {
    const isBlankRow = row.every((cell) => !cell || !cell.trim())
    if (isBlankRow) continue

    let guest = emptyGuest(crypto.randomUUID())
    for (let i = 0; i < mapping.length; i++) {
      const field = mapping[i]
      if (!field) continue
      const value = (row[i] ?? '').trim()
      if (value) guest = setGuestField(guest, field, value)
    }
    guests.push(guest)
  }
  return guests
}

/**
 * Compute the visible-column order/hidden set for a "less opinionated"
 * import: when importing into a brand-new/empty document, only the columns
 * the user actually mapped (built-in or newly-created custom) should end up
 * visible, in the order they were mapped -- unmapped built-ins (Title,
 * Address, State, ZIP, etc.) stay hidden rather than cluttering the grid
 * with columns that have no data. Their data isn't touched -- see
 * hideColumn/restoreColumn -- only their visibility.
 */
export function computeImportColumnVisibility(
  mapping: Array<GuestFieldPath | null>,
  existingCustomFieldDefs: CustomFieldDef[],
  newCustomFields: CustomFieldDef[]
): { order: string[]; hidden: string[] } {
  const allColumns = buildGridColumns([...existingCustomFieldDefs, ...newCustomFields])
  const order: string[] = []
  const seen = new Set<string>()
  for (const field of mapping) {
    if (!field) continue
    const columnDef = allColumns.find((c) => c.field === field)
    if (columnDef && !seen.has(columnDef.id)) {
      seen.add(columnDef.id)
      order.push(columnDef.id)
    }
  }
  const hidden = DEFAULT_GRID_COLUMNS.map((c) => c.id).filter((id) => !order.includes(id))
  return { order, hidden }
}

/** Minimal RFC 4180-ish CSV parser: handles quoted fields, escaped quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): ImportedTable {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      pushField()
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      pushRow()
      i++
      continue
    }
    field += c
    i++
  }
  // Trailing field/row (file may or may not end with a newline).
  if (field.length > 0 || row.length > 0) pushRow()

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] }

  const [headers, ...dataRows] = nonEmptyRows
  return { headers, rows: dataRows }
}
