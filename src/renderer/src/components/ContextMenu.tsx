import { useEffect, useRef, type CSSProperties } from 'react'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // Capture phase + a microtask delay so the same right-click that opened
    // the menu doesn't immediately close it via this same listener.
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onPointerDown, true)
      window.addEventListener('contextmenu', onPointerDown, true)
    }, 0)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('contextmenu', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // Keep the menu on-screen near the click point.
  const style: CSSProperties = {
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 32 - 16)
  }

  return (
    <div className="context-menu" style={style} ref={ref} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
