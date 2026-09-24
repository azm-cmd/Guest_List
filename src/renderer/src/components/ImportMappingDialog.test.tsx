import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ImportMappingDialog from './ImportMappingDialog'
import type { ImportedTable } from '@shared/import'

const table: ImportedTable = {
  headers: ['First Name', 'Spouse Name'],
  rows: [['Jane', 'Alex']]
}

describe('ImportMappingDialog custom columns', () => {
  it('never calls window.prompt for the new-column flow (uses an in-app modal instead)', () => {
    // Regression guard for the Electron disk-cache error traced to
    // window.prompt(): this workflow must not depend on it at all.
    const promptSpy = vi.spyOn(window, 'prompt')
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })
    expect(promptSpy).not.toHaveBeenCalled()
  })

  it('creating a new column opens an in-app modal, and confirming maps that source column to it', () => {
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })

    const input = screen.getByLabelText('Column name')
    fireEvent.change(input, { target: { value: 'Spouse Name' } })
    fireEvent.click(screen.getByText('Create'))

    fireEvent.click(screen.getByText(/Import 1 Guest/))
    expect(onConfirm).toHaveBeenCalledWith(
      [expect.stringMatching(/^(|firstName)$/), 'custom.spouse-name'],
      [{ id: 'spouse-name', label: 'Spouse Name' }]
    )
  })

  it('pressing Enter in the new-column modal also confirms it', () => {
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })

    const input = screen.getByLabelText('Column name')
    fireEvent.change(input, { target: { value: 'Notes' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByLabelText('Column name')).toBeNull() // modal closed
    fireEvent.click(screen.getByText(/Import 1 Guest/))
    const [, newFields] = onConfirm.mock.calls[0]
    expect(newFields).toEqual([{ id: 'notes', label: 'Notes' }])
  })

  it('cancelling the new-column modal (Escape) leaves that column unmapped', () => {
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })
    const input = screen.getByLabelText('Column name')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText('Column name')).toBeNull()

    fireEvent.click(screen.getByText(/Import 1 Guest/))
    const [, newFields] = onConfirm.mock.calls[0]
    expect(newFields).toEqual([])
  })

  it('an existing custom field is offered as a normal option, not requiring a new column', () => {
    render(
      <ImportMappingDialog
        table={table}
        existingCustomFields={[{ id: 'spouse-name', label: 'Spouse Name' }]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getAllByRole('option', { name: 'Spouse Name' }).length).toBeGreaterThan(0)
  })

  it('creating two new columns (e.g. Phone and Notes) maps each source column independently', () => {
    const twoColTable: ImportedTable = {
      headers: ['First Name', 'Phone', 'Notes'],
      rows: [['Jane', '555-1234', 'Vegetarian']]
    }
    const onConfirm = vi.fn()
    render(
      <ImportMappingDialog table={twoColTable} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />
    )
    const selects = screen.getAllByRole('combobox')

    fireEvent.change(selects[1], { target: { value: '__new_column__' } })
    fireEvent.change(screen.getByLabelText('Column name'), { target: { value: 'Phone' } })
    fireEvent.click(screen.getByText('Create'))

    fireEvent.change(selects[2], { target: { value: '__new_column__' } })
    fireEvent.change(screen.getByLabelText('Column name'), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByText('Create'))

    fireEvent.click(screen.getByText(/Import 1 Guest/))
    const [mapping, newFields] = onConfirm.mock.calls[0]
    expect(mapping).toEqual(['firstName', 'custom.phone', 'custom.notes'])
    expect(newFields).toEqual([
      { id: 'phone', label: 'Phone' },
      { id: 'notes', label: 'Notes' }
    ])
  })
})
