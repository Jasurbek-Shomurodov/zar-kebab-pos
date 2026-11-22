import React from 'react'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'

const L = {
  uz: { back: 'Orqaga', print: 'Chop etish', printing: 'Chop etilmoqda', language: 'Chek tili' },
  ru: { back: 'Назад', print: 'Печать', printing: 'Идёт печать', language: 'Язык чека' },
  en: { back: 'Back', print: 'Print', printing: 'Printing', language: 'Receipt language' },
}

const RECEIPT_LANGS = ['uz', 'ru', 'en']

/**
 * The screen-only bar above a printable ticket (guest receipt, kitchen check): Back, an optional
 * language choice for the paper, and Print. Hidden on paper (`no-print`); every control is 44px.
 * `lang` is the staff language of the bar; `receiptLang` is the language printed on the ticket.
 */
export default function ReceiptTopBar({ lang = 'ru', onBack, onPrint, printBusy = false, printDisabled = false, receiptLang, onReceiptLangChange }) {
  const l = L[lang] || L.en
  return (
    <div className="no-print sticky top-0 z-sticky flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e1de] bg-white px-3 py-2 sm:px-4">
      <button type="button" onClick={onBack} className="ws-btn ws-btn-ghost min-h-11">
        <ArrowLeft aria-hidden="true" />
        {l.back}
      </button>

      {onReceiptLangChange && (
        <div className="ws-segmented" role="group" aria-label={l.language}>
          {RECEIPT_LANGS.map(code => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={receiptLang === code}
              onClick={() => onReceiptLangChange(code)}
              className="!h-11 min-w-11"
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onPrint}
        disabled={printBusy || printDisabled}
        aria-busy={printBusy}
        className="ws-btn ws-btn-primary min-h-11"
      >
        {printBusy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Printer aria-hidden="true" />}
        {printBusy ? l.printing : l.print}
      </button>
    </div>
  )
}
