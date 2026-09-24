import { describe, expect, it } from 'vitest'
import {
  buildGridColumns,
  DEFAULT_GRID_COLUMNS,
  emptyGuest,
  exportSourceLabel,
  getGuestField,
  isBlankGuest,
  migrateDocument,
  setGuestField,
  slugifyFieldId,
  emptyDocument,
  type CustomFieldDef
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
  it('defaults customFieldDefs and per-guest customFields for older saved files', () => {
    const legacyDoc = emptyDocument()
    // Simulate a file saved before this feature existed.
    // @ts-expect-error intentionally constructing a legacy shape
    delete legacyDoc.customFieldDefs
    const legacyGuest = emptyGuest('1')
    // @ts-expect-error intentionally constructing a legacy shape
    delete legacyGuest.customFields
    legacyDoc.guests = [legacyGuest]

    const migrated = migrateDocument(legacyDoc)
    expect(migrated.customFieldDefs).toEqual([])
    expect(migrated.guests[0].customFields).toEqual({})
  })

  it('leaves an already-current document unchanged', () => {
    const doc = emptyDocument()
    expect(migrateDocument(doc)).toEqual(doc)
  })
})
