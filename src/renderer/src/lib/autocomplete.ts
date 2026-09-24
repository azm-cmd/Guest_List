import { getGuestField, type Guest, type GuestFieldPath } from '@shared/types'

/** Count of each distinct, non-blank value seen for a column across all guests. */
export function buildValueFrequency(guests: Guest[], field: GuestFieldPath): Map<string, number> {
  const freq = new Map<string, number>()
  for (const guest of guests) {
    const value = getGuestField(guest, field).trim()
    if (!value) continue
    freq.set(value, (freq.get(value) ?? 0) + 1)
  }
  return freq
}

/**
 * Given what the user has typed so far and a frequency index for the
 * column, return the "ghost" remainder to suggest (the part of the best
 * matching known value that comes after what's already typed), or null if
 * there's no useful suggestion. Prefers the most frequent match; ties break
 * alphabetically for determinism.
 */
export function suggestCompletion(typed: string, freq: Map<string, number>): string | null {
  if (!typed) return null
  const lower = typed.toLowerCase()
  let best: string | null = null
  let bestCount = -1

  for (const [value, count] of freq) {
    if (value.length <= typed.length) continue
    if (!value.toLowerCase().startsWith(lower)) continue
    if (count > bestCount || (count === bestCount && best !== null && value < best)) {
      best = value
      bestCount = count
    }
  }

  return best === null ? null : best.slice(typed.length)
}
