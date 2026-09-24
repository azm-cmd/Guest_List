// Characters invalid (or awkward) in filenames across Windows/macOS/Linux.
const UNSAFE_CHARS = /[\\/:*?"<>|]/g
const TRAILING_DOTS_SPACES = /[. ]+$/

/** Turn a user-typed document title into a safe filename base (no extension). */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(TRAILING_DOTS_SPACES, '')
  return cleaned || 'Untitled Guest List'
}
