import { describe, expect, it } from 'vitest'
import { isCaretOnFirstVisualLine, isCaretOnLastVisualLine, lineIndexForCaret, wrapText } from './textWrap'

describe('wrapText', () => {
  it('keeps short text on a single line', () => {
    const { lines } = wrapText('John', 20)
    expect(lines).toEqual(['John'])
  })

  it('wraps on word boundaries when text exceeds the column width', () => {
    const { lines } = wrapText('123 Main Street Apartment 4B', 10)
    // Every wrapped line should be a clean word-boundary break.
    expect(lines.join('')).toBe('123 Main Street Apartment 4B')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines.slice(0, -1)) {
      expect(line.length).toBeLessThanOrEqual(10)
    }
  })

  it('hard-breaks a single word longer than the column width', () => {
    const { lines } = wrapText('Supercalifragilisticexpialidocious', 10)
    expect(lines.every((l) => l.length <= 10)).toBe(true)
    expect(lines.join('')).toBe('Supercalifragilisticexpialidocious')
  })

  it('honors explicit newlines as paragraph breaks', () => {
    const { lines } = wrapText('123 Main St\nApt 4', 40)
    expect(lines).toEqual(['123 Main St', 'Apt 4'])
  })
})

describe('lineIndexForCaret', () => {
  it('finds the correct line for a caret offset', () => {
    const { lineStarts } = wrapText('123 Main St\nApt 4', 40)
    expect(lineIndexForCaret(lineStarts, 0)).toBe(0)
    expect(lineIndexForCaret(lineStarts, 5)).toBe(0)
    expect(lineIndexForCaret(lineStarts, 12)).toBe(1) // right after the \n, start of "Apt 4"
    expect(lineIndexForCaret(lineStarts, 17)).toBe(1) // end of "Apt 4"
  })
})

describe('isCaretOnFirstVisualLine / isCaretOnLastVisualLine', () => {
  it('a single-line cell is both first and last line everywhere', () => {
    expect(isCaretOnFirstVisualLine('John', 0, 40)).toBe(true)
    expect(isCaretOnFirstVisualLine('John', 4, 40)).toBe(true)
    expect(isCaretOnLastVisualLine('John', 0, 40)).toBe(true)
    expect(isCaretOnLastVisualLine('John', 4, 40)).toBe(true)
  })

  it('multiline text: only the actual top/bottom line counts as the boundary', () => {
    const value = '123 Main St\nApt 4\nBrooklyn, NY'
    // Caret in the first line -> at top boundary, NOT at bottom.
    expect(isCaretOnFirstVisualLine(value, 3, 40)).toBe(true)
    expect(isCaretOnLastVisualLine(value, 3, 40)).toBe(false)

    // Caret in the middle line -> neither boundary.
    const middleIndex = value.indexOf('Apt 4') + 2
    expect(isCaretOnFirstVisualLine(value, middleIndex, 40)).toBe(false)
    expect(isCaretOnLastVisualLine(value, middleIndex, 40)).toBe(false)

    // Caret in the last line -> at bottom boundary, NOT at top.
    const lastIndex = value.length - 2
    expect(isCaretOnFirstVisualLine(value, lastIndex, 40)).toBe(false)
    expect(isCaretOnLastVisualLine(value, lastIndex, 40)).toBe(true)
  })

  it('does NOT treat a middle character offset as a boundary just because it is 0 or length (the naive bug this guards against)', () => {
    // "AAAA BBBB CCCC" wrapped at columns=5 -> 3 soft-wrapped visual lines,
    // even though there is no literal '\n' in the string at all.
    const value = 'AAAA BBBB CCCC'
    const { lines } = wrapText(value, 5)
    expect(lines.length).toBe(3)

    // Caret at the START of the middle visual line is index 5 (not 0, not length) --
    // a naive `caretIndex === 0` check would wrongly call this "top".
    const middleLineStartIndex = 5
    expect(isCaretOnFirstVisualLine(value, middleLineStartIndex, 5)).toBe(false)
    expect(isCaretOnLastVisualLine(value, middleLineStartIndex, 5)).toBe(false)
  })
})
