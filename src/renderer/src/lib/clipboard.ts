/** Parse tab-delimited clipboard text (Excel/Google Sheets copy format) into a 2D array. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Normalize line endings up front so the state machine only deals with \n.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    pushField()
    rows.push(row)
    row = []
  }

  while (i < normalized.length) {
    const c = normalized[i]
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
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
    if (c === '"' && field === '') {
      inQuotes = true
      i++
      continue
    }
    if (c === '\t') {
      pushField()
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
  if (field.length > 0 || row.length > 0) pushRow()

  // Trailing empty row from a final newline.
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop()
  }
  return rows
}

function tsvEscape(value: string): string {
  if (/[\t\n"]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toTsv(grid: string[][]): string {
  return grid.map((row) => row.map(tsvEscape).join('\t')).join('\n')
}
