import React from 'react'

/**
 * Phone/tablet drawer overlay shared by every staff layout. It stays mounted so
 * it can slide in and out: the panel moves from the left while the backdrop
 * fades, and the closed drawer is hidden from clicks, focus and screen readers
 * once the slide has finished.
 */
export default function MobileDrawer({ open, onClose, children }) {
  return (
    <div
      className={`lg:hidden fixed inset-0 z-50 flex h-[100dvh] ${open ? 'visible' : 'invisible pointer-events-none'}`}
      style={{ transition: `visibility 0s linear ${open ? '0s' : '300ms'}` }}
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : ''}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 h-[100dvh] max-w-[85vw] shadow-[0_10px_40px_rgb(0_0_0/18%)] transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {children}
      </div>
    </div>
  )
}
