import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3 } from 'lucide-react'

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))
const PANEL_MIN_WIDTH = 200

export default function TimePicker24({ value, onChange, label, hourLabel, minuteLabel, doneLabel, disabled, className, hideLabel = false }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const input = useRef(null)
  const hourSelect = useRef(null)
  const panel = useRef(null)
  const [position, setPosition] = useState(null)
  const id = useId()
  const visible = open && !disabled
  const inside = target => root.current?.contains(target) || panel.current?.contains(target)

  useEffect(() => {
    if (!visible) return
    // preventScroll: focusing must never scroll a card or table to the popover.
    hourSelect.current?.focus({ preventScroll: true })
    const outside = event => {
      if (!inside(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [visible])

  // Portaled and fixed to the input, so overflow-hidden/auto parents (cards,
  // table scrollers) cannot clip it. Flips above when there is no room below.
  useLayoutEffect(() => {
    if (!visible) {
      setPosition(null)
      return undefined
    }
    function place() {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), window.innerWidth - 16)
      const height = panel.current?.offsetHeight || 260
      const below = rect.bottom + 8
      const fitsBelow = below + height + 8 <= window.innerHeight
      const fitsAbove = rect.top - height - 8 >= 8
      setPosition({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: fitsBelow || !fitsAbove ? Math.max(8, Math.min(below, window.innerHeight - height - 8)) : rect.top - height - 8,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [visible])

  const close = () => {
    setOpen(false)
    input.current?.focus()
  }

  return (
    <div ref={root} className="relative min-w-0"
      onBlur={event => { if (!inside(event.relatedTarget)) setOpen(false) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); close() }
      }}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1.5 block text-xs font-bold text-[#596170]'}>{label}</label>
      <div className="relative">
        <input ref={input} id={id} type="text" readOnly value={value} disabled={disabled}
          className={`${className} cursor-pointer pr-10 tabular-nums`}
          aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? `${id}-picker` : undefined}
          onClick={() => setOpen(true)}
          onKeyDown={event => {
            if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setOpen(true) }
          }} />
        <Clock3 size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
      </div>
      {visible && (createPortal(
        <div ref={panel} id={`${id}-picker`} role="dialog" aria-label={label}
          style={position || { left: -9999, top: 0, width: PANEL_MIN_WIDTH }}
          className="fixed z-[200] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <label className="min-w-0 text-center text-xs font-semibold text-gray-500">
              {hourLabel}
              <select ref={hourSelect} size={5} value={value.slice(0, 2)} aria-label={hourLabel}
                className="mt-2 block h-36 w-full rounded-lg border border-gray-200 bg-white text-center text-base font-semibold tabular-nums text-gray-900"
                onChange={event => onChange(`${event.target.value}:${value.slice(3, 5)}`)}>
                {HOURS.map(hour => <option className="py-1" key={hour} value={hour}>{hour}</option>)}
              </select>
            </label>
            <span aria-hidden="true" className="font-bold text-gray-500">:</span>
            <label className="min-w-0 text-center text-xs font-semibold text-gray-500">
              {minuteLabel}
              <select size={5} value={value.slice(3, 5)} aria-label={minuteLabel}
                className="mt-2 block h-36 w-full rounded-lg border border-gray-200 bg-white text-center text-base font-semibold tabular-nums text-gray-900"
                onChange={event => onChange(`${value.slice(0, 2)}:${event.target.value}`)}>
                {MINUTES.map(minute => <option className="py-1" key={minute} value={minute}>{minute}</option>)}
              </select>
            </label>
          </div>
          <button type="button" onClick={close} className="mt-3 w-full rounded-lg bg-violet-600 py-2 text-sm font-bold text-white hover:bg-violet-700">{doneLabel}</button>
        </div>,
        document.body,
      ))}
    </div>
  )
}
