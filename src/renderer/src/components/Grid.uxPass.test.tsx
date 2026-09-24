import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GridHarness as Harness, guestWith } from './gridTestHarness'
import type { CustomFieldDef } from '@shared/types'

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

function wrapper(): HTMLElement {
  return screen.getByTestId('grid-wrapper')
}

function displayIn(cell: HTMLElement): string {
  return cell.querySelector('.cell-display')?.textContent ?? ''
}

describe('auto-scroll on keyboard navigation', () => {
  it('scrolls the newly selected cell into view on arrow-key moves', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
    render(<Harness />)
    clickCell(0, 1)
    spy.mockClear()
    fireEvent.keyDown(wrapper(), { key: 'ArrowDown' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('custom columns', () => {
  it('renders a custom column header and its cell values', () => {
    const defs: CustomFieldDef[] = [{ id: 'spouse-name', label: 'Spouse Name' }]
    render(
      <Harness
        initialGuests={[guestWith({ firstName: 'Jane', 'custom.spouse-name': 'Alex' })]}
        customFieldDefs={defs}
      />
    )
    expect(screen.getByText('Spouse Name')).toBeTruthy()
    expect(displayIn(cellAt(0, 9))).toBe('Alex') // column 9 = first custom column, after the 9 built-ins
  })

  it('editing a custom column cell commits through the same grid logic', async () => {
    const defs: CustomFieldDef[] = [{ id: 'notes', label: 'Notes' }]
    render(<Harness customFieldDefs={defs} />)
    const cell = clickCell(0, 9)
    fireEvent.keyDown(wrapper(), { key: 'V' })
    const editor = await waitFor(() => cell.querySelector('.cell-editor') as HTMLTextAreaElement)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(displayIn(cell)).toBe('V')
  })
})

describe('double-click column auto-fit', () => {
  it('widens a column to fit its longest value on double-click of the resize handle', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'A'.repeat(60) })]} />)
    const handle = document.querySelectorAll('.col-resize-handle')[1] as HTMLElement // First Name column
    fireEvent.doubleClick(handle)
    const col = document.querySelectorAll('.grid-table colgroup col')[2] as HTMLElement // +1 for row-header col
    const width = parseInt(col.style.width, 10)
    expect(width).toBeGreaterThan(130) // wider than the default First Name width
  })
})

describe('paste auto-fits affected columns (horizontal layout)', () => {
  it('widens a narrow column after pasting a long value into it', () => {
    render(<Harness />)
    clickCell(0, 6) // State column (narrow default)
    fireEvent.paste(wrapper(), { clipboardData: { getData: () => 'A Very Long State Name Value' } })
    const col = document.querySelectorAll('.grid-table colgroup col')[7] as HTMLElement
    const width = parseInt(col.style.width, 10)
    expect(width).toBeGreaterThan(70) // wider than State's default width
  })

  it('still lays pasted multi-column data out horizontally (one row, several columns)', () => {
    // Matches: First Name | Last Name | Address 1 | (Address 2, blank) | City | State | ZIP
    render(<Harness />)
    clickCell(0, 1)
    fireEvent.paste(wrapper(), {
      clipboardData: { getData: () => 'John\tSmith\t123 Main St\t\tBrooklyn\tNY\t11201' }
    })
    expect(displayIn(cellAt(0, 1))).toBe('John')
    expect(displayIn(cellAt(0, 2))).toBe('Smith')
    expect(displayIn(cellAt(0, 3))).toBe('123 Main St')
    expect(displayIn(cellAt(0, 5))).toBe('Brooklyn')
    expect(displayIn(cellAt(0, 6))).toBe('NY')
    expect(displayIn(cellAt(0, 7))).toBe('11201')
    // Definitely not vertical: row 1 (index 1) must still be untouched.
    expect(displayIn(cellAt(1, 1))).toBe('')
  })
})

describe('ghost autocomplete suggestions', () => {
  it('shows a gray suggestion remainder while typing a known prefix', async () => {
    render(
      <Harness
        initialGuests={[
          guestWith({ firstName: 'John' }),
          guestWith({ firstName: 'John' }),
          guestWith({ firstName: 'Jonathan' })
        ]}
      />
    )
    const cell = clickCell(3, 1)
    fireEvent.keyDown(wrapper(), { key: 'J' })
    const editor = await waitFor(() => cell.querySelector('.cell-editor') as HTMLTextAreaElement)
    fireEvent.change(editor, { target: { value: 'Jo' } })
    const ghost = await waitFor(() => cell.querySelector('.cell-ghost-suggestion'))
    expect(ghost?.textContent).toBe('hn') // "John" is more frequent than "Jonathan"
  })

  it('accepting via Tab commits the full suggested value without requiring the user to type it', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = clickCell(1, 1)
    fireEvent.keyDown(wrapper(), { key: 'J' })
    const editor = await waitFor(() => cell.querySelector('.cell-editor') as HTMLTextAreaElement)
    fireEvent.change(editor, { target: { value: 'Jo' } })
    await waitFor(() => expect(cell.querySelector('.cell-ghost-suggestion')).toBeTruthy())
    fireEvent.keyDown(editor, { key: 'Tab' })
    expect(displayIn(cell)).toBe('John')
  })

  it('never silently overwrites what the user typed if there is no accept action', async () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'John' })]} />)
    const cell = clickCell(1, 1)
    fireEvent.keyDown(wrapper(), { key: 'J' })
    const editor = await waitFor(() => cell.querySelector('.cell-editor') as HTMLTextAreaElement)
    fireEvent.change(editor, { target: { value: 'Jo' } })
    await waitFor(() => expect(cell.querySelector('.cell-ghost-suggestion')).toBeTruthy())
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(displayIn(cell)).toBe('Jo') // committed exactly what was typed, not the suggestion
  })
})

describe('right-click context menu', () => {
  it('opens on right-click with Cut/Copy/Paste/Delete, and Delete clears the selection', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'ToDelete' })]} />)
    const cell = cellAt(0, 1)
    fireEvent.contextMenu(cell)
    expect(screen.getByText('Cut')).toBeTruthy()
    expect(screen.getByText('Copy')).toBeTruthy()
    expect(screen.getByText('Paste')).toBeTruthy()
    const deleteItem = screen.getByText('Delete')
    fireEvent.click(deleteItem)
    expect(displayIn(cell)).toBe('')
  })

  it('right-clicking a cell outside the current selection selects it first', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'A' })]} />)
    clickCell(0, 1)
    const other = cellAt(2, 3)
    fireEvent.contextMenu(other)
    expect(other.className).toContain('cell-primary')
  })
})

describe('move cells via drag', () => {
  it('dragging an already-selected cell to a new location moves (not copies) its value', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'MoveMe' })]} />)
    const source = clickCell(0, 1) // select it first
    fireEvent.mouseDown(source) // mousedown again on the now-selected cell arms a potential move
    const dest = cellAt(3, 1)
    fireEvent.mouseEnter(dest)
    fireEvent.mouseUp(dest)
    expect(displayIn(cellAt(0, 1))).toBe('')
    expect(displayIn(cellAt(3, 1))).toBe('MoveMe')
  })

  it('a plain click (mousedown+mouseup, no drag) on an already-selected cell just reselects it', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Stays' })]} />)
    clickCell(0, 1)
    clickCell(0, 1) // second click on the same, already-selected cell -- no drag occurred
    expect(displayIn(cellAt(0, 1))).toBe('Stays')
  })
})
