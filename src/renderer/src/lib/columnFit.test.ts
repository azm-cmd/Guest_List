import { describe, expect, it } from 'vitest'
import { computeAutoColumnWidth, MAX_AUTO_FIT_WIDTH, MIN_COLUMN_WIDTH } from './columnFit'

const charWidth = 7
const measure = (text: string): number => text.length * charWidth

describe('computeAutoColumnWidth', () => {
  it('fits to the widest of the header and the values', () => {
    const width = computeAutoColumnWidth('ZIP', ['62704', '9', ''], measure, { paddingPx: 20, minWidth: 0 })
    expect(width).toBe('62704'.length * charWidth + 20)
  })

  it('uses the header width when it is wider than every value', () => {
    const width = computeAutoColumnWidth('A Fairly Long Header', ['x'], measure, { paddingPx: 0 })
    expect(width).toBe('A Fairly Long Header'.length * charWidth)
  })

  it('never returns less than the minimum width', () => {
    const width = computeAutoColumnWidth('', [''], measure)
    expect(width).toBe(MIN_COLUMN_WIDTH)
  })

  it('caps at the maximum auto-fit width for a very long value', () => {
    const width = computeAutoColumnWidth('Address 1', ['A'.repeat(500)], measure)
    expect(width).toBe(MAX_AUTO_FIT_WIDTH)
  })

  it('only measures the longest visual line of a multiline value', () => {
    const width = computeAutoColumnWidth('Notes', ['short\na much longer second line here'], measure, {
      paddingPx: 0
    })
    expect(width).toBe('a much longer second line here'.length * charWidth)
  })
})
