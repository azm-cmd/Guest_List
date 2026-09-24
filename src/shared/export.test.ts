import { describe, expect, it } from 'vitest'
import { emptyGuest, setGuestField } from './types'
import { buildExportRows, filterGuestsForExport, guestMatchesFilter, hasCompleteAddress, hasEmail, toCsv } from './export'

function guestWith(fields: Record<string, string>): ReturnType<typeof emptyGuest> {
  let g = emptyGuest(crypto.randomUUID())
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

const addressOnlyGuest = guestWith({
  firstName: 'Ann',
  lastName: 'Lee',
  'address.address1': '1 Main St',
  'address.city': 'Springfield',
  'address.state': 'IL',
  'address.zip': '62704'
})

const emailOnlyGuest = guestWith({ firstName: 'Bo', lastName: 'Kim', email: 'bo@example.com' })

const bothGuest = guestWith({
  firstName: 'Cy',
  lastName: 'Ng',
  'address.address1': '2 Oak Ave',
  'address.city': 'Austin',
  'address.state': 'TX',
  'address.zip': '73301',
  email: 'cy@example.com'
})

const neitherGuest = guestWith({ firstName: 'Empty', lastName: 'Row' })

describe('hasCompleteAddress / hasEmail', () => {
  it('requires address1, city, state, and zip', () => {
    expect(hasCompleteAddress(addressOnlyGuest)).toBe(true)
    expect(hasCompleteAddress(guestWith({ 'address.address1': '1 Main St' }))).toBe(false)
    expect(hasCompleteAddress(neitherGuest)).toBe(false)
  })

  it('detects a present email', () => {
    expect(hasEmail(emailOnlyGuest)).toBe(true)
    expect(hasEmail(neitherGuest)).toBe(false)
  })
})

describe('guestMatchesFilter', () => {
  const guests = [addressOnlyGuest, emailOnlyGuest, bothGuest, neitherGuest]

  it('all: everyone', () => {
    expect(guests.every((g) => guestMatchesFilter(g, 'all'))).toBe(true)
  })

  it('anyAddress: guests with a complete address regardless of email', () => {
    expect(filterGuestsForExport(guests, 'anyAddress')).toEqual([addressOnlyGuest, bothGuest])
  })

  it('addressOnly: address present AND no email (the default "Address" export)', () => {
    expect(filterGuestsForExport(guests, 'addressOnly')).toEqual([addressOnlyGuest])
  })

  it('addressAndEmail: both present', () => {
    expect(filterGuestsForExport(guests, 'addressAndEmail')).toEqual([bothGuest])
  })

  it('hasEmail: anyone with an email, including those who also have an address (the default "Email" export)', () => {
    expect(filterGuestsForExport(guests, 'hasEmail')).toEqual([emailOnlyGuest, bothGuest])
  })
})

describe('buildExportRows + toCsv', () => {
  it('maps output columns to arbitrary source fields, including composites', () => {
    const { header, rows } = buildExportRows([bothGuest], 'all', [
      { id: '1', outputLabel: 'Name', source: 'fullName' },
      { id: '2', outputLabel: 'Addr', source: 'fullAddressLine' },
      { id: '3', outputLabel: 'Zip Code', source: 'address.zip' }
    ])
    expect(header).toEqual(['Name', 'Addr', 'Zip Code'])
    expect(rows).toEqual([['Cy Ng', '2 Oak Ave', '73301']])
  })

  it('produces CRLF-terminated, comma-escaped CSV', () => {
    const csv = toCsv(['A', 'B'], [['has, comma', 'plain']])
    expect(csv).toBe('A,B\r\n"has, comma",plain\r\n')
  })
})
