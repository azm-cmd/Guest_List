import { useEffect, useState } from 'react'
import { setGuestField, type CustomFieldDef, type Guest, type GuestFieldPath } from '@shared/types'
import { computeCombinedAddress, computeFullName, parseFullName } from '@shared/contact'

interface ContactViewProps {
  guest: Guest
  customFieldDefs: CustomFieldDef[]
  onUpdateGuest: (updater: (guest: Guest) => Guest) => void
  onClose: () => void
}

type NameMode = 'split' | 'combined'

/**
 * Comfortable single-person editor, complementary to the spreadsheet (fast
 * bulk entry). Every field here reads/writes the same structured Guest data
 * the grid does -- Split/Combined is purely a display/editing mode for the
 * name, never a second source of truth (see parseFullName/computeFullName).
 */
export default function ContactView({
  guest,
  customFieldDefs,
  onUpdateGuest,
  onClose
}: ContactViewProps): JSX.Element {
  const [nameMode, setNameMode] = useState<NameMode>('split')
  const [combinedDraft, setCombinedDraft] = useState(() => computeFullName(guest))

  // Re-derive the combined-mode draft when switching to it (or when the
  // panel opens on a different guest) so it reflects the latest structured
  // data rather than going stale while the user is on the Split tab.
  useEffect(() => {
    setCombinedDraft(computeFullName(guest))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest.id, nameMode])

  const setField = (field: GuestFieldPath, value: string): void => {
    onUpdateGuest((g) => setGuestField(g, field, value))
  }

  const commitCombinedName = (): void => {
    const parsed = parseFullName(combinedDraft)
    onUpdateGuest((g) => {
      let next = setGuestField(g, 'title', parsed.title)
      next = setGuestField(next, 'firstName', parsed.firstName)
      next = setGuestField(next, 'lastName', parsed.lastName)
      return next
    })
  }

  const displayName = computeFullName(guest) || 'Unnamed Guest'
  const combinedAddress = computeCombinedAddress(guest)

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal contact-view-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{displayName}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="contact-name-bar">
          <div className="segmented-control" role="tablist" aria-label="Name display mode">
            <button
              type="button"
              role="tab"
              aria-selected={nameMode === 'split'}
              className={`segmented-option${nameMode === 'split' ? ' segmented-option-active' : ''}`}
              onClick={() => setNameMode('split')}
            >
              Split
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={nameMode === 'combined'}
              className={`segmented-option${nameMode === 'combined' ? ' segmented-option-active' : ''}`}
              onClick={() => setNameMode('combined')}
            >
              Combined
            </button>
          </div>

          {nameMode === 'split' ? (
            <div className="contact-field-row">
              <label className="contact-field contact-field-title">
                <span className="field-label">Title</span>
                <input type="text" value={guest.title} onChange={(e) => setField('title', e.target.value)} />
              </label>
              <label className="contact-field">
                <span className="field-label">First Name</span>
                <input
                  type="text"
                  value={guest.firstName}
                  onChange={(e) => setField('firstName', e.target.value)}
                />
              </label>
              <label className="contact-field">
                <span className="field-label">Last Name</span>
                <input type="text" value={guest.lastName} onChange={(e) => setField('lastName', e.target.value)} />
              </label>
            </div>
          ) : (
            <label className="contact-field contact-field-full">
              <span className="field-label">Full Name</span>
              <input
                type="text"
                value={combinedDraft}
                placeholder="e.g. Mr. John Smith"
                onChange={(e) => setCombinedDraft(e.target.value)}
                onBlur={commitCombinedName}
              />
            </label>
          )}
        </div>

        <div className="contact-section">
          <div className="contact-section-title">Address</div>
          <label className="contact-field contact-field-full">
            <span className="field-label">Address 1</span>
            <input
              type="text"
              value={guest.address.address1}
              onChange={(e) => setField('address.address1', e.target.value)}
            />
          </label>
          <label className="contact-field contact-field-full">
            <span className="field-label">Address 2</span>
            <input
              type="text"
              value={guest.address.address2}
              onChange={(e) => setField('address.address2', e.target.value)}
            />
          </label>
          <div className="contact-field-row">
            <label className="contact-field">
              <span className="field-label">City</span>
              <input type="text" value={guest.address.city} onChange={(e) => setField('address.city', e.target.value)} />
            </label>
            <label className="contact-field">
              <span className="field-label">State</span>
              <input
                type="text"
                value={guest.address.state}
                onChange={(e) => setField('address.state', e.target.value)}
              />
            </label>
            <label className="contact-field">
              <span className="field-label">ZIP</span>
              <input type="text" value={guest.address.zip} onChange={(e) => setField('address.zip', e.target.value)} />
            </label>
          </div>
          {combinedAddress && (
            <div className="contact-combined-address">
              <span className="field-label">Combined Address (automatic)</span>
              <pre>{combinedAddress}</pre>
            </div>
          )}
        </div>

        <div className="contact-section">
          <div className="contact-section-title">Email</div>
          <label className="contact-field contact-field-full">
            <span className="field-label">Email</span>
            <input type="email" value={guest.email} onChange={(e) => setField('email', e.target.value)} />
          </label>
        </div>

        {customFieldDefs.length > 0 && (
          <div className="contact-section">
            <div className="contact-section-title">Custom Fields</div>
            {customFieldDefs.map((def) => (
              <label key={def.id} className="contact-field contact-field-full">
                <span className="field-label">{def.label}</span>
                <input
                  type="text"
                  value={guest.customFields[def.id] ?? ''}
                  onChange={(e) => setField(`custom.${def.id}`, e.target.value)}
                />
              </label>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
