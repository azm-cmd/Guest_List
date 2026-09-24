import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

interface TextPromptModalProps {
  title: string
  label: string
  placeholder?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * A small in-app replacement for window.prompt(). Electron's native
 * text-input dialog is a platform-dependent, comparatively heavy code path
 * (unlike the simpler alert/confirm dialogs) with no genuine reason to be
 * used here when the app already has its own modal system -- see the
 * "Create New Column" import flow for why this exists.
 */
export default function TextPromptModal({
  title,
  label,
  placeholder,
  confirmLabel = 'Create',
  onConfirm,
  onCancel
}: TextPromptModalProps): JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const commit = (): void => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal text-prompt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <label className="field-label" htmlFor="text-prompt-input">
          {label}
        </label>
        <input
          id="text-prompt-input"
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!value.trim()} onClick={commit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
