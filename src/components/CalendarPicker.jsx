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
const field = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-[#1F2937] focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100'

// Shares the report range calendar; values stay ISO strings in every locale.
export default function CalendarPicker({ value = '', onChange, lang = 'en', min, max, disabled = false, className = field, mode = 'date', label, clearable = false }) {
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
      const width = Math.min(320, window.innerWidth - 16)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 8 : rect.top - height - 8) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [visible, mode])

  useEffect(() => {
    if (!visible) return
    panel.current?.querySelector('[aria-pressed="true"]:not(:disabled), button:not(:disabled)')?.focus()
    const outside = event => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside) }
  }, [visible])

  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-label={title} aria-haspopup="dialog" aria-expanded={visible} aria-controls={visible ? id : undefined}
      className={`${className} inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={() => { if (!visible) setVisibleMonth((value || min || today).slice(0, 7)); setOpen(!visible) }}>
      <span className="truncate">{value ? (mode === 'month' ? formatMonthYear(value, lang, value) : formatLongDate(value, lang, value)) : title}</span>
      <CalendarDays size={16} className="shrink-0 text-[#ff5a00]" aria-hidden="true" />
    </button>
    {visible && createPortal(<div ref={panel} id={id} role="dialog" aria-label={title}
      style={{ ...position, width: 'min(320px, calc(100vw - 16px))', maxHeight: 'calc(100dvh - 16px)' }}
      className="fixed z-picker overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      {mode === 'month' ? <>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label={l.previousYear} disabled={Boolean(min && Number(year) <= Number(min.slice(0, 4)))} onClick={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -12))} className="rounded-xl p-2 hover:bg-orange-50 disabled:opacity-30"><ChevronLeft size={17} /></button>
          <span className="text-sm font-black text-gray-800">{year}</span>
          <button type="button" aria-label={l.nextYear} disabled={Boolean(max && Number(year) >= Number(max.slice(0, 4)))} onClick={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 12))} className="rounded-xl p-2 hover:bg-orange-50 disabled:opacity-30"><ChevronRight size={17} /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">{Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, '0')}`
          return <button key={month} type="button" disabled={Boolean((min && month < min) || (max && month > max))} aria-pressed={month === value} onClick={() => select(month)}
            className={`rounded-xl px-1 py-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-30 ${month === value ? 'bg-[#ff5a00] text-white' : 'text-gray-700 hover:bg-orange-50'}`}>{formatMonthYear(month, lang, month)}</button>
        })}</div>
      </> : <MonthCalendar l={l} lang={lang} monthKey={visibleMonth} draftFrom={value} today={today} min={min} max={max} onSelect={select}
        showPrevious showNext onPrevious={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -1))} onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))} />}
      <div className="mt-3 flex justify-end gap-3 border-t border-gray-100 pt-3">
        {clearable && <button type="button" onClick={() => select('')} className="text-xs font-bold text-gray-500">{l.clear}</button>}
        <button type="button" onClick={close} className="rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold text-[#ff5a00]">{l.close}</button>
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
