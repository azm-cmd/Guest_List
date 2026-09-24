import { describe, expect, it } from 'vitest'
import { sanitizeFileName } from './filename'

describe('sanitizeFileName', () => {
  it('leaves a normal title untouched', () => {
    expect(sanitizeFileName('Wedding Guest List')).toBe('Wedding Guest List')
  })

  it('strips filesystem-unsafe characters', () => {
    expect(sanitizeFileName('Smith / Jones: 2026?')).toBe('Smith Jones 2026')
  })

  it('collapses whitespace and trims trailing dots/spaces', () => {
    expect(sanitizeFileName('  My   List...  ')).toBe('My List')
  })

  it('falls back to a default name when the result would be empty', () => {
    expect(sanitizeFileName('///???')).toBe('Untitled Guest List')
    expect(sanitizeFileName('   ')).toBe('Untitled Guest List')
  })
})
