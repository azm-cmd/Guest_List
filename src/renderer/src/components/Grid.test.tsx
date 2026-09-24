import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import Grid from './Grid'
import { emptyGuest, setGuestField, type CustomFieldDef, type Guest } from '@shared/types'

function guestWith(fields: Record<string, string>): Guest {
  let g = emptyGuest(crypto.randomUUID())
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

function Harness({
  initialGuests = [],
  customFieldDefs = []
}: {
  initialGuests?: Guest[]
  customFieldDefs?: CustomFieldDef[]
}): JSX.Element {
  const [guests, setGuests] = useState<Guest[]>(initialGuests)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  return (
    <Grid
      guests={guests}
      columnWidths={columnWidths}
      customFieldDefs={customFieldDefs}
      searchQuery=""
      onUpdateGuests={(updater) => setGuests((prev) => updater(prev))}
      onColumnWidthChange={(id, w) => setColumnWidths((prev) => ({ ...prev, [id]: w }))}
      onUndo={() => {}}
      onRedo={() => {}}
    />
  )
}

// Grid columns (see DEFAULT_GRID_COLUMNS): 0=Title 1=FirstName 2=LastName
// 3=Address1 4=Address2 5=City 6=State 7=Zip 8=Email

function cellAt(row: number, col: number): HTMLElement {
  const el = document.querySelector(`[data-row="${row}"][data-col="${col}"]`)
  if (!el) throw new Error(`cell (${row},${col}) not found`)
  return el as HTMLElement
}

function clickCell(row: number, col: number): HTMLElement {
  const cell = cellAt(row, col)
  fireEvent.mouseDown(cell)
  fireEvent.mouseUp(cell)
  return cell
}

function editorIn(cell: HTMLElement): HTMLTextAreaElement | null {
  return cell.querySelector('.cell-editor')
}

function displayIn(cell: HTMLElement): string {
  return cell.querySelector('.cell-display')?.textContent ?? ''
}

function wrapper(): HTMLElement {
  return screen.getByTestId('grid-wrapper')
}

describe('selection vs. editing', () => {
  it('clicking a cell selects it without entering edit mode', () => {
    render(<Harness />)
    const cell = clickCell(0, 1)
    expect(cell.className).toContain('cell-primary')
    expect(editorIn(cell)).toBeNull()
    expect(document.activeElement).toBe(wrapper())
  })

  it('typing into a selected empty cell immediately starts editing with the typed character', async () => {
    render(<Harness />)
    const cell = clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'J' })
    await waitFor(() => expect(editorIn(cell)).toBeTruthy())
    expect(editorIn(cell)!.value).toBe('J')
  })

  it('typing into a selected populated cell starts a fresh value instead of appending', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Existing' })]} />)
    const cell = clickCell(0, 1)
    expect(displayIn(cell)).toBe('Existing')
    fireEvent.keyDown(wrapper(), { key: 'X' })
    await waitFor(() => expect(editorIn(cell)).toBeTruthy())
    expect(editorIn(cell)!.value).toBe('X')
  })

  it('double-click enters editing with the existing value intact', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    await waitFor(() => expect(editorIn(cell)).toBeTruthy())
    expect(editorIn(cell)!.value).toBe('John')
  })

  it('F2 enters editing on the selected cell', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'F2' })
    await waitFor(() => expect(editorIn(cell)).toBeTruthy())
    expect(editorIn(cell)!.value).toBe('John')
  })

  it('Escape cancels editing and restores the previous value', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    fireEvent.change(editor, { target: { value: 'Changed' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(editorIn(cell)).toBeNull()
    expect(displayIn(cell)).toBe('John')
  })

  it('Enter commits the edit and moves selection down', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    fireEvent.change(editor, { target: { value: 'Updated' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(editorIn(cell)).toBeNull()
    expect(displayIn(cell)).toBe('Updated')
    expect(cellAt(1, 1).className).toContain('cell-primary')
  })
})

describe('keyboard navigation while NOT editing', () => {
  it('arrow keys move the selection between cells', () => {
    render(<Harness />)
    clickCell(2, 2)
    fireEvent.keyDown(wrapper(), { key: 'ArrowRight' })
    expect(cellAt(2, 3).className).toContain('cell-primary')
    fireEvent.keyDown(wrapper(), { key: 'ArrowDown' })
    expect(cellAt(3, 3).className).toContain('cell-primary')
    fireEvent.keyDown(wrapper(), { key: 'ArrowLeft' })
    expect(cellAt(3, 2).className).toContain('cell-primary')
    fireEvent.keyDown(wrapper(), { key: 'ArrowUp' })
    expect(cellAt(2, 2).className).toContain('cell-primary')
  })

  it('does not move a text cursor -- no editor is ever mounted by arrow keys', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'ArrowRight' })
    expect(editorIn(cell)).toBeNull()
  })

  it('Tab and Shift+Tab navigate horizontally', () => {
    render(<Harness />)
    clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'Tab' })
    expect(cellAt(0, 2).className).toContain('cell-primary')
    fireEvent.keyDown(wrapper(), { key: 'Tab', shiftKey: true })
    expect(cellAt(0, 1).className).toContain('cell-primary')
  })

  it('Delete clears a selected cell without entering edit mode', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'ToClear' })]} />)
    const cell = clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'Delete' })
    expect(editorIn(cell)).toBeNull()
    expect(displayIn(cell)).toBe('')
  })

  it('Backspace also clears a selected cell', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'ToClear' })]} />)
    const cell = clickCell(0, 1)
    fireEvent.keyDown(wrapper(), { key: 'Backspace' })
    expect(displayIn(cell)).toBe('')
  })
})

