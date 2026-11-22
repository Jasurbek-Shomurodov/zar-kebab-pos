import { useState } from 'react'
import { formatMenuWeekdays, MENU_WEEKDAYS, normalizeMenuWeekdays } from '../lib/menuItems'

const PRESETS = [
  ['weekdays', [1, 2, 3, 4, 5]],
  ['weekend', [6, 7]],
  ['everyDay', MENU_WEEKDAYS],
]

function weekdayLabels(lang) {
  return {
    section: lang === 'uz' ? 'Hafta kunlari' : lang === 'ru' ? 'Дни недели' : 'Days of the week',
    hint: lang === 'uz'
      ? 'Belgilanmagan kunlarda kategoriya ofitsiant va mehmon menyusida yashiriladi. Ommaviy menyu kunlarni yorliq sifatida ko‘rsatadi.'
      : lang === 'ru'
        ? 'В невыбранные дни категория скрыта в меню официанта и гостя. Публичное меню показывает дни подписью.'
        : 'On unselected days the category is hidden from the waiter and guest menus. The public menu shows the days as a label.',
    weekdays: lang === 'uz' ? 'Ish kunlari' : lang === 'ru' ? 'Будни' : 'Weekdays',
    weekend: lang === 'uz' ? 'Dam olish' : lang === 'ru' ? 'Выходные' : 'Weekend',
    everyDay: lang === 'uz' ? 'Har kuni' : lang === 'ru' ? 'Каждый день' : 'Every day',
    lastDay: lang === 'uz'
      ? 'Kamida bitta kun tanlangan bo‘lishi kerak. Kategoriyani butunlay yashirish uchun uning ko‘rinishini o‘chiring.'
      : lang === 'ru'
        ? 'Должен остаться хотя бы один день. Чтобы скрыть категорию совсем, выключите её видимость.'
        : 'At least one day must stay selected. To hide the category completely, turn off its visibility.',
  }
}

// ISO weekday toggles for a category schedule. At least one day always stays selected.
export default function MenuWeekdayPicker({ lang, value, onChange, disabled = false }) {
  const labels = weekdayLabels(lang)
  const selectedDays = normalizeMenuWeekdays(value)
  // Removing the last day is refused; say why instead of ignoring the tap.
  const [lastDayRefused, setLastDayRefused] = useState(false)

  const toggle = day => {
    const nextDays = selectedDays.includes(day)
      ? selectedDays.filter(selected => selected !== day)
      : [...selectedDays, day]
    setLastDayRefused(nextDays.length === 0)
    if (nextDays.length) onChange(normalizeMenuWeekdays(nextDays))
  }

  return (
    <fieldset className="mt-4 border-t border-[#e4e1de] pt-3">
      <legend className="float-left w-full ws-caption font-medium">{labels.section}</legend>
      <div className="clear-both flex flex-wrap gap-1.5 pt-2" role="group" aria-label={labels.section}>
        {MENU_WEEKDAYS.map(day => {
          const selected = selectedDays.includes(day)
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => toggle(day)}
              className={`ws-btn ws-btn-sm min-h-[44px] min-w-[48px] ${selected ? 'ws-btn-primary' : 'ws-btn-outline'} disabled:cursor-wait`}
            >
              {formatMenuWeekdays({ visible_weekdays: [day] }, lang)}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map(([key, days]) => (
          <button key={key} type="button" disabled={disabled}
            className="ws-btn ws-btn-ghost ws-btn-sm"
            onClick={() => { setLastDayRefused(false); onChange([...days]) }}>
            {labels[key]}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className={lastDayRefused ? 'ws-notice ws-tone-caution mt-2' : 'sr-only'}>
        {lastDayRefused ? labels.lastDay : ''}
      </p>
      <p className="ws-caption mt-2">{labels.hint}</p>
    </fieldset>
  )
}
