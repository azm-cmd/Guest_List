import { describe, expect, it } from 'vitest'
import { guessColumnMapping, parseCsv, rowsToGuests } from './import'
import { getGuestField } from './types'

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
