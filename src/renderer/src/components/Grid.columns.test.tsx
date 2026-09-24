import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GridHarness as Harness, guestWith } from './gridTestHarness'
import type { CustomFieldDef } from '@shared/types'

function headerFor(label: string): HTMLElement {
  return screen.getByText(label).closest('th') as HTMLElement
}

function cellAt(row: number, col: number): HTMLElement {
  const el = document.querySelector(`[data-row="${row}"][data-col="${col}"]`)
  if (!el) throw new Error(`cell (${row},${col}) not found`)
  return el as HTMLElement
}

function displayIn(cell: HTMLElement): string {
  return cell.querySelector('.cell-display')?.textContent ?? ''
}

function clickHeader(label: string): HTMLElement {
  const th = headerFor(label)
  fireEvent.mouseDown(th)
  fireEvent.mouseUp(th)
  return th
}

describe('column selection', () => {
  it('left-clicking a column header selects the whole column', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'A' }), guestWith({ firstName: 'B' })]} />)
    clickHeader('First Name')
    expect(cellAt(0, 1).className).toContain('cell-selected')
    expect(cellAt(1, 1).className).toContain('cell-selected')
    // A different column is untouched.
    expect(cellAt(0, 2).className).not.toContain('cell-selected')
  })

  it('a normal click never deletes anything', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Keep' })]} />)
    clickHeader('First Name')
    expect(displayIn(cellAt(0, 1))).toBe('Keep')
    expect(screen.queryByText('Delete Column')).toBeNull() // menu isn't open from a plain click
  })
})

describe('column action menu', () => {
  it('the menu button opens a menu with Delete Column', () => {
    render(<Harness />)
    const menuButton = headerFor('First Name').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(menuButton)
    expect(screen.getByText('Delete Column')).toBeTruthy()
  })

  it('deleting a built-in column hides it (non-destructive) rather than deleting data', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness initialGuests={[guestWith({ firstName: 'Safe' })]} />)
    const menuButton = headerFor('First Name').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(menuButton)
    fireEvent.click(screen.getByText('Delete Column'))

    expect(window.confirm).toHaveBeenCalled()
    // The confirm message should make clear this is non-destructive.
    expect((window.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/kept/i)
    expect(screen.queryByText('First Name')).toBeNull()
    // The column is gone from the grid, but the underlying guest data was never touched.
  })

  it('declining the confirmation keeps a built-in column visible', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Harness initialGuests={[guestWith({ firstName: 'Safe' })]} />)
    const menuButton = headerFor('First Name').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(menuButton)
    fireEvent.click(screen.getByText('Delete Column'))

    expect(screen.getByText('First Name')).toBeTruthy()
    expect(displayIn(cellAt(0, 1))).toBe('Safe')
  })
})

describe('"+ Add Column": restoring hidden built-ins and creating custom fields', () => {
  it('lists hidden built-in columns to restore, and restoring brings the column (and its data) back', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane', title: 'Ms.' })]} />)

    // Hide "Title" via its column menu.
    const titleMenuButton = headerFor('Title').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(titleMenuButton)
    fireEvent.click(screen.getByText('Delete Column'))
    expect(screen.queryByText('Title')).toBeNull()

    // Restore it from "+ Add Column".
    const addButton = screen.getByLabelText('Add column')
    fireEvent.click(addButton)
    fireEvent.click(screen.getByText('Show "Title"'))

    expect(screen.getByText('Title')).toBeTruthy()
    expect(displayIn(cellAt(0, 0))).toBe('Ms.') // the data survived being hidden
  })

  it('creates a new custom field from the grid via "+ New Custom Field"', () => {
    render(<Harness />)
    const addButton = screen.getByLabelText('Add column')
    fireEvent.click(addButton)
    fireEvent.click(screen.getByText('+ New Custom Field'))

    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'Dietary Restrictions' } })
    fireEvent.click(screen.getByText('Create'))

    expect(screen.getByText('Dietary Restrictions')).toBeTruthy()
  })
})

