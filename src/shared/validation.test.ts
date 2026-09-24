import { describe, expect, it } from 'vitest'
import { emptyGuest, setGuestField } from './types'
import { computeGuestWarnings, findPossibleDuplicates, isIncompleteAddress, isMalformedEmail } from './validation'

function guestWith(fields: Record<string, string>): ReturnType<typeof emptyGuest> {
  let g = emptyGuest(crypto.randomUUID())
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

describe('isMalformedEmail', () => {
  it('accepts blank (no warning for guests without an email yet)', () => {
    expect(isMalformedEmail('')).toBe(false)
    expect(isMalformedEmail('   ')).toBe(false)
  })
  it('accepts plausible emails', () => {
    expect(isMalformedEmail('jane@example.com')).toBe(false)
    expect(isMalformedEmail('jane.doe+wedding@sub.example.co.uk')).toBe(false)
  })
  it('flags obviously malformed input', () => {
    expect(isMalformedEmail('jane@')).toBe(true)
    expect(isMalformedEmail('jane example.com')).toBe(true)
    expect(isMalformedEmail('not-an-email')).toBe(true)
  })
})

describe('isIncompleteAddress', () => {
  it('does not warn on a totally blank address', () => {
    expect(isIncompleteAddress(guestWith({}))).toBe(false)
  })
  it('does not warn on a complete address', () => {
    expect(
      isIncompleteAddress(
        guestWith({
          'address.address1': '1 Main St',
          'address.city': 'Springfield',
          'address.state': 'IL',
          'address.zip': '62704'
        })
      )
    ).toBe(false)
  })
  it('warns when address1 is present but city/state/zip are missing', () => {
    expect(isIncompleteAddress(guestWith({ 'address.address1': '1 Main St' }))).toBe(true)
  })
})

describe('findPossibleDuplicates', () => {
  it('flags guests sharing a full name', () => {
    const a = guestWith({ firstName: 'Jane', lastName: 'Doe' })
    const b = guestWith({ firstName: 'jane', lastName: ' doe ' })
    const c = guestWith({ firstName: 'Bo', lastName: 'Kim' })
    const dupes = findPossibleDuplicates([a, b, c])
    expect(dupes.has(a.id)).toBe(true)
    expect(dupes.has(b.id)).toBe(true)
    expect(dupes.has(c.id)).toBe(false)
  })

  it('flags guests sharing an email, case-insensitively', () => {
    const a = guestWith({ firstName: 'A', lastName: 'X', email: 'Same@Example.com' })
    const b = guestWith({ firstName: 'B', lastName: 'Y', email: 'same@example.com' })
    const dupes = findPossibleDuplicates([a, b])
    expect(dupes.has(a.id)).toBe(true)
    expect(dupes.has(b.id)).toBe(true)
  })

  it('flags guests sharing a street address + ZIP', () => {
    const a = guestWith({ firstName: 'A', lastName: 'X', 'address.address1': '1 Main St', 'address.zip': '62704' })
    const b = guestWith({ firstName: 'B', lastName: 'Y', 'address.address1': '1 Main St', 'address.zip': '62704' })
    const dupes = findPossibleDuplicates([a, b])
    expect(dupes.has(a.id)).toBe(true)
    expect(dupes.has(b.id)).toBe(true)
  })

  it('does not flag on a partial match alone (e.g. same last name only)', () => {
    const a = guestWith({ firstName: 'Jane', lastName: 'Doe' })
    const b = guestWith({ firstName: 'John', lastName: 'Doe' })
    const dupes = findPossibleDuplicates([a, b])
    expect(dupes.size).toBe(0)
  })
})

describe('computeGuestWarnings', () => {
  it('aggregates all applicable warnings per guest', () => {
    const bad = guestWith({ email: 'not-an-email', 'address.address1': '1 Main St' })
    const warnings = computeGuestWarnings([bad])
    const kinds = warnings.get(bad.id)?.map((w) => w.kind).sort()
    expect(kinds).toEqual(['incomplete-address', 'malformed-email'])
  })

  it('produces no warnings for a clean, complete guest', () => {
    const good = guestWith({
      firstName: 'Jane',
      lastName: 'Doe',
      'address.address1': '1 Main St',
      'address.city': 'Springfield',
      'address.state': 'IL',
      'address.zip': '62704',
      email: 'jane@example.com'
    })
    expect(computeGuestWarnings([good]).size).toBe(0)
  })
})
