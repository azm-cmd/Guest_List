// Core data model for GuestList.
//
// The grid, importer, exporter, and validation logic all operate on this
// model rather than on raw spreadsheet cells. Adding a future field (phone,
// RSVP status, etc.) means extending `Guest`, adding an entry to
// `ALL_GUEST_FIELDS` / grid column defs, and nothing else has to change
// structurally.

export interface GuestAddress {
  address1: string
  address2: string
  city: string
  state: string
  zip: string
}

export function emptyAddress(): GuestAddress {
  return { address1: '', address2: '', city: '', state: '', zip: '' }
}

export interface Guest {
  id: string
  title: string
  firstName: string
  lastName: string
  address: GuestAddress
  email: string
  createdAt: string
  updatedAt: string
}

export function emptyGuest(id: string): Guest {
  const now = new Date().toISOString()
  return {
    id,
    title: '',
    firstName: '',
    lastName: '',
    address: emptyAddress(),
    email: '',
    createdAt: now,
    updatedAt: now
  }
}

/** True if every field on the guest is blank (i.e. an unused buffer row). */
export function isBlankGuest(guest: Guest): boolean {
  return (
    !guest.title.trim() &&
    !guest.firstName.trim() &&
    !guest.lastName.trim() &&
    !guest.address.address1.trim() &&
    !guest.address.address2.trim() &&
    !guest.address.city.trim() &&
    !guest.address.state.trim() &&
    !guest.address.zip.trim() &&
    !guest.email.trim()
  )
}

/** Dotted-path identifiers for every guest field the grid/exporter can address. */
export type GuestFieldPath =
  | 'title'
  | 'firstName'
  | 'lastName'
  | 'address.address1'
  | 'address.address2'
  | 'address.city'
  | 'address.state'
  | 'address.zip'
  | 'email'

export function getGuestField(guest: Guest, field: GuestFieldPath): string {
  if (field.startsWith('address.')) {
    const key = field.slice('address.'.length) as keyof GuestAddress
    return guest.address[key]
  }
  return guest[field as Exclude<GuestFieldPath, `address.${string}`>] as string
}

export function setGuestField(guest: Guest, field: GuestFieldPath, value: string): Guest {
  if (field.startsWith('address.')) {
    const key = field.slice('address.'.length) as keyof GuestAddress
    return { ...guest, address: { ...guest.address, [key]: value }, updatedAt: new Date().toISOString() }
  }
  return {
    ...guest,
    [field as Exclude<GuestFieldPath, `address.${string}`>]: value,
    updatedAt: new Date().toISOString()
  }
}

export interface GridColumnDef {
  id: string
  label: string
  field: GuestFieldPath
  defaultWidth: number
}

/** The V1 spreadsheet column set, in display order. */
export const DEFAULT_GRID_COLUMNS: GridColumnDef[] = [
  { id: 'title', label: 'Title', field: 'title', defaultWidth: 70 },
  { id: 'firstName', label: 'First Name', field: 'firstName', defaultWidth: 130 },
  { id: 'lastName', label: 'Last Name', field: 'lastName', defaultWidth: 130 },
  { id: 'address1', label: 'Address 1', field: 'address.address1', defaultWidth: 200 },
  { id: 'address2', label: 'Address 2', field: 'address.address2', defaultWidth: 120 },
  { id: 'city', label: 'City', field: 'address.city', defaultWidth: 120 },
  { id: 'state', label: 'State', field: 'address.state', defaultWidth: 70 },
  { id: 'zip', label: 'ZIP', field: 'address.zip', defaultWidth: 90 },
  { id: 'email', label: 'Email', field: 'email', defaultWidth: 200 }
]

// ---------------------------------------------------------------------------
// Export system
// ---------------------------------------------------------------------------

export type ExportFilterKind =
  | 'all'
  | 'anyAddress'
  | 'addressOnly'
  | 'addressAndEmail'
  | 'hasEmail'

export const EXPORT_FILTER_LABELS: Record<ExportFilterKind, string> = {
  all: 'All guests',
  anyAddress: 'Any guest with an address',
  addressOnly: 'Address only (no email on file)',
  addressAndEmail: 'Address + email',
  hasEmail: 'Any guest with an email'
}

/** A source a mapped output column can pull from. Includes a couple of convenience composites. */
export type ExportSourceField = GuestFieldPath | 'fullName' | 'fullAddressLine'

export const EXPORT_SOURCE_LABELS: Record<ExportSourceField, string> = {
  title: 'Title',
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name (Title First Last)',
  'address.address1': 'Address 1',
  'address.address2': 'Address 2',
  fullAddressLine: 'Address 1 + 2 (combined)',
  'address.city': 'City',
  'address.state': 'State',
  'address.zip': 'ZIP',
  email: 'Email'
}

export interface ExportColumnMapping {
  id: string
  outputLabel: string
  source: ExportSourceField
}

export interface ExportPreset {
  id: string
  name: string
  filter: ExportFilterKind
  columns: ExportColumnMapping[]
  format: 'csv'
  builtIn?: boolean
}

function col(outputLabel: string, source: ExportSourceField): ExportColumnMapping {
  return { id: crypto.randomUUID(), outputLabel, source }
}

export function defaultAddressColumns(): ExportColumnMapping[] {
  return [
    col('Title', 'title'),
    col('First Name', 'firstName'),
    col('Last Name', 'lastName'),
    col('Address 1', 'address.address1'),
    col('Address 2', 'address.address2'),
    col('City', 'address.city'),
    col('State', 'address.state'),
    col('ZIP', 'address.zip')
  ]
}

export function defaultEmailColumns(): ExportColumnMapping[] {
  return [col('First Name', 'firstName'), col('Last Name', 'lastName'), col('Email', 'email')]
}

export function builtInPresets(): ExportPreset[] {
  return [
    {
      id: 'preset-avery-labels',
      name: 'Avery Labels',
      filter: 'addressOnly',
      columns: defaultAddressColumns(),
      format: 'csv',
      builtIn: true
    },
    {
      id: 'preset-paperless-post',
      name: 'Paperless Post',
      filter: 'hasEmail',
      columns: defaultEmailColumns(),
      format: 'csv',
      builtIn: true
    }
  ]
}

// ---------------------------------------------------------------------------
// Document (native .guestlist file format)
// ---------------------------------------------------------------------------

export const CURRENT_FORMAT_VERSION = 1

export interface GuestListDocument {
  formatVersion: typeof CURRENT_FORMAT_VERSION
  documentId: string
  title: string
  createdAt: string
  updatedAt: string
  guests: Guest[]
  exportPresets: ExportPreset[]
  columnWidths: Record<string, number>
}

export function emptyDocument(title = 'Untitled Guest List'): GuestListDocument {
  const now = new Date().toISOString()
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    documentId: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    guests: [],
    exportPresets: builtInPresets(),
    columnWidths: {}
  }
}
