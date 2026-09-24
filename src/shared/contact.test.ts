import { describe, expect, it } from 'vitest'
import { emptyGuest, setGuestField } from './types'
import { computeCombinedAddress, computeFullName, parseFullName } from './contact'

function guestWith(fields: Record<string, string>): ReturnType<typeof emptyGuest> {
  let g = emptyGuest(crypto.randomUUID())
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

describe('computeFullName', () => {
  it('joins title, first, and last name', () => {
    const g = guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    expect(computeFullName(g)).toBe('Mr. John Smith')
  })

  it('joins title with an honorific-style value', () => {
    const g = guestWith({ title: 'Dr.', firstName: 'David', lastName: 'Cohen' })
    expect(computeFullName(g)).toBe('Dr. David Cohen')
  })

  it('omits missing parts without leaving stray spaces', () => {
    expect(computeFullName(guestWith({ firstName: 'Jane', lastName: 'Doe' }))).toBe('Jane Doe')
    expect(computeFullName(guestWith({ firstName: 'Jane' }))).toBe('Jane')
    expect(computeFullName(guestWith({}))).toBe('')
  })
})

describe('computeCombinedAddress', () => {
  it('produces a two-line address', () => {
    const g = guestWith({
      'address.address1': '123 Main St',
      'address.city': 'Brooklyn',
      'address.state': 'NY',
      'address.zip': '11201'
    })
    expect(computeCombinedAddress(g)).toBe('123 Main St\nBrooklyn, NY 11201')
  })

  it('folds address2 into the first line when present', () => {
    const g = guestWith({
      'address.address1': '123 Main St',
      'address.address2': 'Apt 4B',
      'address.city': 'Brooklyn',
      'address.state': 'NY',
      'address.zip': '11201'
    })
    expect(computeCombinedAddress(g)).toBe('123 Main St, Apt 4B\nBrooklyn, NY 11201')
  })

  it('returns an empty string for a guest with no address at all', () => {
    expect(computeCombinedAddress(guestWith({}))).toBe('')
  })

  it('handles a partial address gracefully (no stray commas)', () => {
    const g = guestWith({ 'address.city': 'Austin', 'address.state': 'TX' })
    expect(computeCombinedAddress(g)).toBe('Austin, TX')
  })
})

describe('parseFullName', () => {
  it('round-trips a title + first + last name', () => {
    expect(parseFullName('Mr. John Smith')).toEqual({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    expect(parseFullName('Dr. David Cohen')).toEqual({ title: 'Dr.', firstName: 'David', lastName: 'Cohen' })
  })

  it('recognizes a title typed without a trailing period', () => {
    expect(parseFullName('Mrs Jane Smith')).toEqual({ title: 'Mrs.', firstName: 'Jane', lastName: 'Smith' })
  })

  it('handles no title at all', () => {
    expect(parseFullName('Jane Doe')).toEqual({ title: '', firstName: 'Jane', lastName: 'Doe' })
  })

  it('handles a single name with no last name', () => {
    expect(parseFullName('Madonna')).toEqual({ title: '', firstName: 'Madonna', lastName: '' })
  })

  it('handles a multi-word first name', () => {
    expect(parseFullName('Mr. John Michael Smith')).toEqual({
      title: 'Mr.',
      firstName: 'John Michael',
      lastName: 'Smith'
    })
  })

  it('handles empty input', () => {
    expect(parseFullName('')).toEqual({ title: '', firstName: '', lastName: '' })
    expect(parseFullName('   ')).toEqual({ title: '', firstName: '', lastName: '' })
  })

  it('round-trips computeFullName output back to the original structured fields', () => {
    const g = guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    const parsed = parseFullName(computeFullName(g))
    expect(parsed).toEqual({ title: g.title, firstName: g.firstName, lastName: g.lastName })
  })
})
