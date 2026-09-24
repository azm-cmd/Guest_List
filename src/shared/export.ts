import type { ExportColumnMapping, ExportFilterKind, ExportSourceField, Guest } from './types'
import { getGuestField } from './types'

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

function resolveSourceValue(guest: Guest, source: ExportSourceField): string {
  if (source === 'fullName') {
    return [guest.title, guest.firstName, guest.lastName].filter((s) => s.trim()).join(' ')
  }
  if (source === 'fullAddressLine') {
    return [guest.address.address1, guest.address.address2].filter((s) => s.trim()).join(', ')
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
  const rows = filtered.map((guest) => columns.map((c) => resolveSourceValue(guest, c.source)))
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
