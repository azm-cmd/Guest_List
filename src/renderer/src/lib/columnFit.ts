export const MIN_COLUMN_WIDTH = 60
export const MAX_AUTO_FIT_WIDTH = 420
// Matches .cell-display / .col-header CSS padding (7-8px each side) plus a
// small buffer so text doesn't sit flush against the cell border.
const CONTENT_PADDING_PX = 28

/**
 * Pick a column width that fits its content, given a `measure` function that
 * returns a text's rendered pixel width. Pure and DOM-independent so it can
 * be unit tested with a fake measurer; the real app supplies canvas-based
 * measurement (see `measureTextWidthPx`/`autoFitColumnWidth` below).
 */
export function computeAutoColumnWidth(
  label: string,
  values: string[],
  measure: (text: string) => number,
  opts: { minWidth?: number; maxWidth?: number; paddingPx?: number } = {}
): number {
  const minWidth = opts.minWidth ?? MIN_COLUMN_WIDTH
  const maxWidth = opts.maxWidth ?? MAX_AUTO_FIT_WIDTH
  const paddingPx = opts.paddingPx ?? CONTENT_PADDING_PX

  let widest = measure(label)
  for (const value of values) {
    // Auto-fit is about single-line readability; only the longest visual
    // line of a wrapped/multiline value should drive the width.
    for (const line of value.split('\n')) {
      const w = measure(line)
      if (w > widest) widest = w
    }
  }
  return Math.max(minWidth, Math.min(maxWidth, Math.ceil(widest) + paddingPx))
}

let measureCanvas: HTMLCanvasElement | null = null

export function measureTextWidthPx(text: string, font: string): number {
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * 7 // rough fallback if canvas is unavailable
  ctx.font = font
  return ctx.measureText(text).width
}

function fontForElement(el: HTMLElement): string {
  const style = window.getComputedStyle(el)
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
}

/** Real, DOM-measured auto-fit width for a column, given a reference element to read font metrics from. */
export function autoFitColumnWidth(label: string, values: string[], referenceEl: HTMLElement): number {
  const font = fontForElement(referenceEl)
  return computeAutoColumnWidth(label, values, (text) => measureTextWidthPx(text, font))
}
