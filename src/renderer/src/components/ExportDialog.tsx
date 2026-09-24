import { useState } from 'react'
import {
  EXPORT_FILTER_LABELS,
  defaultAddressColumns,
  defaultEmailColumns,
  exportSourceLabel,
  type CustomFieldDef,
  type ExportColumnMapping,
  type ExportFilterKind,
  type ExportPreset,
  type ExportSourceField,
  type Guest
} from '@shared/types'
import { buildExportRows, filterGuestsForExport } from '@shared/export'

interface ExportDialogProps {
  guests: Guest[]
  presets: ExportPreset[]
  customFieldDefs: CustomFieldDef[]
  onSavePresets: (presets: ExportPreset[]) => void
  onExport: (fileBaseName: string, header: string[], rows: string[][]) => void
  onClose: () => void
}

const FILTER_OPTIONS: ExportFilterKind[] = [
  'all',
  'anyAddress',
  'addressOnly',
  'addressAndEmail',
  'hasEmail'
]

const BUILT_IN_SOURCE_OPTIONS: ExportSourceField[] = [
  'title',
  'firstName',
  'lastName',
  'fullName',
  'address.address1',
  'address.address2',
  'fullAddressLine',
  'address.city',
  'address.state',
  'address.zip',
  'email'
]

function newColumn(): ExportColumnMapping {
  return { id: crypto.randomUUID(), outputLabel: 'New Column', source: 'firstName' }
}

export default function ExportDialog({
  guests,
  presets,
  customFieldDefs,
  onSavePresets,
  onExport,
  onClose
}: ExportDialogProps): JSX.Element {
  const SOURCE_OPTIONS: ExportSourceField[] = [
    ...BUILT_IN_SOURCE_OPTIONS,
    ...customFieldDefs.map((d) => `custom.${d.id}` as ExportSourceField)
  ]
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ExportFilterKind>('addressOnly')
  const [columns, setColumns] = useState<ExportColumnMapping[]>(defaultAddressColumns())
  const [fileBaseName, setFileBaseName] = useState('Guest List Export')
  const [presetNameDraft, setPresetNameDraft] = useState('')

  const applyQuickStart = (kind: 'addresses' | 'emails' | 'custom'): void => {
    setActivePresetId(null)
    if (kind === 'addresses') {
      setFilter('addressOnly')
      setColumns(defaultAddressColumns())
      setFileBaseName('Address Export')
    } else if (kind === 'emails') {
      setFilter('hasEmail')
      setColumns(defaultEmailColumns())
      setFileBaseName('Email Export')
    } else {
      setFilter('all')
      setColumns(defaultAddressColumns())
      setFileBaseName('Custom Export')
    }
  }

  const applyPreset = (preset: ExportPreset): void => {
    setActivePresetId(preset.id)
    setFilter(preset.filter)
    setColumns(preset.columns.map((c) => ({ ...c })))
    setFileBaseName(preset.name)
  }

  const updateColumn = (id: string, patch: Partial<ExportColumnMapping>): void => {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const removeColumn = (id: string): void => {
    setColumns((cols) => cols.filter((c) => c.id !== id))
  }

  const addColumn = (): void => {
    setColumns((cols) => [...cols, newColumn()])
  }

  const moveColumn = (id: string, direction: -1 | 1): void => {
    setColumns((cols) => {
      const index = cols.findIndex((c) => c.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= cols.length) return cols
      const next = cols.slice()
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const matchCount = filterGuestsForExport(guests, filter).length

  const savePreset = (): void => {
    const name = presetNameDraft.trim() || fileBaseName.trim() || 'Untitled Preset'
    const preset: ExportPreset = {
      id: activePresetId && presets.some((p) => p.id === activePresetId && !p.builtIn)
        ? activePresetId
        : crypto.randomUUID(),
      name,
      filter,
      columns: columns.map((c) => ({ ...c })),
      format: 'csv'
    }
    const next = presets.some((p) => p.id === preset.id)
      ? presets.map((p) => (p.id === preset.id ? preset : p))
      : [...presets, preset]
    onSavePresets(next)
    setActivePresetId(preset.id)
    setPresetNameDraft('')
  }

  const deletePreset = (id: string): void => {
    onSavePresets(presets.filter((p) => p.id !== id))
    if (activePresetId === id) setActivePresetId(null)
  }

  const handleExport = (): void => {
    const { header, rows } = buildExportRows(guests, filter, columns)
    onExport(fileBaseName.trim() || 'Guest List Export', header, rows)
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal export-dialog">
        <div className="modal-header">
          <h2>Export</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="export-quickstart">
          <button className="btn btn-secondary" onClick={() => applyQuickStart('addresses')}>
            Addresses
          </button>
          <button className="btn btn-secondary" onClick={() => applyQuickStart('emails')}>
            Emails
          </button>
          <button className="btn btn-secondary" onClick={() => applyQuickStart('custom')}>
            Custom
          </button>

          {presets.length > 0 && (
            <div className="preset-list">
              <span className="preset-list-label">Presets:</span>
              {presets.map((preset) => (
                <span key={preset.id} className="preset-chip">
                  <button className="preset-chip-btn" onClick={() => applyPreset(preset)}>
                    {preset.name}
                  </button>
                  {!preset.builtIn && (
                    <button
                      className="preset-chip-delete"
                      onClick={() => deletePreset(preset.id)}
                      aria-label={`Delete preset ${preset.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="export-section">
          <label className="field-label" htmlFor="export-filter">
            Include
          </label>
          <select
            id="export-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as ExportFilterKind)}
          >
            {FILTER_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {EXPORT_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
          <span className="export-match-count">{matchCount} guest{matchCount === 1 ? '' : 's'} match</span>
        </div>

        <div className="export-section">
          <div className="field-label">Output columns</div>
          <table className="export-columns-table">
            <thead>
              <tr>
                <th>Output Column</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="text"
                      value={c.outputLabel}
                      onChange={(e) => updateColumn(c.id, { outputLabel: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={c.source}
                      onChange={(e) => updateColumn(c.id, { source: e.target.value as ExportSourceField })}
                    >
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {exportSourceLabel(s, customFieldDefs)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="export-col-actions">
                    <button onClick={() => moveColumn(c.id, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      onClick={() => moveColumn(c.id, 1)}
                      disabled={i === columns.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button onClick={() => removeColumn(c.id)} aria-label="Remove column">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary btn-small" onClick={addColumn}>
            + Add Column
          </button>
        </div>

        <div className="export-section export-file-row">
          <label className="field-label" htmlFor="export-filename">
            File name
          </label>
          <input
            id="export-filename"
            type="text"
            value={fileBaseName}
            onChange={(e) => setFileBaseName(e.target.value)}
          />
          <span className="export-format-badge">CSV</span>
        </div>

        <div className="export-section export-preset-save">
          <input
            type="text"
            placeholder="Preset name (optional)"
            value={presetNameDraft}
            onChange={(e) => setPresetNameDraft(e.target.value)}
          />
          <button className="btn btn-secondary btn-small" onClick={savePreset}>
            Save as Preset
          </button>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
