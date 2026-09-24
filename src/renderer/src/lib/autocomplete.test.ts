import { describe, expect, it } from 'vitest'
import { emptyGuest, setGuestField, type Guest } from '@shared/types'
import { buildValueFrequency, suggestCompletion } from './autocomplete'

function guestsWithFirstNames(names: string[]): Guest[] {
  return names.map((n, i) => setGuestField(emptyGuest(`g${i}`), 'firstName', n))
}

describe('buildValueFrequency', () => {
  it('counts distinct non-blank values', () => {
    const guests = guestsWithFirstNames(['John', 'John', 'Jonathan', ''])
    const freq = buildValueFrequency(guests, 'firstName')
    expect(freq.get('John')).toBe(2)
    expect(freq.get('Jonathan')).toBe(1)
    expect(freq.has('')).toBe(false)
  })
})

describe('suggestCompletion', () => {
  it('suggests the remainder of the most frequent matching value', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['John', 'John', 'Jonathan', 'Joseph']), 'firstName')
    expect(suggestCompletion('Jo', freq)).toBe('hn') // "John" (freq 2) beats "Jonathan"/"Joseph" (freq 1)
  })

  it('is case-insensitive when matching but returns the remainder of the stored casing', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['John']), 'firstName')
    expect(suggestCompletion('jo', freq)).toBe('hn')
  })

  it('returns null when nothing typed', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['John']), 'firstName')
    expect(suggestCompletion('', freq)).toBeNull()
  })

  it('returns null when there is no matching value', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['John']), 'firstName')
    expect(suggestCompletion('Xy', freq)).toBeNull()
  })

  it('returns null once the typed text already equals a known value (nothing left to suggest)', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['John']), 'firstName')
    expect(suggestCompletion('John', freq)).toBeNull()
  })

  it('breaks ties alphabetically for determinism', () => {
    const freq = buildValueFrequency(guestsWithFirstNames(['Anna', 'Annie']), 'firstName')
    expect(suggestCompletion('Ann', freq)).toBe('a') // "Anna" < "Annie"
  })
})
