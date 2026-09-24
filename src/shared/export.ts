import type { ExportColumnMapping, ExportFilterKind, Guest } from './types'
import { getGuestField } from './types'
import { computeCombinedAddress, computeFullName } from './contact'

export function hasCompleteAddress(guest: Guest): boolean {
  const { address1, city, state, zip } = guest.address
  return Boolean(address1.trim() && city.trim() && state.trim() && zip.trim())
}

export function hasEmail(guest: Guest): boolean {
  return Boolean(guest.email.trim())
}

export function guestMatchesFilter(guest: Guest, filter: ExportFilterKind): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'anyAddress':
      return hasCompleteAddress(guest)
    case 'addressOnly':
      return hasCompleteAddress(guest) && !hasEmail(guest)
    case 'addressAndEmail':
      return hasCompleteAddress(guest) && hasEmail(guest)
    case 'hasEmail':
      return hasEmail(guest)
    default:
      return true
  }
}

export function filterGuestsForExport(guests: Guest[], filter: ExportFilterKind): Guest[] {
  return guests.filter((g) => guestMatchesFilter(g, filter))
}

function resolveSourceValue(guest: Guest, column: ExportColumnMapping): string {
  const { source } = column
  if (source === 'constant') {
    return column.constantValue ?? ''
  }
  if (source === 'fullName') {
    return computeFullName(guest)
  }
  if (source === 'fullAddressLine') {
    return [guest.address.address1, guest.address.address2].filter((s) => s.trim()).join(', ')
  }
  if (source === 'combinedAddress') {
    return computeCombinedAddress(guest)
  }
  return getGuestField(guest, source)
}

export function buildExportRows(
  guests: Guest[],
  filter: ExportFilterKind,
  columns: ExportColumnMapping[]
): { header: string[]; rows: string[][] } {
  const filtered = filterGuestsForExport(guests, filter)
  const header = columns.map((c) => c.outputLabel)
  const rows = filtered.map((guest) => columns.map((c) => resolveSourceValue(guest, c)))
  return { header, rows }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((line) => line.map(csvEscape).join(','))
  // CRLF is the safest default for spreadsheet-import compatibility (Excel, Avery, Paperless Post).
  return lines.join('\r\n') + '\r\n'
}