describe('deleting a custom column', () => {
  const defs: CustomFieldDef[] = [{ id: 'notes', label: 'Notes' }]

  it('requires confirmation, then removes the column and its data from every guest', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <Harness
        initialGuests={[guestWith({ firstName: 'Jane', 'custom.notes': 'Vegetarian' })]}
        customFieldDefs={defs}
      />
    )
    expect(screen.getByText('Notes')).toBeTruthy()
    const menuButton = headerFor('Notes').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(menuButton)
    fireEvent.click(screen.getByText('Delete Column'))

    expect(window.confirm).toHaveBeenCalled()
    expect(screen.queryByText('Notes')).toBeNull()
    // First Name data is untouched; the grid no longer has a 10th column to hold the old Notes value.
    expect(displayIn(cellAt(0, 1))).toBe('Jane')
  })

  it('declining the confirmation keeps the column and its data', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <Harness initialGuests={[guestWith({ 'custom.notes': 'Keep me' })]} customFieldDefs={defs} />
    )
    const menuButton = headerFor('Notes').querySelector('.col-menu-button') as HTMLElement
    fireEvent.click(menuButton)
    fireEvent.click(screen.getByText('Delete Column'))

    expect(screen.getByText('Notes')).toBeTruthy()
    expect(displayIn(cellAt(0, 9))).toBe('Keep me')
  })
})

describe('drag-to-reorder columns', () => {
  function drag(fromLabel: string, toLabel: string, opts: { pastThreshold: boolean }): void {
    const fromTh = headerFor(fromLabel)
    const toTh = headerFor(toLabel)
    const startX = 100
    const endX = opts.pastThreshold ? 400 : 102
    fireEvent.mouseDown(fromTh, { clientX: startX, clientY: 10 })
    // Dispatch the mousemove on the actual header under the cursor (it bubbles
    // up to window, where the real handler listens), so e.target correctly
    // resolves to that header via closest('th[data-column-id]').
    fireEvent.mouseMove(toTh, { clientX: endX, clientY: 10 })
    fireEvent.mouseUp(window)
  }

  it('a small movement (below the threshold) does not reorder -- it is treated as a click', () => {
    render(<Harness initialGuests={[guestWith({ title: 'Mr.', firstName: 'A' })]} />)
    drag('Title', 'First Name', { pastThreshold: false })
    // Order unchanged: Title is still column 0, First Name still column 1.
    expect(displayIn(cellAt(0, 0))).toBe('Mr.')
    expect(displayIn(cellAt(0, 1))).toBe('A')
    // And it behaved as a select instead.
    expect(cellAt(0, 0).className).toContain('cell-selected')
  })

  it('dragging past the threshold reorders the column, moving it before the drop target', () => {
    render(<Harness initialGuests={[guestWith({ title: 'Mr.', firstName: 'Jane', lastName: 'Doe' })]} />)
    drag('Title', 'Last Name', { pastThreshold: true })
    // "Title" should now sit immediately before "Last Name": First Name, Title, Last Name, ...
    const headers = Array.from(document.querySelectorAll('.col-header .col-header-label')).map(
      (el) => el.textContent
    )
    expect(headers).toEqual([
      'First Name',
      'Title',
      'Last Name',
      'Address 1',
      'Address 2',
      'City',
      'State',
      'ZIP',
      'Email'
    ])
  })
})

describe('resizing still works alongside the new header interactions', () => {
  it('double-clicking the resize handle still auto-fits (does not trigger select/reorder)', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'A'.repeat(60) })]} />)
    const handle = headerFor('First Name').querySelector('.col-resize-handle') as HTMLElement
    fireEvent.doubleClick(handle)
    const col = document.querySelectorAll('.grid-table colgroup col')[2] as HTMLElement
    expect(parseInt(col.style.width, 10)).toBeGreaterThan(130)
    // Double-clicking the handle must not have selected the column.
    expect(cellAt(0, 1).className).not.toContain('cell-selected')
  })
})
