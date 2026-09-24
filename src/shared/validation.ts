import type { Guest } from './types'

// Deliberately permissive: this only flags obviously malformed input, it
// never blocks entry. `foo@bar` is fine; `foo@` or `foo bar` is not.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isMalformedEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  return !EMAIL_RE.test(trimmed)
}

/**
 * An address is "incomplete-looking" if the guest has started filling one in
 * (address1 present) but is missing city, state, or ZIP. A totally blank
 * address is not a warning -- the guest may just not have one on file yet.
 */
export function isIncompleteAddress(guest: Guest): boolean {
  const { address1, city, state, zip } = guest.address
  const started = address1.trim() || city.trim() || state.trim() || zip.trim()
  if (!started) return false
  return !address1.trim() || !city.trim() || !state.trim() || !zip.trim()
}

export interface GuestWarning {
  guestId: string
  kind: 'malformed-email' | 'incomplete-address' | 'possible-duplicate'
  message: string
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase()
}

function normalizeAddressKey(guest: Guest): string | null {
  const a1 = guest.address.address1.trim().toLowerCase()
  const zip = guest.address.zip.trim().toLowerCase()
  if (!a1 || !zip) return null
  return `${a1}|${zip}`
}

/**
 * Conservative duplicate detection: two guests are flagged only when they
 * share a full name, the same email address, or the same street address +
 * ZIP. Partial matches (e.g. same last name only) are intentionally ignored
 * to avoid noisy false positives.
 */
export function findPossibleDuplicates(guests: Guest[]): Set<string> {
  const byName = new Map<string, string[]>()
  const byEmail = new Map<string, string[]>()
  const byAddress = new Map<string, string[]>()

  for (const guest of guests) {
    const first = normalizeName(guest.firstName)
    const last = normalizeName(guest.lastName)
    if (first && last) {
      const key = `${first}|${last}`
      byName.set(key, [...(byName.get(key) ?? []), guest.id])
    }

    const email = normalizeEmail(guest.email)
    if (email) {
      byEmail.set(email, [...(byEmail.get(email) ?? []), guest.id])
    }

    const addrKey = normalizeAddressKey(guest)
    if (addrKey) {
      byAddress.set(addrKey, [...(byAddress.get(addrKey) ?? []), guest.id])
    }
  }

  const duplicates = new Set<string>()
  for (const group of [...byName.values(), ...byEmail.values(), ...byAddress.values()]) {
    if (group.length > 1) {
      for (const id of group) duplicates.add(id)
    }
  }
  return duplicates
}

export function computeGuestWarnings(guests: Guest[]): Map<string, GuestWarning[]> {
  const warnings = new Map<string, GuestWarning[]>()
  const duplicates = findPossibleDuplicates(guests)

  for (const guest of guests) {
    const list: GuestWarning[] = []
    if (isMalformedEmail(guest.email)) {
      list.push({
        guestId: guest.id,
        kind: 'malformed-email',
        message: `"${guest.email}" doesn't look like a valid email address.`
      })
    }
    if (isIncompleteAddress(guest)) {
      list.push({
        guestId: guest.id,
        kind: 'incomplete-address',
        message: 'This address looks incomplete (missing city, state, or ZIP).'
      })
    }
    if (duplicates.has(guest.id)) {
      list.push({
        guestId: guest.id,
        kind: 'possible-duplicate',
        message: 'Possible duplicate: another guest has a matching name, email, or address.'
      })
    }
    if (list.length > 0) warnings.set(guest.id, list)
  }
  return warnings
}
