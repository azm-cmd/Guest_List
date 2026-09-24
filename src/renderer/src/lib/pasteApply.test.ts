import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID_COLUMNS, getGuestField } from '@shared/types'
import { applyPasteToGuests } from './gridModel'

describe('applyPasteToGuests (multi-row/column paste, the core grid requirement)', () => {
  it('creates the necessary rows when pasting into an empty list', () => {
    const block = [
      ['Mr.', 'Jane', 'Doe', '1 Main St', '', 'Springfield', 'IL', '62704', 'jane@example.com'],
      ['Ms.', 'Bo', 'Kim', '2 Oak Ave', 'Apt 3', 'Austin', 'TX', '73301', 'bo@example.com']
    ]
    const { guests, lastRow, lastCol } = applyPasteToGuests([], 0, 0, block, DEFAULT_GRID_COLUMNS)
    expect(guests).toHaveLength(2)
    expect(getGuestField(guests[0], 'firstName')).toBe('Jane')
    expect(getGuestField(guests[0], 'address.city')).toBe('Springfield')
    expect(getGuestField(guests[1], 'email')).toBe('bo@example.com')
    expect(lastRow).toBe(1)
    expect(lastCol).toBe(8)
  })

  it('pastes 500 rows in one shot, auto-creating rows without a button', () => {
    const block = Array.from({ length: 500 }, (_, i) => [`First${i}`, `Last${i}`])
    const { guests } = applyPasteToGuests([], 0, 1, block, DEFAULT_GRID_COLUMNS)
    expect(guests).toHaveLength(500)
    expect(getGuestField(guests[0], 'firstName')).toBe('First0')
    expect(getGuestField(guests[499], 'lastName')).toBe('Last499')
  })

  it('pads intervening blank rows when pasting past the current end of the list', () => {
    const { guests } = applyPasteToGuests([], 5, 1, [['Jane', 'Doe']], DEFAULT_GRID_COLUMNS)
    expect(guests).toHaveLength(6)
    expect(getGuestField(guests[5], 'firstName')).toBe('Jane')
    for (let i = 0; i < 5; i++) {
      expect(getGuestField(guests[i], 'firstName')).toBe('')
    }
  })

  it('drops columns that overflow past the last defined grid column', () => {
    const block = [Array.from({ length: DEFAULT_GRID_COLUMNS.length + 3 }, (_, i) => `v${i}`)]
    const { guests, lastCol } = applyPasteToGuests([], 0, 0, block, DEFAULT_GRID_COLUMNS)
    expect(lastCol).toBe(DEFAULT_GRID_COLUMNS.length - 1)
    expect(getGuestField(guests[0], DEFAULT_GRID_COLUMNS[DEFAULT_GRID_COLUMNS.length - 1].field)).toBe(
      `v${DEFAULT_GRID_COLUMNS.length - 1}`
    )
  })

  it('overwrites only the pasted columns, leaving other fields on existing rows untouched', () => {
    const { guests: seeded } = applyPasteToGuests([], 0, 0, [['Mr.', 'Jane', 'Doe']], DEFAULT_GRID_COLUMNS)
    const { guests } = applyPasteToGuests(seeded, 0, 1, [['Jane-Updated']], DEFAULT_GRID_COLUMNS)
    expect(getGuestField(guests[0], 'title')).toBe('Mr.')
    expect(getGuestField(guests[0], 'firstName')).toBe('Jane-Updated')
    expect(getGuestField(guests[0], 'lastName')).toBe('Doe')
  })
})
