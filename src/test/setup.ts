import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement scrollIntoView (no real layout engine); stub it so
// components that call it don't throw, and tests can assert on the calls.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {}
}

// jsdom has no canvas backend either (no `canvas` npm package installed);
// our column-width/wrap-estimation helpers already fall back gracefully
// when getContext() returns null, but stub a minimal 2D context so that
// code path runs instead of silently no-op'ing in every test.
HTMLCanvasElement.prototype.getContext = ((): unknown => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 7 })
})) as typeof HTMLCanvasElement.prototype.getContext