describe('keyboard navigation WHILE editing', () => {
  it('Left/Right move the text cursor within the value, not between cells', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    editor.setSelectionRange(2, 2) // caret between "Jo" and "hn"
    fireEvent.keyDown(editor, { key: 'ArrowLeft' })
    // Not at the true start -> stays in this cell, still editing.
    expect(editorIn(cell)).toBeTruthy()
    expect(cellAt(0, 1).className).toContain('cell-primary')
  })

  it('Left at the very beginning of the text commits and moves to the cell on the left', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    editor.setSelectionRange(0, 0)
    fireEvent.keyDown(editor, { key: 'ArrowLeft' })
    expect(editorIn(cell)).toBeNull()
    expect(cellAt(0, 0).className).toContain('cell-primary')
  })

  it('Right at the very end of the text commits and moves to the cell on the right', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    editor.setSelectionRange(4, 4) // end of "John"
    fireEvent.keyDown(editor, { key: 'ArrowRight' })
    expect(editorIn(cell)).toBeNull()
    expect(cellAt(0, 2).className).toContain('cell-primary')
  })

  it('Right before the end of the text stays within the cell', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    editor.setSelectionRange(2, 2)
    fireEvent.keyDown(editor, { key: 'ArrowRight' })
    expect(editorIn(cell)).toBeTruthy()
  })

  const multiline = 'Line1\nLine2\nLine3'

  it('Up/Down move within multiline text when not at the boundary line', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: multiline })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    const middleIndex = multiline.indexOf('Line2') + 2 // inside the middle line
    editor.setSelectionRange(middleIndex, middleIndex)
    fireEvent.keyDown(editor, { key: 'ArrowUp' })
    expect(editorIn(cell)).toBeTruthy() // still editing -- moved within text
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    expect(editorIn(cell)).toBeTruthy()
  })

  it('Up at the actual top boundary commits and moves to the cell above', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: multiline })]} />)
    const cell = cellAt(1, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    const topIndex = 2 // inside "Line1", the first visual line
    editor.setSelectionRange(topIndex, topIndex)
    fireEvent.keyDown(editor, { key: 'ArrowUp' })
    expect(editorIn(cell)).toBeNull()
    expect(cellAt(0, 1).className).toContain('cell-primary')
  })

  it('Down at the actual bottom boundary commits and moves to the cell below', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: multiline })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    const editor = await waitFor(() => editorIn(cell)!)
    const bottomIndex = multiline.length - 2 // inside "Line3", the last visual line
    editor.setSelectionRange(bottomIndex, bottomIndex)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    expect(editorIn(cell)).toBeNull()
    expect(cellAt(1, 1).className).toContain('cell-primary')
  })

  it('Tab commits and moves right; Shift+Tab commits and moves left', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.doubleClick(cell)
    let editor = await waitFor(() => editorIn(cell)!)
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(editorIn(cell)).toBeNull()
    expect(cellAt(0, 2).className).toContain('cell-primary')

    const cell2 = cellAt(0, 2)
    fireEvent.doubleClick(cell2)
    editor = await waitFor(() => editorIn(cell2)!)
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })
    expect(cellAt(0, 1).className).toContain('cell-primary')
  })
})

describe('paste', () => {
  function paste(target: HTMLElement, text: string): void {
    fireEvent.paste(target, {
      clipboardData: { getData: () => text }
    })
  }

  it('pastes a multi-row, multi-column block starting at the selected cell, without entering edit mode', () => {
    render(<Harness />)
    clickCell(0, 1) // First Name
    const tsv = 'John\tSmith\nJane\tSmith'
    paste(wrapper(), tsv)

    expect(displayIn(cellAt(0, 1))).toBe('John')
    expect(displayIn(cellAt(0, 2))).toBe('Smith')
    expect(displayIn(cellAt(1, 1))).toBe('Jane')
    expect(displayIn(cellAt(1, 2))).toBe('Smith')
    expect(editorIn(cellAt(0, 1))).toBeNull()
  })

  it('creates rows as needed when pasting past the current end of the list', () => {
    render(<Harness />)
    clickCell(10, 1)
    paste(wrapper(), 'A\tB\nC\tD\nE\tF')
    expect(displayIn(cellAt(10, 1))).toBe('A')
    expect(displayIn(cellAt(12, 1))).toBe('E')
    // rows before the paste stay blank, not touched
    expect(displayIn(cellAt(0, 1))).toBe('')
  })

  it('handles a large paste (500 rows)', () => {
    render(<Harness />)
    clickCell(0, 1)
    const rows = Array.from({ length: 500 }, (_, i) => `First${i}\tLast${i}`)
    paste(wrapper(), rows.join('\n'))
    expect(displayIn(cellAt(0, 1))).toBe('First0')
    expect(displayIn(cellAt(499, 1))).toBe('First499')
    expect(displayIn(cellAt(499, 2))).toBe('Last499')
  })

  it('does not overwrite cells outside the pasted range', () => {
    render(
      <Harness
        initialGuests={[guestWith({ firstName: 'Keep', lastName: 'KeepToo', email: 'keep@example.com' })]}
      />
    )
    clickCell(0, 1) // First Name only
    paste(wrapper(), 'Pasted')
    expect(displayIn(cellAt(0, 1))).toBe('Pasted')
    expect(displayIn(cellAt(0, 2))).toBe('KeepToo')
    expect(displayIn(cellAt(0, 8))).toBe('keep@example.com')
  })
})
