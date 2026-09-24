import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContactView from './ContactView'
import { emptyGuest, setGuestField, type Guest } from '@shared/types'

function guestWith(fields: Record<string, string>): Guest {
  let g = emptyGuest('1')
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

describe('ContactView', () => {
  it('displays the computed full name in the header', () => {
    const guest = guestWith({ title: 'Dr.', firstName: 'David', lastName: 'Cohen' })
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Dr. David Cohen')).toBeTruthy()
  })

  it('falls back to "Unnamed Guest" when nothing is filled in', () => {
    render(<ContactView guest={emptyGuest('1')} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Unnamed Guest')).toBeTruthy()
  })

  it('defaults to Split mode, showing Title/First/Last as separate fields', () => {
    const guest = guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={() => {}} />)
    expect(screen.getByDisplayValue('Mr.')).toBeTruthy()
    expect(screen.getByDisplayValue('John')).toBeTruthy()
    expect(screen.getByDisplayValue('Smith')).toBeTruthy()
  })

  it('editing the First Name field in Split mode calls onUpdateGuest with the new value', () => {
    const guest = guestWith({ firstName: 'John' })
    const onUpdateGuest = vi.fn((updater: (g: Guest) => Guest) => updater(guest))
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={onUpdateGuest} onClose={() => {}} />)
    fireEvent.change(screen.getByDisplayValue('John'), { target: { value: 'Jonathan' } })
    expect(onUpdateGuest).toHaveBeenCalled()
    const result = onUpdateGuest.mock.results[0].value as Guest
    expect(result.firstName).toBe('Jonathan')
  })

  it('switching to Combined mode shows a single editable Full Name field', () => {
    const guest = guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Combined'))
    expect(screen.getByDisplayValue('Mr. John Smith')).toBeTruthy()
    // Split fields are gone while in Combined mode.
    expect(screen.queryByDisplayValue('Smith')).toBeNull()
  })

  it('committing a Combined-mode edit (on blur) parses it back into title/first/last', () => {
    const guest = guestWith({ title: 'Mr.', firstName: 'John', lastName: 'Smith' })
    const onUpdateGuest = vi.fn((updater: (g: Guest) => Guest) => updater(guest))
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={onUpdateGuest} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Combined'))
    const input = screen.getByDisplayValue('Mr. John Smith')
    fireEvent.change(input, { target: { value: 'Dr. Jane Cohen' } })
    fireEvent.blur(input)

    const result = onUpdateGuest.mock.results[0].value as Guest
    expect(result).toMatchObject({ title: 'Dr.', firstName: 'Jane', lastName: 'Cohen' })
  })

  it('shows a computed, read-only Combined Address', () => {
    const guest = guestWith({
      'address.address1': '123 Main St',
      'address.city': 'Brooklyn',
      'address.state': 'NY',
      'address.zip': '11201'
    })
    render(<ContactView guest={guest} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={() => {}} />)
    expect(document.querySelector('.contact-combined-address pre')?.textContent).toBe(
      '123 Main St\nBrooklyn, NY 11201'
    )
  })

  it('renders custom fields with their current values, editable', () => {
    const guest = guestWith({ 'custom.notes': 'Vegetarian' })
    const onUpdateGuest = vi.fn((updater: (g: Guest) => Guest) => updater(guest))
    render(
      <ContactView
        guest={guest}
        customFieldDefs={[{ id: 'notes', label: 'Notes' }]}
        onUpdateGuest={onUpdateGuest}
        onClose={() => {}}
      />
    )
    const input = screen.getByDisplayValue('Vegetarian')
    fireEvent.change(input, { target: { value: 'Vegan' } })
    const result = onUpdateGuest.mock.results[0].value as Guest
    expect(result.customFields.notes).toBe('Vegan')
  })

  it('calls onClose when Done is clicked', () => {
    const onClose = vi.fn()
    render(<ContactView guest={emptyGuest('1')} customFieldDefs={[]} onUpdateGuest={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })
})
