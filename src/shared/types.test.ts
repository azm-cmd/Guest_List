import { describe, expect, it } from 'vitest'
import {
  buildGridColumns,
  customFieldIdForColumn,
  DEFAULT_GRID_COLUMNS,
  emptyGuest,
  exportSourceLabel,
  getGuestField,
  isBlankGuest,
  isBuiltInColumn,
  migrateDocument,
  moveColumnId,
  orderGridColumns,
  setGuestField,
  slugifyFieldId,
  emptyDocument,
  type CustomFieldDef,
  type GridColumnDef
} from './types'

describe('custom fields on Guest', () => {
  it('get/set round-trips through a custom.<id> path', () => {
    let guest = emptyGuest('1')
    guest = setGuestField(guest, 'custom.spouse-name', 'Alex')
    expect(getGuestField(guest, 'custom.spouse-name')).toBe('Alex')
    expect(guest.customFields['spouse-name']).toBe('Alex')
  })

  it('reading an unset custom field returns an empty string', () => {
    const guest = emptyGuest('1')
    expect(getGuestField(guest, 'custom.notes')).toBe('')
  })

  it('a guest with only a custom field filled in is not blank', () => {
    let guest = emptyGuest('1')
    expect(isBlankGuest(guest)).toBe(true)
    guest = setGuestField(guest, 'custom.notes', 'Vegetarian')
    expect(isBlankGuest(guest)).toBe(false)
  })
})

describe('slugifyFieldId', () => {
  it('slugifies a label into a stable id', () => {
    expect(slugifyFieldId('Spouse Name', [])).toBe('spouse-name')
  })

  it('avoids colliding with built-in field ids', () => {
    // "Email" as a custom column name shouldn't collide with the built-in id "email".
    expect(slugifyFieldId('Email', [])).toBe('email-2')
  })

  it('avoids colliding with already-existing custom field ids', () => {
    expect(slugifyFieldId('Notes', ['notes'])).toBe('notes-2')
    expect(slugifyFieldId('Notes', ['notes', 'notes-2'])).toBe('notes-3')
  })

  it('falls back to a generic id for a label with no alphanumeric characters', () => {
    expect(slugifyFieldId('???', [])).toBe('field')
  })
})

describe('buildGridColumns', () => {
  it('appends custom columns after the built-in ones, in order', () => {
    const defs: CustomFieldDef[] = [
      { id: 'spouse-name', label: 'Spouse Name' },
      { id: 'notes', label: 'Notes' }
    ]
    const columns = buildGridColumns(defs)
    expect(columns.length).toBe(DEFAULT_GRID_COLUMNS.length + 2)
    expect(columns.slice(0, DEFAULT_GRID_COLUMNS.length)).toEqual(DEFAULT_GRID_COLUMNS)
    expect(columns[DEFAULT_GRID_COLUMNS.length]).toEqual({
      id: 'custom-spouse-name',
      label: 'Spouse Name',
      field: 'custom.spouse-name',
      defaultWidth: 130
    })
  })

  it('with no custom fields, returns exactly the built-in columns', () => {
    expect(buildGridColumns([])).toEqual(DEFAULT_GRID_COLUMNS)
  })
})

describe('exportSourceLabel', () => {
  it('resolves built-in source labels', () => {
    expect(exportSourceLabel('firstName', [])).toBe('First Name')
  })

  it('resolves a custom field label by id', () => {
    const defs: CustomFieldDef[] = [{ id: 'spouse-name', label: 'Spouse Name' }]
    expect(exportSourceLabel('custom.spouse-name', defs)).toBe('Spouse Name')
  })

  it('falls back to the raw id if the custom field def is missing', () => {
    expect(exportSourceLabel('custom.mystery', [])).toBe('mystery')
  })
})

