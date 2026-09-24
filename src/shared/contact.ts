// Pure name/address computation shared by the export system and Contact View.
//
// The guest model stores Title/First/Last and address fields separately
// (see types.ts). "Full Name" and "Combined Address" are always derived from
// that structured data, never typed in directly -- these functions are the
// single place that derivation happens.

import type { Guest } from './types'

const KNOWN_TITLES = [
  'Mr.',
  'Mrs.',
  'Ms.',
  'Miss',
  'Mx.',
  'Dr.',
  'Prof.',
  'Rev.',
  'Fr.',
  'Sr.',
  'Sir',
  'Dame',
  'Lord',
  'Lady'
]

const TITLE_LOOKUP = new Map(KNOWN_TITLES.map((t) => [t.replace(/\.$/, '').toLowerCase(), t]))

export function computeFullName(guest: Pick<Guest, 'title' | 'firstName' | 'lastName'>): string {
  return [guest.title, guest.firstName, guest.lastName].filter((s) => s.trim()).join(' ')
}

/**
 * Two-line combined address, e.g.:
 *   123 Main St
 *   Brooklyn, NY 11201
 * (Address 2, if present, joins Address 1 on the first line.) Guests missing
 * every address field produce an empty string.
 */
export function computeCombinedAddress(guest: Pick<Guest, 'address'>): string {
  const { address1, address2, city, state, zip } = guest.address
  const line1 = [address1, address2].filter((s) => s.trim()).join(', ')
  const stateZip = [state, zip].filter((s) => s.trim()).join(' ')
  const line2 = [city, stateZip].filter((s) => s.trim()).join(', ')
  return [line1, line2].filter((s) => s.trim()).join('\n')
}

/**
 * The inverse of computeFullName: split a typed "Combined" name back into
 * structured title/firstName/lastName. Best-effort -- a leading token
 * matching a known title (with or without a trailing period) becomes the
 * title; the last remaining token becomes the last name; everything in
 * between becomes the first name.
 */
export function parseFullName(text: string): { title: string; firstName: string; lastName: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { title: '', firstName: '', lastName: '' }

  let title = ''
  let rest = tokens
  const firstTokenKey = tokens[0].replace(/\.$/, '').toLowerCase()
  if (TITLE_LOOKUP.has(firstTokenKey)) {
    title = TITLE_LOOKUP.get(firstTokenKey)!
    rest = tokens.slice(1)
  }

  if (rest.length === 0) return { title, firstName: '', lastName: '' }
  if (rest.length === 1) return { title, firstName: rest[0], lastName: '' }
  return { title, firstName: rest.slice(0, -1).join(' '), lastName: rest[rest.length - 1] }
}
