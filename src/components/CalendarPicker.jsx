import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { MonthCalendar, shiftCalendarMonth } from './DateRangePicker'
import TimePicker24 from './TimePicker24'
import { restaurantTodayStr } from '../lib/analytics'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'

const labels = {
  en: { date: 'Select date', month: 'Select month', previousMonth: 'Previous month', nextMonth: 'Next month', previousYear: 'Previous year', nextYear: 'Next year', clear: 'Clear', close: 'Close', hour: 'Hour', minute: 'Minute', time: 'Time', weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  ru: { date: 'Выберите дату', month: 'Выберите месяц', previousMonth: 'Предыдущий месяц', nextMonth: 'Следующий месяц', previousYear: 'Предыдущий год', nextYear: 'Следующий год', clear: 'Очистить', close: 'Закрыть', hour: 'Часы', minute: 'Минуты', time: 'Время', weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] },
  uz: { date: 'Sanani tanlang', month: 'Oyni tanlang', previousMonth: 'Oldingi oy', nextMonth: 'Keyingi oy', previousYear: 'Oldingi yil', nextYear: 'Keyingi yil', clear: 'Tozalash', close: 'Yopish', hour: 'Soat', minute: 'Daqiqa', time: 'Vaqt', weekdays: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'] },
}
// The default trigger is the kit's field, so a date sits level with the inputs beside it.
const field = 'ws-input'
const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ff5a00]'
const ARROW = `flex h-10 w-10 items-center justify-center rounded-lg text-[#68655f] hover:bg-[#ebe8e5] hover:text-[#22201d] disabled:cursor-not-allowed disabled:opacity-30 ${FOCUS_RING} [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11`
// 7 day cells of 44px + gaps + padding; narrower phones shrink the cells' width, never their height.
const PANEL_WIDTH = 356

// Shares the report range calendar; values stay ISO strings in every locale.
// Naming: a wrapping <label>, `id` + <label htmlFor> or `aria-labelledby` names the field; `label` names it
// when there is none. The chosen date is the field's description, so it is read after the name.
export default function CalendarPicker({ value = '', onChange, lang = 'en', min, max, disabled = false, className = field, mode = 'date', label, clearable = false, id: fieldId, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy }) {
  const l = labels[lang] || labels.en
  const today = restaurantTodayStr()
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState((value || today).slice(0, 7))
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const trigger = useRef(null)
  const panel = useRef(null)
  const id = useId()
  const visible = open && !disabled
  const title = label || l[mode]
  const valueId = `${id}-value`
  const year = visibleMonth.slice(0, 4)
  const close = () => { setOpen(false); trigger.current?.focus() }
  const select = next => {
    if (next && ((min && next < min) || (max && next > max))) return
    onChange(next)
    close()
  }

  useLayoutEffect(() => {
    if (!visible) return
    const place = () => {
      const rect = trigger.current.getBoundingClientRect()
      const height = panel.current?.offsetHeight || 350
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 8 : rect.top - height - 8) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [visible, mode])

  useEffect(() => {
    if (!visible) return
    // The chosen day or month first; otherwise the first control. Never scroll the page to the popover.
    ;(panel.current?.querySelector('[aria-pressed="true"]:not(:disabled)') || panel.current?.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true })
    const outside = event => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside) }
  }, [visible])

  return <>
    {/* No aria-label unless `label` is passed: it would override the field's own <label> ("Paid date") with "Select date". */}
    <button ref={trigger} id={fieldId} type="button" disabled={disabled} aria-label={labelledBy ? undefined : label || undefined} aria-labelledby={labelledBy}
      aria-describedby={[value ? valueId : '', describedBy].filter(Boolean).join(' ') || undefined}
      aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? id : undefined}
      className={`${className} inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={() => { if (!visible) setVisibleMonth((value || min || today).slice(0, 7)); setOpen(!visible) }}>
      <span id={valueId} className={`truncate tabular-nums ${value ? '' : 'text-[#68655f]'}`}>{value ? (mode === 'month' ? formatMonthYear(value, lang, value) : formatLongDate(value, lang, value)) : title}</span>
      <CalendarDays size={16} className="shrink-0 text-[#68655f]" aria-hidden="true" />
    </button>
    {visible && createPortal(<div ref={panel} id={id} role="dialog" aria-label={title}
      style={{ ...position, width: `min(${PANEL_WIDTH}px, calc(100vw - 16px))`, maxHeight: 'calc(100dvh - 16px)' }}
      className="ws-dialog fixed z-picker overflow-y-auto p-3"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      {mode === 'month' ? <>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label={l.previousYear} disabled={Boolean(min && Number(year) <= Number(min.slice(0, 4)))} onClick={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -12))} className={ARROW}><ChevronLeft size={17} /></button>
          <span aria-live="polite" className="text-sm font-semibold tabular-nums text-[#22201d]">{year}</span>
          <button type="button" aria-label={l.nextYear} disabled={Boolean(max && Number(year) >= Number(max.slice(0, 4)))} onClick={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 12))} className={ARROW}><ChevronRight size={17} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">{Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, '0')}`
          return <button key={month} type="button" disabled={Boolean((min && month < min) || (max && month > max))} aria-pressed={month === value} onClick={() => select(month)}
            className={`min-h-[44px] rounded-lg px-1 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${FOCUS_RING} ${month === value ? 'bg-[#cc4800] font-semibold text-white' : 'text-[#22201d] hover:bg-[#f6f5f3]'}`}>{formatMonthYear(month, lang, month)}</button>
        })}</div>
      </> : <MonthCalendar l={l} lang={lang} monthKey={visibleMonth} draftFrom={value} today={today} min={min} max={max} onSelect={select}
        showPrevious showNext onPrevious={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -1))} onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))} />}
      <div className="mt-3 flex justify-end gap-2 border-t border-[#e4e1de] pt-3">
        {clearable && <button type="button" onClick={() => select('')} className="ws-btn ws-btn-ghost ws-btn-sm">{l.clear}</button>}
        <button type="button" onClick={close} className="ws-btn ws-btn-ghost ws-btn-sm">{l.close}</button>
      </div>
    </div>, document.body)}
  </>
}

export function DateTimePicker({ value = '', onChange, lang, label, className, disabled }) {
  const l = labels[lang] || labels.en
  const [pendingTime, setPendingTime] = useState('00:00')
  const time = value.slice(11, 16) || pendingTime
  return <div className="grid min-w-0 gap-2 sm:grid-cols-2">
    <CalendarPicker value={value.slice(0, 10)} onChange={date => onChange(date ? `${date}T${time}` : '')} lang={lang} label={label} className={className} disabled={disabled} clearable />
    <TimePicker24 value={time} onChange={next => { setPendingTime(next); if (value) onChange(`${value.slice(0, 10)}T${next}`) }} label={l.time} hourLabel={l.hour} minuteLabel={l.minute} doneLabel={l.close} className={className || field} disabled={disabled} />
  </div>
}