describe('migrateDocument', () => {
  it('defaults customFieldDefs, columnOrder, hiddenColumns and per-guest customFields for older saved files', () => {
    const legacyDoc = emptyDocument()
    // Simulate a file saved before this feature existed.
    // @ts-expect-error intentionally constructing a legacy shape
    delete legacyDoc.customFieldDefs
    // @ts-expect-error intentionally constructing a legacy shape
    delete legacyDoc.columnOrder
    // @ts-expect-error intentionally constructing a legacy shape (pre-dates hideable columns)
    delete legacyDoc.hiddenColumns
    const legacyGuest = emptyGuest('1')
    // @ts-expect-error intentionally constructing a legacy shape
    delete legacyGuest.customFields
    legacyDoc.guests = [legacyGuest]

    const migrated = migrateDocument(legacyDoc)
    expect(migrated.customFieldDefs).toEqual([])
    expect(migrated.columnOrder).toEqual([])
    expect(migrated.hiddenColumns).toEqual([])
    expect(migrated.guests[0].customFields).toEqual({})
    // Even with an empty saved order, the columns still resolve correctly (self-healing).
    expect(orderGridColumns(buildGridColumns([]), migrated.columnOrder)).toEqual(DEFAULT_GRID_COLUMNS)
  })

  it('leaves an already-current document unchanged', () => {
    const doc = emptyDocument()
    expect(migrateDocument(doc)).toEqual(doc)
  })
})

describe('isBuiltInColumn / customFieldIdForColumn', () => {
  it('identifies built-in vs. custom columns', () => {
    expect(isBuiltInColumn(DEFAULT_GRID_COLUMNS[0])).toBe(true)
    const custom: GridColumnDef = { id: 'custom-notes', label: 'Notes', field: 'custom.notes', defaultWidth: 130 }
    expect(isBuiltInColumn(custom)).toBe(false)
  })

  it('extracts the raw field id from a custom column, and null for a built-in one', () => {
    const custom: GridColumnDef = { id: 'custom-notes', label: 'Notes', field: 'custom.notes', defaultWidth: 130 }
    expect(customFieldIdForColumn(custom)).toBe('notes')
    expect(customFieldIdForColumn(DEFAULT_GRID_COLUMNS[0])).toBeNull()
  })
})

describe('orderGridColumns', () => {
  const columns = buildGridColumns([
    { id: 'spouse-name', label: 'Spouse Name' },
    { id: 'notes', label: 'Notes' }
  ])

  it('applies a saved order', () => {
    const order = ['email', 'firstName', 'custom-notes']
    const ordered = orderGridColumns(columns, order)
    expect(ordered.map((c) => c.id)).toEqual([
      'email',
      'firstName',
      'custom-notes',
      // everything else appended in natural order
      'title',
      'lastName',
      'address1',
      'address2',
      'city',
      'state',
      'zip',
      'custom-spouse-name'
    ])
  })

  it('self-heals: drops stale ids and appends new/unlisted ones at the end', () => {
    const order = ['firstName', 'custom-deleted-column', 'lastName']
    const ordered = orderGridColumns(columns, order)
    expect(ordered.map((c) => c.id)).not.toContain('custom-deleted-column')
    expect(ordered[0].id).toBe('firstName')
    expect(ordered[1].id).toBe('lastName')
    expect(ordered.length).toBe(columns.length)
  })

  it('an empty order falls back to the natural (built-in then custom) order', () => {
    expect(orderGridColumns(columns, [])).toEqual(columns)
  })
})

