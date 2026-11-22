import React, { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export default function AnimatedSearch({
  value,
  onChange,
  placeholder,
  searchLabel = 'Search',
  clearLabel = 'Clear search',
  closeLabel = 'Close search',
  variant = 'inline',
  alwaysOpen = false,
  className = '',
  buttonClassName = '',
  panelClassName = '',
  floating = false,
  floatingInset = 16,
  floatingBreakpoint = null,
  floatingMaxWidth = 720,
}) {
  const [open, setOpen] = useState(false)
  const [floatingStyle, setFloatingStyle] = useState(null)
  const [floatingViewport, setFloatingViewport] = useState(() => floating && floatingBreakpoint === null)
  const buttonRef = useRef(null)
  const inputRef = useRef(null)
  const hasValue = Boolean(value)
  const isFloating = floating && floatingViewport
  const isOpen = alwaysOpen || open

  useEffect(() => {
    if (!open || alwaysOpen) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [alwaysOpen, open])

  useEffect(() => {
    if (!floating) {
      setFloatingViewport(false)
      return undefined
    }

    if (floatingBreakpoint === null) {
      setFloatingViewport(true)
      return undefined
    }

    function syncFloatingViewport() {
      setFloatingViewport(window.innerWidth < floatingBreakpoint)
    }

    syncFloatingViewport()
    window.addEventListener('resize', syncFloatingViewport)

    return () => {
      window.removeEventListener('resize', syncFloatingViewport)
    }
  }, [floating, floatingBreakpoint])

  useEffect(() => {
    if (!open || !isFloating) return undefined

    function syncFloatingPanel() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      setFloatingStyle({
        position: 'fixed',
        left: `${Math.max(8, Math.round(rect.left))}px`,
        width: `min(calc(100vw - ${Math.max(8, Math.round(rect.left))}px - ${floatingInset}px), ${floatingMaxWidth}px)`,
        top: `${Math.round(rect.top)}px`,
        transformOrigin: 'left center',
      })
    }

    syncFloatingPanel()
    window.addEventListener('resize', syncFloatingPanel)
    window.addEventListener('scroll', syncFloatingPanel, true)

    return () => {
      window.removeEventListener('resize', syncFloatingPanel)
      window.removeEventListener('scroll', syncFloatingPanel, true)
    }
  }, [floatingInset, floatingMaxWidth, isFloating, open])

  function clearSearch() {
    onChange('')
  }

  if (variant === 'overlay') {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={searchLabel}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-[#475569] transition-all duration-200 ease-out hover:bg-white hover:text-[#bf4300] ${
            open ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          } ${hasValue ? 'text-[#bf4300] ring-2 ring-[#ff5a00]/10' : ''} ${buttonClassName}`}
        >
          <Search size={17} aria-hidden="true" />
        </button>

        <div
          className={`${isFloating ? 'z-floating' : 'absolute inset-x-3 top-1/2 z-20 -translate-y-1/2 sm:inset-x-4'} rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-lg transition-all duration-200 ease-out ${
            open
              ? 'pointer-events-auto scale-x-100 scale-y-100 opacity-100'
              : 'pointer-events-none scale-x-[0.08] scale-y-90 opacity-0'
          } ${panelClassName}`}
          style={isFloating ? (floatingStyle || {
            position: 'fixed',
            left: 0,
            width: `min(calc(100vw - ${floatingInset}px), ${floatingMaxWidth}px)`,
            top: 0,
            transformOrigin: 'left center',
          }) : { transformOrigin: 'left center' }}
        >
          <div className="relative flex items-center gap-2">
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 text-[#9CA3AF]" />
            <input
              ref={inputRef}
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={placeholder}
              aria-label={searchLabel}
              disabled={!open}
              tabIndex={open ? 0 : -1}
              className="h-11 min-w-0 flex-1 rounded-xl bg-[#F8FAFC] pl-10 pr-12 text-sm outline-none transition-colors placeholder:text-[#68655f] focus:bg-white disabled:opacity-100"
            />
            {hasValue && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={clearLabel}
                className="absolute right-12 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[#68655f] transition-colors hover:bg-white hover:text-[#22201d]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={closeLabel}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[#475569] transition-colors hover:bg-[#F8FAFC] hover:text-[#bf4300]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      className={`relative flex transition-all duration-200 ease-out ${
        isFloating ? '' : alwaysOpen ? 'order-none min-w-0 flex-1' : 'order-last sm:order-none sm:min-w-0'
      } ${
        isFloating
          ? 'h-10 w-10 min-w-10 flex-none flex-shrink-0'
          : alwaysOpen
            ? 'min-w-0 flex-1'
            : isOpen ? 'min-w-full flex-1 sm:min-w-[220px]' : 'h-10 w-10 min-w-10 flex-none flex-shrink-0'
      } ${className}`}
    >
      {!alwaysOpen && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={searchLabel}
          className={`flex h-10 w-10 min-w-10 flex-none items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#475569] transition-all duration-200 ease-out hover:border-orange-200 hover:bg-white hover:text-[#bf4300] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${
            open ? 'pointer-events-none absolute left-0 top-0 scale-95 opacity-0' : 'relative scale-100 opacity-100'
          } ${hasValue ? 'text-[#bf4300] ring-2 ring-[#ff5a00]/10' : ''} ${buttonClassName}`}
        >
          <Search size={17} aria-hidden="true" />
        </button>
      )}

      <div
        className={`${isFloating ? 'z-floating' : 'relative'} flex h-10 min-w-0 items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] transition-all duration-200 ease-out focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/20 ${
          isOpen ? 'pointer-events-auto w-full scale-x-100 opacity-100' : 'pointer-events-none w-10 scale-x-0 opacity-0'
        } ${panelClassName}`}
        style={isFloating ? (floatingStyle || {
          position: 'fixed',
          left: 0,
          width: `min(calc(100vw - ${floatingInset}px), ${floatingMaxWidth}px)`,
          top: 0,
          transformOrigin: 'left center',
        }) : { transformOrigin: 'left center' }}
      >
        <Search size={16} aria-hidden="true" className="absolute left-3.5 text-[#9CA3AF] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          aria-label={searchLabel}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={!isOpen}
          tabIndex={isOpen ? 0 : -1}
          className={`h-full w-full bg-transparent pl-10 text-[14px] text-[#1F2937] placeholder-[#68655f] outline-none disabled:opacity-100 ${alwaysOpen ? 'pr-11' : 'pr-[5.5rem]'}`}
        />
        {hasValue && (
          <button
            type="button"
            onClick={clearSearch}
            className={`absolute inset-y-0 flex w-11 items-center justify-center text-[#68655f] transition-colors hover:text-[#22201d] ${alwaysOpen ? 'right-0' : 'right-11'}`}
            aria-label={clearLabel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
        {!alwaysOpen && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-lg text-[#68655f] transition-colors hover:text-[#bf4300]"
            aria-label={closeLabel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
