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
  /** User-defined columns created via import (see CustomFieldDef), keyed by field id. */
  customFields: Record<string, string>
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
    customFields: {},
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
    !guest.email.trim() &&
    Object.values(guest.customFields).every((v) => !v.trim())
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
  | `custom.${string}`

export function getGuestField(guest: Guest, field: GuestFieldPath): string {
  if (field.startsWith('custom.')) {
    return guest.customFields[field.slice('custom.'.length)] ?? ''
  }
  if (field.startsWith('address.')) {
    const key = field.slice('address.'.length) as keyof GuestAddress
    return guest.address[key]
  }
  return guest[field as Exclude<GuestFieldPath, `address.${string}` | `custom.${string}`>] as string
}

export function setGuestField(guest: Guest, field: GuestFieldPath, value: string): Guest {
  if (field.startsWith('custom.')) {
    const key = field.slice('custom.'.length)
    return {
      ...guest,
      customFields: { ...guest.customFields, [key]: value },
      updatedAt: new Date().toISOString()
    }
  }
  if (field.startsWith('address.')) {
    const key = field.slice('address.'.length) as keyof GuestAddress
    return { ...guest, address: { ...guest.address, [key]: value }, updatedAt: new Date().toISOString() }
  }
  return {
    ...guest,
    [field as Exclude<GuestFieldPath, `address.${string}` | `custom.${string}`>]: value,
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
// Custom columns (user-defined, created via import; see item 7)
// ---------------------------------------------------------------------------

export interface CustomFieldDef {
  id: string
  label: string
}

/** The full grid column list: built-ins followed by any user-defined custom columns. */
export function buildGridColumns(customFieldDefs: CustomFieldDef[]): GridColumnDef[] {
  return [
    ...DEFAULT_GRID_COLUMNS,
    ...customFieldDefs.map((def) => ({
      id: `custom-${def.id}`,
      label: def.label,
      field: `custom.${def.id}` as GuestFieldPath,
      defaultWidth: 130
    }))
  ]
}

const BUILT_IN_FIELD_IDS = DEFAULT_GRID_COLUMNS.map((c) => c.id)

/** Turn a user-typed column name into a stable, unique field id (e.g. "Spouse Name" -> "spouse-name"). */
export function slugifyFieldId(label: string, existingIds: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '') || 'field'
  const taken = new Set([...BUILT_IN_FIELD_IDS, ...existingIds])
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** True for a built-in column (Title, First Name, ...); false for a user-created custom column. */
export function isBuiltInColumn(columnDef: GridColumnDef): boolean {
  return !columnDef.field.startsWith('custom.')
}

/** The raw custom-field id (e.g. "spouse-name") behind a custom column, or null for a built-in column. */
export function customFieldIdForColumn(columnDef: GridColumnDef): string | null {
  return columnDef.field.startsWith('custom.') ? columnDef.field.slice('custom.'.length) : null
}

/**
 * Apply a saved display order to a column list, self-healing against a
 * stale/missing order: ids no longer present (a deleted custom column) are
 * dropped, and ids not yet present (a newly added custom column, or no
 * saved order at all) are appended at the end in their natural order.
 */
export function orderGridColumns(columns: GridColumnDef[], order: string[]): GridColumnDef[] {
  const byId = new Map(columns.map((c) => [c.id, c]))
  const ordered: GridColumnDef[] = []
  for (const id of order) {
    const c = byId.get(id)
    if (c) {
      ordered.push(c)
      byId.delete(id)
    }
  }
  for (const c of columns) {
    if (byId.has(c.id)) ordered.push(c)
  }
  return ordered
}

/** Move `columnId` to sit immediately before `targetId` in a column-id order array. */
export function moveColumnId(order: string[], columnId: string, targetId: string): string[] {
  if (columnId === targetId) return order
  const next = order.filter((id) => id !== columnId)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex === -1) return order
  next.splice(targetIndex, 0, columnId)
  return next
}

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

/**
 * A source a mapped output column can pull from. Includes a few convenience
 * composites -- `combinedAddress` and `fullName` are always auto-generated
 * from structured data (see shared/contact.ts), never typed in directly.
 * `constant` is an export-only column with no guest source at all (e.g. a
 * "Total Invited" column that doesn't exist in the spreadsheet).
 */
export type ExportSourceField = GuestFieldPath | 'fullName' | 'fullAddressLine' | 'combinedAddress' | 'constant'

type BuiltInExportSourceField = Exclude<ExportSourceField, `custom.${string}`>

export const EXPORT_SOURCE_LABELS: Record<BuiltInExportSourceField, string> = {
  title: 'Title',
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name (Title First Last)',
  'address.address1': 'Address 1',
  'address.address2': 'Address 2',
  fullAddressLine: 'Address 1 + 2 (combined)',
  combinedAddress: 'Combined Address (multi-line)',
  'address.city': 'City',
  'address.state': 'State',
  'address.zip': 'ZIP',
  email: 'Email',
  constant: 'Fixed Value (export-only)'
}

/** Human-readable label for an export source, including user-defined custom columns. */
export function exportSourceLabel(source: ExportSourceField, customFieldDefs: CustomFieldDef[]): string {
  if (source.startsWith('custom.')) {
    const id = source.slice('custom.'.length)
    return customFieldDefs.find((d) => d.id === id)?.label ?? id
  }
  return EXPORT_SOURCE_LABELS[source as BuiltInExportSourceField]
}

export interface ExportColumnMapping {
  id: string
  outputLabel: string
  source: ExportSourceField
  /** Only used when source === 'constant': the fixed value every row gets. */
  constantValue?: string
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

/** An export-only column with a fixed value for every row (e.g. "Total Invited"). */
export function constantColumn(outputLabel: string, value: string): ExportColumnMapping {
  return { id: crypto.randomUUID(), outputLabel, source: 'constant', constantValue: value }
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

/** Paperless Post's default output: an auto-generated full name, email, and an export-only "Total Invited" column. */
export function paperlessPostColumns(): ExportColumnMapping[] {
  return [col('Name', 'fullName'), col('Email', 'email'), constantColumn('Total Invited', '2')]
}

export function builtInPresets(): ExportPreset[] {
  return [
    {
      id: 'preset-avery-labels',
      name: 'Avery Labels',
      // Avery mailing labels are for guests reachable only by mail: anyone
      // with an email on file is excluded, whether or not they also have an
      // address (see guestMatchesFilter's 'addressOnly' case in export.ts).
      filter: 'addressOnly',
      columns: defaultAddressColumns(),
      format: 'csv',
      builtIn: true
    },
    {
      id: 'preset-paperless-post',
      name: 'Paperless Post',
      filter: 'hasEmail',
      columns: paperlessPostColumns(),
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
  customFieldDefs: CustomFieldDef[]
  /** Column display order, as column ids (see GridColumnDef.id). Self-healing via orderGridColumns. */
  columnOrder: string[]
  /**
   * Column ids hidden from the grid (non-destructive -- used for built-in
   * columns like Title/Email/Address 2 the user doesn't need visible; their
   * guest data is untouched and exports referencing them still work).
   * Custom columns are removed outright instead (see deleteCustomField).
   */
  hiddenColumns: string[]
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
    columnWidths: {},
    customFieldDefs: [],
    columnOrder: DEFAULT_GRID_COLUMNS.map((c) => c.id),
    hiddenColumns: []
  }
}

/**
 * Normalize a document loaded from disk so older files (saved before custom
 * columns/column ordering existed, or before a guest had a `customFields`
 * bag) still load cleanly instead of crashing on missing fields.
 */
export function migrateDocument(doc: GuestListDocument): GuestListDocument {
  return {
    ...doc,
    customFieldDefs: doc.customFieldDefs ?? [],
    columnOrder: doc.columnOrder ?? [],
    hiddenColumns: doc.hiddenColumns ?? [],
    guests: doc.guests.map((g) => (g.customFields ? g : { ...g, customFields: {} }))
  }
}
