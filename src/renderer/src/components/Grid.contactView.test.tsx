import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { GridHarness as Harness, guestWith } from './gridTestHarness'

function cellAt(row: number, col: number): HTMLElement {
  const el = document.querySelector(`[data-row="${row}"][data-col="${col}"]`)
  if (!el) throw new Error(`cell (${row},${col}) not found`)
  return el as HTMLElement
}

function displayIn(cell: HTMLElement): string {
  return cell.querySelector('.cell-display')?.textContent ?? ''
}

function rowHeaderCell(row: number): HTMLElement {
  const el = document.querySelectorAll('tbody .row-header-cell')[row]
  if (!el) throw new Error(`row header ${row} not found`)
  return el as HTMLElement
}

function gridWrapper(): HTMLElement {
  return screen.getByTestId('grid-wrapper')
}

describe('row header: select row / open Contact View', () => {
  it('single click on the row header selects the entire row', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane', lastName: 'Doe' })]} />)
    fireEvent.mouseDown(rowHeaderCell(0))
    fireEvent.mouseUp(window)
    expect(cellAt(0, 1).className).toContain('cell-selected') // First Name
    expect(cellAt(0, 8).className).toContain('cell-selected') // Email (last built-in column)
  })

  it('double click on the row header opens Contact View', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane', lastName: 'Doe' })]} />)
    fireEvent.mouseDown(rowHeaderCell(0))
    fireEvent.mouseUp(window)
    fireEvent.doubleClick(rowHeaderCell(0))
    expect(screen.getByText('Jane Doe')).toBeTruthy() // the Contact View header shows the full name
    expect(screen.getByText('Split')).toBeTruthy()
    expect(screen.getByText('Combined')).toBeTruthy()
  })

  it('double click on a blank buffer row does nothing (nothing to edit yet)', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane' })]} />)
    // Row 1 (index 1) is an auto-buffered blank row beyond the single real guest.
    fireEvent.doubleClick(rowHeaderCell(1))
    expect(screen.queryByText('Split')).toBeNull()
  })

  it('Enter opens Contact View only when the WHOLE row is selected, not a single cell', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane', lastName: 'Doe' })]} />)

    // A single cell selected: Enter just moves down, as always.
    fireEvent.mouseDown(cellAt(0, 1))
    fireEvent.mouseUp(window)
    fireEvent.keyDown(gridWrapper(), { key: 'Enter' })
    expect(screen.queryByText('Split')).toBeNull()

    // The whole row selected via its header: Enter opens Contact View.
    fireEvent.mouseDown(rowHeaderCell(0))
    fireEvent.mouseUp(window)
    fireEvent.keyDown(gridWrapper(), { key: 'Enter' })
    expect(screen.getByText('Split')).toBeTruthy()
  })

  it('editing a field in Contact View updates the spreadsheet immediately', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane', lastName: 'Doe' })]} />)
    fireEvent.doubleClick(rowHeaderCell(0))

    const firstNameInput = screen.getByDisplayValue('Jane')
    fireEvent.change(firstNameInput, { target: { value: 'Janet' } })

    expect(displayIn(cellAt(0, 1))).toBe('Janet')
    // The Contact View header re-derives the full name live too.
    expect(screen.getByText('Janet Doe')).toBeTruthy()
  })

  it('editing a custom field in Contact View updates the spreadsheet', () => {
    render(
      <Harness
        initialGuests={[guestWith({ firstName: 'Jane', 'custom.notes': 'Vegetarian' })]}
        customFieldDefs={[{ id: 'notes', label: 'Notes' }]}
      />
    )
    fireEvent.doubleClick(rowHeaderCell(0))
    const notesInput = screen.getByDisplayValue('Vegetarian')
    fireEvent.change(notesInput, { target: { value: 'Vegan' } })
    expect(displayIn(cellAt(0, 9))).toBe('Vegan')
  })

  it('Combined mode edits round-trip back into title/first/last', () => {
    render(<Harness initialGuests={[guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })]} />)
    fireEvent.doubleClick(rowHeaderCell(0))

    fireEvent.click(screen.getByText('Combined'))
    const nameInput = screen.getByDisplayValue('Mr. John Smith')
    fireEvent.change(nameInput, { target: { value: 'Dr. Jane Cohen' } })
    fireEvent.blur(nameInput)

    expect(displayIn(cellAt(0, 0))).toBe('Dr.')
    expect(displayIn(cellAt(0, 1))).toBe('Jane')
    expect(displayIn(cellAt(0, 2))).toBe('Cohen')
  })

  it('closing Contact View returns to the spreadsheet without losing changes', () => {
    render(<Harness initialGuests={[guestWith({ firstName: 'Jane' })]} />)
    fireEvent.doubleClick(rowHeaderCell(0))
    const closeButtons = screen.getAllByLabelText('Close')
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(screen.queryByText('Split')).toBeNull()
    expect(displayIn(cellAt(0, 1))).toBe('Jane')
  })

  it('shows a Combined Address preview computed from the address fields', () => {
    render(
      <Harness
        initialGuests={[
          guestWith({
            firstName: 'Jane',
            'address.address1': '123 Main St',
            'address.city': 'Brooklyn',
            'address.state': 'NY',
            'address.zip': '11201'
          })
        ]}
      />
    )
    fireEvent.doubleClick(rowHeaderCell(0))
    const pre = document.querySelector('.contact-combined-address pre')
    expect(pre?.textContent).toBe('123 Main St\nBrooklyn, NY 11201')
  })

  it('shows custom fields in Contact View', () => {
    render(
      <Harness
        initialGuests={[guestWith({ firstName: 'Jane', 'custom.notes': 'Vegetarian' })]}
        customFieldDefs={[{ id: 'notes', label: 'Notes' }]}
      />
    )
    fireEvent.doubleClick(rowHeaderCell(0))
    const section = screen.getByText('Custom Fields').closest('.contact-section') as HTMLElement
    expect(within(section).getByText('Notes')).toBeTruthy()
    expect(within(section).getByDisplayValue('Vegetarian')).toBeTruthy()
  })
})
