import { describe, expect, it } from 'vitest'
import { emptyGuest, isBlankGuest, setGuestField } from '@shared/types'
import { normalizeSelection, padTo, totalRowCount, trimTrailingBlank } from './gridModel'

describe('padTo', () => {
  it('pads with blank guests up to the requested length', () => {
    const padded = padTo([], 3)
    expect(padded).toHaveLength(3)
    expect(padded.every(isBlankGuest)).toBe(true)
  })
  it('does not truncate when already long enough', () => {
    const g = emptyGuest('1')
    expect(padTo([g], 1)).toHaveLength(1)
  })
})

describe('trimTrailingBlank', () => {
  it('drops fully-blank rows from the end only', () => {
    const filled = setGuestField(emptyGuest('1'), 'firstName', 'Jane')
    const guests = [filled, emptyGuest('2'), emptyGuest('3')]
    const trimmed = trimTrailingBlank(guests)
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0].firstName).toBe('Jane')
  })
  it('keeps a blank row sandwiched between filled rows', () => {
    const a = setGuestField(emptyGuest('1'), 'firstName', 'Jane')
    const b = emptyGuest('2')
    const c = setGuestField(emptyGuest('3'), 'firstName', 'Bo')
    expect(trimTrailingBlank([a, b, c])).toHaveLength(3)
  })
})

describe('totalRowCount', () => {
  it('shows an initial buffer of empty rows when the list is empty', () => {
    expect(totalRowCount(0)).toBe(15)
  })
  it('always keeps a trailing buffer past the last real guest', () => {
    expect(totalRowCount(1)).toBe(16)
    expect(totalRowCount(100)).toBe(115)
  })
})

describe('normalizeSelection', () => {
  it('orders a reversed drag-select into a proper rectangle', () => {
    const range = normalizeSelection({ anchor: { row: 5, col: 3 }, focus: { row: 1, col: 0 } })
    expect(range).toEqual({ rowStart: 1, rowEnd: 5, colStart: 0, colEnd: 3 })
  })
})
