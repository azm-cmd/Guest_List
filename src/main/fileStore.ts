import { app } from 'electron'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { join, dirname } from 'path'

const RECENT_FILES_PATH = (): string => join(app.getPath('userData'), 'recent-files.json')
const MAX_RECENT = 10

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // Write to a temp file then rename, so a crash mid-write never corrupts the document.
  const tmpPath = `${path}.tmp-${process.pid}`
  await writeFile(tmpPath, contents, 'utf-8')
  await rename(tmpPath, path)
}

export async function getRecentFiles(): Promise<string[]> {
  try {
    const raw = await readFile(RECENT_FILES_PATH(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function addRecentFile(path: string): Promise<string[]> {
  const current = await getRecentFiles()
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT)
  await writeFile(RECENT_FILES_PATH(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}
