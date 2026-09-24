import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Toolbar from './Toolbar'

const noop = (): void => {}

describe('Toolbar filename editing', () => {
  it('shows the title with a .guestlist suffix and starts editing on click', () => {
    render(
      <Toolbar
        title="Wedding Guest List"
        onRenameTitle={noop}
        searchQuery=""
        onSearchChange={noop}
        saveState="saved"
        onSaveClick={noop}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    expect(screen.getByText('Wedding Guest List.guestlist')).toBeTruthy()
    fireEvent.click(screen.getByText('Wedding Guest List.guestlist'))
    expect(screen.getByDisplayValue('Wedding Guest List')).toBeTruthy()
  })

  it('commits a rename on Enter', () => {
    const onRenameTitle = vi.fn()
    render(
      <Toolbar
        title="Old Name"
        onRenameTitle={onRenameTitle}
        searchQuery=""
        onSearchChange={noop}
        saveState="saved"
        onSaveClick={noop}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    fireEvent.click(screen.getByText('Old Name.guestlist'))
    const input = screen.getByDisplayValue('Old Name')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRenameTitle).toHaveBeenCalledWith('New Name')
  })

  it('cancels on Escape without renaming', () => {
    const onRenameTitle = vi.fn()
    render(
      <Toolbar
        title="Old Name"
        onRenameTitle={onRenameTitle}
        searchQuery=""
        onSearchChange={noop}
        saveState="saved"
        onSaveClick={noop}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    fireEvent.click(screen.getByText('Old Name.guestlist'))
    const input = screen.getByDisplayValue('Old Name')
    fireEvent.change(input, { target: { value: 'Something Else' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRenameTitle).not.toHaveBeenCalled()
    expect(screen.getByText('Old Name.guestlist')).toBeTruthy()
  })
})

describe('Toolbar save status', () => {
  it('"Unsaved changes" is clickable and triggers a save', () => {
    const onSaveClick = vi.fn()
    render(
      <Toolbar
        title="Doc"
        onRenameTitle={noop}
        searchQuery=""
        onSearchChange={noop}
        saveState="unsaved"
        onSaveClick={onSaveClick}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    fireEvent.click(screen.getByText('Unsaved changes'))
    expect(onSaveClick).toHaveBeenCalledTimes(1)
  })

  it('"Saved" is not clickable', () => {
    const onSaveClick = vi.fn()
    render(
      <Toolbar
        title="Doc"
        onRenameTitle={noop}
        searchQuery=""
        onSearchChange={noop}
        saveState="saved"
        onSaveClick={onSaveClick}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    const status = screen.getByText('Saved')
    expect((status as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(status)
    expect(onSaveClick).not.toHaveBeenCalled()
  })

  it('"Saving…" is not clickable', () => {
    const onSaveClick = vi.fn()
    render(
      <Toolbar
        title="Doc"
        onRenameTitle={noop}
        searchQuery=""
        onSearchChange={noop}
        saveState="saving"
        onSaveClick={onSaveClick}
        onExport={noop}
        onImport={noop}
        matchCount={null}
      />
    )
    fireEvent.click(screen.getByText('Saving…'))
    expect(onSaveClick).not.toHaveBeenCalled()
  })
})
