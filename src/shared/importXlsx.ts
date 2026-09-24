import * as XLSX from 'xlsx'
import type { ImportedTable } from './import'

export function parseXlsx(data: ArrayBuffer): ImportedTable {
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [] }
  const sheet = workbook.Sheets[sheetName]
  const table: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ''
  })
  const nonEmptyRows = table.filter((r) => r.some((cell) => String(cell).trim() !== ''))
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] }
  const [headers, ...dataRows] = nonEmptyRows
  return { headers: headers.map(String), rows: dataRows.map((r) => r.map(String)) }
}
