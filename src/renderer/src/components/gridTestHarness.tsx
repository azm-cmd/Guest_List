import { useState } from 'react'
import Grid from './Grid'
import { DEFAULT_GRID_COLUMNS, emptyGuest, setGuestField, type CustomFieldDef, type Guest } from '@shared/types'

export function guestWith(fields: Record<string, string>): Guest {
  let g = emptyGuest(crypto.randomUUID())
  for (const [k, v] of Object.entries(fields)) {
    g = setGuestField(g, k as never, v)
  }
  return g
}

/**
 * A test-only stand-in for App.tsx's wiring, close enough to the real
 * controller behavior (see useGuestListDocument.ts) that component tests can
 * exercise column add/delete/reorder the same way the real app does.
 */
export function GridHarness({
  initialGuests = [],
  customFieldDefs = [],
  initialColumnOrder
}: {
  initialGuests?: Guest[]
  customFieldDefs?: CustomFieldDef[]
  initialColumnOrder?: string[]
}): JSX.Element {
  const [guests, setGuests] = useState<Guest[]>(initialGuests)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [fields, setFields] = useState<CustomFieldDef[]>(customFieldDefs)
  const [columnOrder, setColumnOrder] = useState<string[]>(
    initialColumnOrder ?? [
      ...DEFAULT_GRID_COLUMNS.map((c) => c.id),
      ...customFieldDefs.map((d) => `custom-${d.id}`)
    ]
  )

  return (
    <Grid
      guests={guests}
      columnWidths={columnWidths}
      customFieldDefs={fields}
      columnOrder={columnOrder}
      searchQuery=""
      onUpdateGuests={(updater) => setGuests((prev) => updater(prev))}
      onColumnWidthChange={(id, w) => setColumnWidths((prev) => ({ ...prev, [id]: w }))}
      onReorderColumns={setColumnOrder}
      onDeleteCustomField={(fieldId) => {
        setFields((prev) => prev.filter((d) => d.id !== fieldId))
        setColumnOrder((prev) => prev.filter((id) => id !== `custom-${fieldId}`))
        setGuests((prev) =>
          prev.map((g) => {
            if (!(fieldId in g.customFields)) return g
            const rest = { ...g.customFields }
            delete rest[fieldId]
            return { ...g, customFields: rest }
          })
        )
      }}
      onUndo={() => {}}
      onRedo={() => {}}
    />
  )
}
