interface ToolbarProps {
  title: string
  searchQuery: string
  onSearchChange: (value: string) => void
  saveState: 'saved' | 'saving' | 'unsaved'
  onExport: () => void
  onImport: () => void
  matchCount: number | null
}

const SAVE_LABEL: Record<ToolbarProps['saveState'], string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes'
}

export default function Toolbar({
  title,
  searchQuery,
  onSearchChange,
  saveState,
  onExport,
  onImport,
  matchCount
}: ToolbarProps): JSX.Element {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="doc-title">{title}</span>
        <span className={`save-status save-status-${saveState}`}>{SAVE_LABEL[saveState]}</span>
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
