import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ImportMappingDialog from './ImportMappingDialog'
import type { ImportedTable } from '@shared/import'

const table: ImportedTable = {
  headers: ['First Name', 'Spouse Name'],
  rows: [['Jane', 'Alex']]
}

describe('ImportMappingDialog custom columns', () => {
  it('creating a new column prompts for a name and maps that source column to it', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Spouse Name')
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })

    fireEvent.click(screen.getByText(/Import 1 Guest/))
    expect(onConfirm).toHaveBeenCalledWith(
      [expect.stringMatching(/^(|firstName)$/), 'custom.spouse-name'],
      [{ id: 'spouse-name', label: 'Spouse Name' }]
    )
  })

  it('cancelling the name prompt leaves that column unmapped', () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    const onConfirm = vi.fn()
    render(<ImportMappingDialog table={table} existingCustomFields={[]} onConfirm={onConfirm} onCancel={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: '__new_column__' } })
    fireEvent.click(screen.getByText(/Import 1 Guest/))

    const [, newFields] = onConfirm.mock.calls[0]
    expect(newFields).toEqual([])
  })

  it('an existing custom field is offered as a normal option, not requiring a new prompt', () => {
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
})
