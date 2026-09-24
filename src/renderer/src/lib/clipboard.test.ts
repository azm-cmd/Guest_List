import { describe, expect, it } from 'vitest'
import { parseTsv, toTsv } from './clipboard'

describe('parseTsv', () => {
  it('parses Excel/Sheets-style tab-and-newline clipboard text', () => {
    const grid = parseTsv('Jane\tDoe\tjane@example.com\nBo\tKim\tbo@example.com')
    expect(grid).toEqual([
      ['Jane', 'Doe', 'jane@example.com'],
      ['Bo', 'Kim', 'bo@example.com']
    ])
  })

  it('handles a trailing newline without adding a phantom empty row', () => {
    const grid = parseTsv('A\tB\n1\t2\n')
    expect(grid).toEqual([
      ['A', 'B'],
      ['1', '2']
    ])
  })

  it('handles quoted fields containing tabs or newlines', () => {
    const grid = parseTsv('"123 Main St\nApt 4"\t"Has\ttab"')
    expect(grid).toEqual([['123 Main St\nApt 4', 'Has\ttab']])
  })

  it('handles CRLF row separators', () => {
    const grid = parseTsv('A\tB\r\n1\t2\r\n')
    expect(grid).toEqual([
      ['A', 'B'],
      ['1', '2']
    ])
  })
})

describe('toTsv', () => {
  it('round-trips through parseTsv', () => {
    const original = [
      ['Jane', 'Doe, Jr.'],
      ['multi\nline', 'plain']
    ]
    const tsv = toTsv(original)
    expect(parseTsv(tsv)).toEqual(original)
  })
})
