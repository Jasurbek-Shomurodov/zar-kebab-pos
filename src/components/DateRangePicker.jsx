import React, { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'

const CALENDAR_DAY_MS = 86400000

function calendarDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function calendarIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function shiftCalendarMonth(monthKey, amount) {
  const parsed = calendarDate(`${String(monthKey || '').slice(0, 7)}-01`)
  if (!parsed) return String(monthKey || '').slice(0, 7)
  parsed.setUTCMonth(parsed.getUTCMonth() + amount)
  return calendarIso(parsed).slice(0, 7)
}

function buildRangeCalendar(monthKey) {
  const first = calendarDate(`${monthKey}-01`)
  if (!first) return []
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const start = new Date(first.getTime() - mondayOffset * CALENDAR_DAY_MS)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * CALENDAR_DAY_MS)
    const iso = calendarIso(date)
    return { date: iso, day: date.getUTCDate(), inMonth: iso.slice(0, 7) === monthKey }
  })
}

export default function DateRangePicker({ l, lang, rangeKey, dateFrom, dateTo, today, onPreset, onApply, className = '', compact = false, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(dateFrom.slice(0, 7))
  const [draftFrom, setDraftFrom] = useState(dateFrom)
  const [draftTo, setDraftTo] = useState(dateTo)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const pickerRef = useRef(null)
  // Horizontal nudge so a wide panel opened from a narrow spot stays on screen.
  const [panelShift, setPanelShift] = useState(0)
  const secondMonth = shiftCalendarMonth(visibleMonth, 1)
  const presets = [
    { key: 'today', label: l.today },
    { key: 'previousMonth', label: l.previousMonth },
    { key: 'previousWeek', label: l.previousWeek },
    { key: 'previousCurrentWeek', label: l.previousCurrentWeek },
    { key: 'currentWeek', label: l.currentWeek },
    { key: 'currentNextWeek', label: l.currentNextWeek },
    { key: 'month', label: l.month },
    { key: 'nextWeek', label: l.nextWeek },
    { key: 'nextMonth', label: l.nextMonth },
  ]

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function togglePicker() {
    if (!open) {
      setDraftFrom(dateFrom)
      setDraftTo(dateTo)
      setVisibleMonth(dateFrom.slice(0, 7))
      setSelectingEnd(false)
      const rect = pickerRef.current?.getBoundingClientRect()
      const panelWidth = Math.min(760, window.innerWidth - 32)
      setPanelShift(rect && align !== 'right' ? Math.min(0, window.innerWidth - 16 - rect.left - panelWidth) : 0)
    }
    setOpen(current => !current)
  }

  function selectDay(date) {
    if (!selectingEnd) {
      setDraftFrom(date)
      setDraftTo('')
      setSelectingEnd(true)
      return
    }
    // The second click completes the range, so it applies at once without a confirm step.
    const from = date < draftFrom ? date : draftFrom
    const to = date < draftFrom ? draftFrom : date
    setDraftFrom(from)
    setDraftTo(to)
    setSelectingEnd(false)
    onApply(from, to)
    setOpen(false)
  }

  function applyPreset(key) {
    onPreset(key)
    setOpen(false)
  }

  return (
    <div ref={pickerRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={togglePicker}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex ${compact ? 'h-[38px]' : 'h-11'} w-full min-w-0 items-center gap-2.5 rounded-[10px] border bg-white px-3 text-left text-sm text-[#22201d] transition-colors ${
          open ? 'border-[#ff5a00] ring-[3px] ring-[#ff5a00]/20' : 'border-[#dcd9d6] hover:bg-[#f6f5f3]'
        }`}
      >
        <CalendarDays size={16} className="flex-shrink-0 text-[#68655f]" />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">{l.from}</span>
          <span className="truncate font-medium tabular-nums">{formatLongDate(dateFrom, lang, dateFrom)}</span>
          {dateTo !== dateFrom && (
            <>
              <span aria-hidden="true" className="flex-shrink-0 text-[#68655f]">–</span>
              <span className="sr-only">{l.to}</span>
              <span className="truncate font-medium tabular-nums">{formatLongDate(dateTo, lang, dateTo)}</span>
            </>
          )}
        </span>
        <ChevronDown size={16} className={`flex-shrink-0 text-[#68655f] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="dialog" aria-label={l.selectDateRange} style={panelShift ? { transform: `translateX(${panelShift}px)` } : undefined} className={`ws-dialog absolute ${align === 'right' ? 'right-0' : 'left-0'} top-[calc(100%+8px)] z-40 max-h-[min(650px,calc(100vh-140px))] w-[min(760px,calc(100vw-32px))] overflow-y-auto p-3 sm:p-4`}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_210px]">
            <MonthCalendar
              l={l}
              lang={lang}
              monthKey={visibleMonth}
              draftFrom={draftFrom}
              draftTo={draftTo}
              today={today}
              onSelect={selectDay}
              onPrevious={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -1))}
              onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))}
              showPrevious
              showMobileNext
            />
            <div className="hidden md:block">
              <MonthCalendar
                l={l}
                lang={lang}
                monthKey={secondMonth}
                draftFrom={draftFrom}
                draftTo={draftTo}
                today={today}
                onSelect={selectDay}
                onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))}
                showNext
              />
            </div>
            <aside className="border-t border-[#e4e1de] pt-3 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <p className="ws-caption mb-2 font-medium">{l.presets}</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                {presets.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key)}
                    aria-current={rangeKey === preset.key ? 'true' : undefined}
                    className={`rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                      rangeKey === preset.key ? 'bg-[#fff1e8] font-medium text-[#ff5a00]' : 'text-[#22201d] hover:bg-[#f6f5f3]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <p className="ws-caption mt-4 min-w-0 border-t border-[#e4e1de] pt-3 tabular-nums">
            {draftFrom ? formatLongDate(draftFrom, lang, draftFrom) : '—'}
            <span className="mx-2">–</span>
            {draftTo ? formatLongDate(draftTo, lang, draftTo) : '…'}
          </p>
        </div>
      )}
    </div>
  )
}

export function MonthCalendar({
  l,
  lang,
  monthKey,
  draftFrom,
  draftTo,
  today,
  onSelect,
  onPrevious,
  onNext,
  min,
  max,
  showPrevious = false,
  showNext = false,
  showMobileNext = false,
}) {
  const days = buildRangeCalendar(monthKey)
  return (
    <div className="min-w-0">
      <div className="mb-3 grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-1">
        {showPrevious ? (
          <button type="button" onClick={onPrevious} aria-label={l.previousMonth} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#68655f] hover:bg-[#ebe8e5] hover:text-[#22201d]">
            <ChevronLeft size={17} />
          </button>
        ) : <span />}
        <p className="truncate text-center text-sm font-semibold text-[#22201d]">{formatMonthYear(monthKey, lang, monthKey)}</p>
        {showNext || showMobileNext ? (
          <button type="button" onClick={onNext} aria-label={l.nextMonth} className={`flex h-9 w-9 items-center justify-center rounded-lg text-[#68655f] hover:bg-[#ebe8e5] hover:text-[#22201d] ${showMobileNext && !showNext ? 'md:hidden' : ''}`}>
            <ChevronRight size={17} />
          </button>
        ) : <span />}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={formatMonthYear(monthKey, lang, monthKey)}>
        {l.weekdays.map(weekday => (
          <span key={weekday} role="columnheader" className="pb-1 text-center text-[11px] font-medium text-[#68655f]">{weekday}</span>
        ))}
        {days.map(day => {
          const selectedEdge = day.date === draftFrom || day.date === draftTo
          const inRange = Boolean(draftFrom && draftTo && day.date > draftFrom && day.date < draftTo)
          const isToday = day.date === today
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              disabled={!day.inMonth || Boolean(min && day.date < min) || Boolean(max && day.date > max)}
              aria-label={formatLongDate(day.date, lang, day.date)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={selectedEdge || inRange}
              onClick={() => onSelect(day.date)}
              className={`flex h-9 items-center justify-center rounded-lg text-[13px] tabular-nums transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                selectedEdge
                  ? 'bg-[#ff5a00] font-semibold text-white'
                  : inRange
                    ? 'bg-[#fff1e8] text-[#22201d]'
                    : day.inMonth
                      ? isToday
                        ? 'font-semibold text-[#ff5a00] ring-1 ring-inset ring-[#ff5a00]/40 hover:bg-[#f6f5f3]'
                        : 'text-[#22201d] hover:bg-[#f6f5f3]'
                      : 'cursor-default text-[#c9c5c0]'
              }`}
            >
              {day.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
