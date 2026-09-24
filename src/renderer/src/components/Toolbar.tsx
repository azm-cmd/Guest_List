import { useEffect, useRef, useState } from 'react'

type SaveState = 'saved' | 'saving' | 'unsaved'

interface ToolbarProps {
  title: string
  onRenameTitle: (newTitle: string) => void
  searchQuery: string
  onSearchChange: (value: string) => void
  saveState: SaveState
  onSaveClick: () => void
  onExport: () => void
  onImport: () => void
  matchCount: number | null
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes'
}

export default function Toolbar({
  title,
  onRenameTitle,
  searchQuery,
  onSearchChange,
  saveState,
  onSaveClick,
  onExport,
  onImport,
  matchCount
}: ToolbarProps): JSX.Element {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const startEditingTitle = (): void => {
    setTitleDraft(title)
    setEditingTitle(true)
  }

  const commitTitle = (): void => {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (next && next !== title) onRenameTitle(next)
  }

  const cancelTitleEdit = (): void => {
    setEditingTitle(false)
    setTitleDraft(title)
  }

  const saveClickable = saveState === 'unsaved'

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {editingTitle ? (
          <span className="doc-title-edit">
            <input
              ref={titleInputRef}
              className="doc-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTitle()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelTitleEdit()
                }
              }}
            />
            <span className="doc-title-ext">.guestlist</span>
          </span>
        ) : (
          <button
            type="button"
            className="doc-title"
            onClick={startEditingTitle}
            title="Click to rename"
          >
            {title}.guestlist
          </button>
        )}
        <button
          type="button"
          className={`save-status save-status-${saveState}`}
          onClick={saveClickable ? onSaveClick : undefined}
          disabled={!saveClickable}
          title={saveClickable ? 'Click to save now' : undefined}
        >
          {SAVE_LABEL[saveState]}
        </button>
      </div>
      <div className="toolbar-center">
        <input
          type="text"
          className="search-input"
          placeholder="Search guests…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery.trim() && (
          <span className="search-count">
            {matchCount ?? 0} match{matchCount === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      <div className="toolbar-right">
        <button className="btn btn-secondary" onClick={onImport}>
          Import
        </button>
        <button className="btn btn-primary" onClick={onExport}>
          Export
        </button>
      </div>
    </div>
  )
}