describe('moveColumnId', () => {
  it('moves a column to sit immediately before the target', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(moveColumnId(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveColumnId(order, 'a', 'd')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('is a no-op when moving a column onto itself', () => {
    const order = ['a', 'b', 'c']
    expect(moveColumnId(order, 'b', 'b')).toEqual(order)
  })

  it('is a no-op (returns the original order) if the target id is not found', () => {
    const order = ['a', 'b', 'c']
    expect(moveColumnId(order, 'a', 'missing')).toBe(order)
  })
})

describe('save/reopen persistence (JSON round-trip, as the .guestlist file format)', () => {
  function roundTrip(doc: ReturnType<typeof emptyDocument>): ReturnType<typeof emptyDocument> {
    return migrateDocument(JSON.parse(JSON.stringify(doc)))
  }

  it('preserves custom column definitions and their guest data', () => {
    let doc = emptyDocument()
    doc = {
      ...doc,
      customFieldDefs: [{ id: 'notes', label: 'Notes' }],
      columnOrder: [...doc.columnOrder, 'custom-notes']
    }
    let guest = emptyGuest('1')
    guest = setGuestField(guest, 'firstName', 'Jane')
    guest = setGuestField(guest, 'custom.notes', 'Vegetarian')
    doc = { ...doc, guests: [guest] }

    const reopened = roundTrip(doc)
    expect(reopened.customFieldDefs).toEqual([{ id: 'notes', label: 'Notes' }])
    expect(getGuestField(reopened.guests[0], 'firstName')).toBe('Jane')
    expect(getGuestField(reopened.guests[0], 'custom.notes')).toBe('Vegetarian')
  })

  it('preserves a reordered column order exactly', () => {
    const customOrder = ['email', 'title', 'firstName', 'lastName', 'address1', 'address2', 'city', 'state', 'zip']
    let doc = emptyDocument()
    doc = { ...doc, columnOrder: customOrder }

    const reopened = roundTrip(doc)
    expect(reopened.columnOrder).toEqual(customOrder)
    expect(orderGridColumns(buildGridColumns([]), reopened.columnOrder).map((c) => c.id)).toEqual(customOrder)
  })

  it('preserves multiple custom columns (e.g. Phone and Notes) end to end', () => {
    let doc = emptyDocument()
    doc = {
      ...doc,
      customFieldDefs: [
        { id: 'phone', label: 'Phone' },
        { id: 'notes', label: 'Notes' }
      ],
      columnOrder: [...doc.columnOrder, 'custom-phone', 'custom-notes']
    }
    let guest = emptyGuest('1')
    guest = setGuestField(guest, 'firstName', 'Jane')
    guest = setGuestField(guest, 'custom.phone', '555-1234')
    guest = setGuestField(guest, 'custom.notes', 'Vegetarian')
    doc = { ...doc, guests: [guest] }

    const reopened = roundTrip(doc)
    const columns = orderGridColumns(buildGridColumns(reopened.customFieldDefs), reopened.columnOrder)
    expect(columns.map((c) => c.label)).toContain('Phone')
    expect(columns.map((c) => c.label)).toContain('Notes')
    expect(getGuestField(reopened.guests[0], 'custom.phone')).toBe('555-1234')
    expect(getGuestField(reopened.guests[0], 'custom.notes')).toBe('Vegetarian')
  })

  it('does not disturb built-in field values when custom columns are present', () => {
    let doc = emptyDocument()
    doc = { ...doc, customFieldDefs: [{ id: 'notes', label: 'Notes' }] }
    let guest = emptyGuest('1')
    guest = setGuestField(guest, 'email', 'jane@example.com')
    doc = { ...doc, guests: [guest] }

    const reopened = roundTrip(doc)
    expect(getGuestField(reopened.guests[0], 'email')).toBe('jane@example.com')
  })

  it('preserves hidden (non-destructive) built-in columns, and their data, across save/reopen', () => {
    let doc = emptyDocument()
    doc = { ...doc, hiddenColumns: ['title', 'address2'] }
    let guest = emptyGuest('1')
    guest = setGuestField(guest, 'title', 'Mr.')
    guest = setGuestField(guest, 'firstName', 'John')
    doc = { ...doc, guests: [guest] }

    const reopened = roundTrip(doc)
    expect(reopened.hiddenColumns).toEqual(['title', 'address2'])
    // Data behind a hidden column is untouched -- hiding is display-only.
    expect(getGuestField(reopened.guests[0], 'title')).toBe('Mr.')

    const visible = orderGridColumns(buildGridColumns([]), reopened.columnOrder).filter(
      (c) => !reopened.hiddenColumns.includes(c.id)
    )
    expect(visible.map((c) => c.id)).not.toContain('title')
    expect(visible.map((c) => c.id)).not.toContain('address2')
    expect(visible.map((c) => c.id)).toContain('firstName')
  })
})
