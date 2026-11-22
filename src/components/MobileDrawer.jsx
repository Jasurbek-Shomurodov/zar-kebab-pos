import React, { useRef } from 'react'
import { useModalKeyboard } from '../lib/modalKeyboard'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'

/**
 * Phone/tablet drawer overlay shared by every staff layout. It stays mounted so
 * it can slide in and out: the panel moves from the left while the backdrop
 * fades, and the closed drawer is hidden from clicks, focus and screen readers
 * once the slide has finished. While open it behaves as a modal: focus moves in,
 * Tab stays inside, Escape closes and focus returns to the menu button.
 */
export default function MobileDrawer({ open, onClose, label, children }) {
  const { state } = useApp()
  const panelRef = useRef(null)
  const onKeyDown = useModalKeyboard({ dialogRef: panelRef, onEscape: onClose, active: open })

  return (
    <div
      className={`lg:hidden fixed inset-0 z-drawer flex h-[100dvh] ${open ? 'visible' : 'invisible pointer-events-none'}`}
      style={{ transition: `visibility 0s linear ${open ? '0s' : '300ms'}` }}
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : ''}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label || t(state.lang, 'mainNavigation')}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative z-10 h-[100dvh] max-w-[85vw] shadow-[0_10px_40px_rgb(0_0_0/18%)] outline-none transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {children}
      </div>
    </div>
  )
}
