import { describe, expect, it } from 'vitest'
import { DEFAULT_GRID_COLUMNS, getGuestField, setGuestField, emptyGuest, type Guest } from '@shared/types'
import { applyMoveToGuests, computeMoveDestinationTopLeft, rangeHasDataOutside } from './gridModel'

function seedGuests(rows: Array<Record<string, string>>): Guest[] {
  return rows.map((fields, i) => {
    let g = emptyGuest(`g${i}`)
    for (const [k, v] of Object.entries(fields)) g = setGuestField(g, k as never, v)
    return g
  })
}

describe('computeMoveDestinationTopLeft', () => {
  it('preserves the grab offset within the source range', () => {
    // Source is rows 2-3, cols 1-2. User grabbed the bottom-right cell (3,2)
    // and is hovering over (5,4) -- destination top-left should be (4,3).
    const dest = computeMoveDestinationTopLeft(
      { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
      { row: 3, col: 2 },
      { row: 5, col: 4 },
      DEFAULT_GRID_COLUMNS.length
    )
    expect(dest).toEqual({ row: 4, col: 3 })
  })

  it('clamps row to >= 0 and keeps columns within the grid', () => {
    const dest = computeMoveDestinationTopLeft(
      { rowStart: 5, rowEnd: 6, colStart: 0, colEnd: 1 },
      { row: 5, col: 0 },
      { row: 0, col: 0 },
      3
    )
    expect(dest.row).toBe(0)
    expect(dest.col).toBeGreaterThanOrEqual(0)
  })
})

describe('applyMoveToGuests', () => {
  it('moves a single cell, clearing the source', () => {
    const guests = seedGuests([{ firstName: 'Jane' }, {}])
    const { guests: next } = applyMoveToGuests(
      guests,
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
      { row: 1, col: 1 },
      DEFAULT_GRID_COLUMNS
    )
    expect(getGuestField(next[0], 'firstName')).toBe('')
    expect(getGuestField(next[1], 'firstName')).toBe('Jane')
  })

  it('moves a multi-cell range preserving relative positions', () => {
    const guests = seedGuests([
      { firstName: 'Jane', lastName: 'Doe' },
      { firstName: 'Bo', lastName: 'Kim' }
    ])
    const { guests: next } = applyMoveToGuests(
      guests,
      { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 2 },
      { row: 2, col: 1 },
      DEFAULT_GRID_COLUMNS
    )
    expect(getGuestField(next[0], 'firstName')).toBe('')
    expect(getGuestField(next[1], 'firstName')).toBe('')
    expect(getGuestField(next[2], 'firstName')).toBe('Jane')
    expect(getGuestField(next[2], 'lastName')).toBe('Doe')
    expect(getGuestField(next[3], 'firstName')).toBe('Bo')
    expect(getGuestField(next[3], 'lastName')).toBe('Kim')
  })

  it('creates rows as needed when the destination is past the current end', () => {
    const guests = seedGuests([{ firstName: 'Jane' }])
    const { guests: next } = applyMoveToGuests(
      guests,
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
      { row: 10, col: 1 },
      DEFAULT_GRID_COLUMNS
    )
    expect(next.length).toBeGreaterThanOrEqual(11)
    expect(getGuestField(next[10], 'firstName')).toBe('Jane')
  })

  it('an overlapping source/destination range keeps the correct final values (no data loss)', () => {
    // Move column 1 (firstName) one row down, overlapping row 1.
    const guests = seedGuests([{ firstName: 'A' }, { firstName: 'B' }, { firstName: 'C' }])
    const { guests: next } = applyMoveToGuests(
      guests,
      { rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 1 },
      { row: 1, col: 1 },
      DEFAULT_GRID_COLUMNS
    )
    expect(getGuestField(next[0], 'firstName')).toBe('') // only-source, now blank
    expect(getGuestField(next[1], 'firstName')).toBe('A') // overlap cell gets moved value
    expect(getGuestField(next[2], 'firstName')).toBe('B') // shifted down correctly
  })

  it('does not touch cells outside the source and destination ranges', () => {
    const guests = seedGuests([{ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }])
    const { guests: next } = applyMoveToGuests(
      guests,
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
      { row: 0, col: 2 },
      DEFAULT_GRID_COLUMNS
    )
    expect(getGuestField(next[0], 'email')).toBe('jane@example.com')
  })
})

describe('rangeHasDataOutside', () => {
  it('detects existing data in the destination that is not part of the source', () => {
    const guests = seedGuests([{ firstName: 'Jane' }, { lastName: 'Existing' }])
    const hasData = rangeHasDataOutside(
      guests,
      { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 2 },
      { rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 },
      DEFAULT_GRID_COLUMNS
    )
    expect(hasData).toBe(true)
  })

  it('returns false for an all-blank destination', () => {
    const guests = seedGuests([{ firstName: 'Jane' }])
    const hasData = rangeHasDataOutside(
      guests,
      { rowStart: 3, rowEnd: 4, colStart: 0, colEnd: 1 },
      { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      DEFAULT_GRID_COLUMNS
    )
    expect(hasData).toBe(false)
  })
})
