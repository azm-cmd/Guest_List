/**
 * Deterministic, DOM-independent line-wrapping simulation used to decide
 * whether an ArrowUp/ArrowDown press inside a cell editor should move the
 * caret within the text or hand off to the neighboring row.
 *
 * We deliberately do NOT rely on real browser layout (e.g. measuring a
 * hidden mirror element's pixel position) for this decision: it can't be
 * exercised deterministically in tests, and the textarea's `columns`
 * estimate only needs to be "close enough" to match the actual rendered
 * wrap for a reasonable UX -- a slightly early/late handoff is a minor
 * rough edge, not a correctness bug, for short guest-list field values.
 *
 * Explicit '\n' characters always start a new paragraph; within a
 * paragraph, words are greedily packed into lines of at most `columns`
 * characters (matching `white-space: pre-wrap` + `word-break: break-word`),
 * with a hard character-level break for any single word longer than
 * `columns`.
 */
export interface WrappedText {
  lines: string[]
  /** Index into the original string where each line begins. */
  lineStarts: number[]
}

export function wrapText(value: string, columns: number): WrappedText {
  const cols = Math.max(1, Math.floor(columns))
  const lines: string[] = []
  const lineStarts: number[] = []

  let paragraphStart = 0
  const paragraphs = value.split('\n')

  paragraphs.forEach((paragraph, pIndex) => {
    if (paragraph.length === 0) {
      lines.push('')
      lineStarts.push(paragraphStart)
    } else {
      let cursor = 0
      while (cursor < paragraph.length) {
        let end = Math.min(cursor + cols, paragraph.length)
        if (end < paragraph.length) {
          const breakAt = paragraph.lastIndexOf(' ', end)
          if (breakAt > cursor) {
            end = breakAt + 1
          }
          // else: no whitespace to break on -- hard-break at `cols` (word-break: break-word)
        }
        lines.push(paragraph.slice(cursor, end))
        lineStarts.push(paragraphStart + cursor)
        cursor = end
      }
    }
    // +1 to skip the '\n' that separated this paragraph from the next.
    paragraphStart += paragraph.length + 1
    void pIndex
  })

  if (lines.length === 0) {
    lines.push('')
    lineStarts.push(0)
  }

  return { lines, lineStarts }
}

/** Which visual line (0-indexed) a caret offset falls on. */
export function lineIndexForCaret(lineStarts: number[], caretIndex: number): number {
  let index = 0
  for (let i = 0; i < lineStarts.length; i++) {
    if (lineStarts[i] <= caretIndex) index = i
    else break
  }
  return index
}

export function isCaretOnFirstVisualLine(value: string, caretIndex: number, columns: number): boolean {
  const { lineStarts } = wrapText(value, columns)
  return lineIndexForCaret(lineStarts, caretIndex) === 0
}

export function isCaretOnLastVisualLine(value: string, caretIndex: number, columns: number): boolean {
  const { lines, lineStarts } = wrapText(value, columns)
  return lineIndexForCaret(lineStarts, caretIndex) === lines.length - 1
}

let measureCanvas: HTMLCanvasElement | null = null

/**
 * Estimate how many characters fit per line for a textarea, given its
 * rendered width and font. Used only to feed `columns` above from real DOM
 * state; falls back to a large number (effectively "never wraps, exit on
 * first press") if measurement isn't possible (e.g. no canvas support).
 */
export function estimateColumnsForTextarea(el: HTMLTextAreaElement): number {
  try {
    const style = window.getComputedStyle(el)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const availableWidth = el.clientWidth - paddingLeft - paddingRight
    if (availableWidth <= 0) return 999

    measureCanvas ??= document.createElement('canvas')
    const ctx = measureCanvas.getContext('2d')
    if (!ctx) return 999
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const sample = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const avgCharWidth = ctx.measureText(sample).width / sample.length
    if (!avgCharWidth) return 999
    return Math.max(1, Math.floor(availableWidth / avgCharWidth))
  } catch {
    return 999
  }
}
