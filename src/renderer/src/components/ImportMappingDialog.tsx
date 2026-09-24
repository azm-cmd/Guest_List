import { useState } from 'react'
import type { GuestFieldPath } from '@shared/types'
import type { ImportedTable } from '@shared/import'
import { guessColumnMapping } from '@shared/import'

interface ImportMappingDialogProps {
  table: ImportedTable
  onConfirm: (mapping: Array<GuestFieldPath | null>) => void
  onCancel: () => void
}

const FIELD_OPTIONS: Array<{ value: GuestFieldPath | ''; label: string }> = [
  { value: '', label: "Don't import" },
  { value: 'title', label: 'Title' },
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'address.address1', label: 'Address 1' },
  { value: 'address.address2', label: 'Address 2' },
  { value: 'address.city', label: 'City' },
  { value: 'address.state', label: 'State' },
  { value: 'address.zip', label: 'ZIP' },
  { value: 'email', label: 'Email' }
]

const PREVIEW_ROWS = 5

export default function ImportMappingDialog({
  table,
  onConfirm,
  onCancel
}: ImportMappingDialogProps): JSX.Element {
  const [mapping, setMapping] = useState<Array<GuestFieldPath | null>>(() =>
    guessColumnMapping(table.headers)
  )

  const setColumnField = (index: number, field: GuestFieldPath | ''): void => {
    setMapping((prev) => {
      const next = prev.slice()
      next[index] = field === '' ? null : field
      return next
    })
  }

  const mappedCount = mapping.filter(Boolean).length

  return (
    <div className="modal-overlay">
      <div className="modal import-dialog">
        <div className="modal-header">
          <h2>Import Guests</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <p className="import-help">
          Match each column from your file to a GuestList field. Columns set to &ldquo;Don&apos;t
          import&rdquo; are skipped. {table.rows.length} row{table.rows.length === 1 ? '' : 's'} found.
        </p>

        <div className="import-mapping-table-wrapper">
          <table className="import-mapping-table">
            <thead>
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i}>
                    <div className="import-source-header">{h || `Column ${i + 1}`}</div>
                    <select
                      value={mapping[i] ?? ''}
                      onChange={(e) => setColumnField(i, e.target.value as GuestFieldPath | '')}
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                <tr key={r}>
                  {table.headers.map((_, c) => (
                    <td key={c}>{row[c] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={mappedCount === 0} onClick={() => onConfirm(mapping)}>
            Import {table.rows.length} Guest{table.rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
