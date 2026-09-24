import { describe, expect, it } from 'vitest'
import { computeImportColumnVisibility, guessColumnMapping, parseCsv, rowsToGuests } from './import'
import { DEFAULT_GRID_COLUMNS, getGuestField } from './types'

describe('parseCsv', () => {
  it('parses a simple table with a header row', () => {
    const table = parseCsv('First,Last,Email\nJane,Doe,jane@example.com\nBo,Kim,bo@example.com\n')
    expect(table.headers).toEqual(['First', 'Last', 'Email'])
    expect(table.rows).toEqual([
      ['Jane', 'Doe', 'jane@example.com'],
      ['Bo', 'Kim', 'bo@example.com']
    ])
  })

  it('handles quoted fields with embedded commas, quotes, and newlines', () => {
    const table = parseCsv('Name,Note\n"Doe, Jane","Says ""hi""\nsecond line"\n')
    expect(table.rows).toEqual([['Doe, Jane', 'Says "hi"\nsecond line']])
  })

  it('handles a file with no trailing newline', () => {
    const table = parseCsv('A,B\n1,2')
    expect(table.rows).toEqual([['1', '2']])
  })

  it('returns an empty table for blank input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
    expect(parseCsv('\n\n')).toEqual({ headers: [], rows: [] })
  })
})

describe('guessColumnMapping', () => {
  it('matches common header aliases used by other guest-list tools', () => {
    const mapping = guessColumnMapping([
      'First',
      'Last',
      'Street',
      'Town',
      'State',
      'Zip Code',
      'Email Address',
      'Some Random Column'
    ])
    expect(mapping).toEqual([
      'firstName',
      'lastName',
      'address.address1',
      'address.city',
      'address.state',
      'address.zip',
      'email',
      null
    ])
  })
})

describe('rowsToGuests', () => {
  it('converts mapped rows into guests and skips fully blank rows', () => {
    const table = {
      headers: ['First', 'Last', 'Email'],
      rows: [
        ['Jane', 'Doe', 'jane@example.com'],
        ['', '', ''],
        ['Bo', 'Kim', '']
      ]
    }
    const guests = rowsToGuests(table, ['firstName', 'lastName', 'email'])
    expect(guests).toHaveLength(2)
    expect(getGuestField(guests[0], 'firstName')).toBe('Jane')
    expect(getGuestField(guests[0], 'email')).toBe('jane@example.com')
    expect(getGuestField(guests[1], 'firstName')).toBe('Bo')
    expect(getGuestField(guests[1], 'email')).toBe('')
  })

  it('ignores columns mapped to null ("Don\'t import")', () => {
    const table = { headers: ['First', 'Junk'], rows: [['Jane', 'noise']] }
    const guests = rowsToGuests(table, ['firstName', null])
    expect(getGuestField(guests[0], 'firstName')).toBe('Jane')
  })
})

describe('computeImportColumnVisibility (less-opinionated import)', () => {
  it('only shows the mapped built-in columns, in mapped order -- not every default column', () => {
    const { order, hidden } = computeImportColumnVisibility(['firstName', 'lastName', 'email'], [], [])
    expect(order).toEqual(['firstName', 'lastName', 'email'])
    // Everything else (Title, Address 1/2, City, State, ZIP) stays hidden.
    const stillHidden = DEFAULT_GRID_COLUMNS.map((c) => c.id).filter((id) => !order.includes(id))
    expect(hidden).toEqual(stillHidden)
    expect(hidden).toContain('title')
    expect(hidden).toContain('address1')
    expect(hidden).toContain('state')
    expect(hidden).toContain('zip')
  })

  it('includes newly-created custom columns in the mapped order', () => {
    const { order, hidden } = computeImportColumnVisibility(
      ['firstName', 'lastName', 'custom.phone', 'custom.notes'],
      [],
      [
        { id: 'phone', label: 'Phone' },
        { id: 'notes', label: 'Notes' }
      ]
    )
    expect(order).toEqual(['firstName', 'lastName', 'custom-phone', 'custom-notes'])
    expect(hidden).not.toContain('custom-phone')
  })

  it('ignores unmapped (null) source columns', () => {
    const { order } = computeImportColumnVisibility(['firstName', null, 'email'], [], [])
    expect(order).toEqual(['firstName', 'email'])
  })

  it('mapping every field leaves nothing hidden', () => {
    const { hidden } = computeImportColumnVisibility(
      ['title', 'firstName', 'lastName', 'address.address1', 'address.address2', 'address.city', 'address.state', 'address.zip', 'email'],
      [],
      []
    )
    expect(hidden).toEqual([])
  })
})
