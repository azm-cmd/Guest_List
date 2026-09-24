import { useState } from 'react'
import { slugifyFieldId, type CustomFieldDef, type GuestFieldPath } from '@shared/types'
import type { ImportedTable } from '@shared/import'
import { guessColumnMapping } from '@shared/import'
import TextPromptModal from './TextPromptModal'

interface ImportMappingDialogProps {
  table: ImportedTable
  existingCustomFields: CustomFieldDef[]
  onConfirm: (mapping: Array<GuestFieldPath | null>, newCustomFields: CustomFieldDef[]) => void
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

const NEW_COLUMN_SENTINEL = '__new_column__'
const PREVIEW_ROWS = 5

export default function ImportMappingDialog({
  table,
  existingCustomFields,
  onConfirm,
  onCancel
}: ImportMappingDialogProps): JSX.Element {
  const [mapping, setMapping] = useState<Array<GuestFieldPath | null>>(() =>
    guessColumnMapping(table.headers)
  )
  // Custom columns created during THIS import session (in addition to any that already existed).
  const [newCustomFields, setNewCustomFields] = useState<CustomFieldDef[]>([])
  // Which source column (if any) is currently prompting for a new column name.
  const [pendingNewColumnIndex, setPendingNewColumnIndex] = useState<number | null>(null)

  const allCustomFields = [...existingCustomFields, ...newCustomFields]

  const setColumnField = (index: number, value: string): void => {
    if (value === NEW_COLUMN_SENTINEL) {
      setPendingNewColumnIndex(index)
      return
    }
    setMapping((prev) => {
      const next = prev.slice()
      next[index] = value === '' ? null : (value as GuestFieldPath)
      return next
    })
  }

  const createNewColumn = (label: string): void => {
    const index = pendingNewColumnIndex
    setPendingNewColumnIndex(null)
    if (index === null) return
    const id = slugifyFieldId(
      label,
      allCustomFields.map((d) => d.id)
    )
    setNewCustomFields((prev) => [...prev, { id, label }])
    setMapping((prev) => {
      const next = prev.slice()
      next[index] = `custom.${id}`
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
          Match each column from your file to a GuestList field, or create a new column for data
          that doesn&apos;t fit an existing field. Columns set to &ldquo;Don&apos;t import&rdquo;
          are skipped. {table.rows.length} row{table.rows.length === 1 ? '' : 's'} found.
        </p>

        <div className="import-mapping-table-wrapper">
          <table className="import-mapping-table">
            <thead>
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i}>
                    <div className="import-source-header">{h || `Column ${i + 1}`}</div>
                    <select value={mapping[i] ?? ''} onChange={(e) => setColumnField(i, e.target.value)}>
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      {allCustomFields.map((def) => (
                        <option key={def.id} value={`custom.${def.id}`}>
                          {def.label}
                        </option>
                      ))}
                      <option value={NEW_COLUMN_SENTINEL}>+ Create New Column</option>
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
          <button
            className="btn btn-primary"
            disabled={mappedCount === 0}
            onClick={() => onConfirm(mapping, newCustomFields)}
          >
            Import {table.rows.length} Guest{table.rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {pendingNewColumnIndex !== null && (
        <TextPromptModal
          title="New Column"
          label="Column name"
          placeholder="e.g. Phone, Notes"
          confirmLabel="Create"
          onConfirm={createNewColumn}
          onCancel={() => setPendingNewColumnIndex(null)}
        />
      )}
    </div>
  )
}
