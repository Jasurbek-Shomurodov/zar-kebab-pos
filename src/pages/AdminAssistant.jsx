import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, MessageSquarePlus, SendHorizontal, Sparkles, Square } from 'lucide-react'
import { AssistantMarkdown, useAssistantChat } from 'hoggish-assistant/react'
import AppShell from '../components/AppShell'
import { Shimmer } from '../components/PageShimmer'
import { useApp } from '../store/AppContext'
import { supabase } from '../lib/supabase'

const API = '/api/assistant'
const MAX_MESSAGE_CHARS = 4000

const L = {
  uz: {
    title: 'AI yordamchi',
    emptyTitle: 'Zar Kebab haqida so‘rang',
    emptyDescription: 'Savdo, xarajatlar, maoshlar, bozor va taomlar. Excel fayl ham tayyorlab beraman.',
    suggestions: [
      'Bu oy qancha daromad va foyda bo‘ldi?',
      'Bu oyni o‘tgan oy bilan solishtiring',
      'Bu oy qaysi taomlar eng ko‘p sotildi?',
      'Bu oyning xarajatlarini Excelga chiqaring',
      'Kecha qancha sarfladik?',
      'Oxirgi 6 oyning natijasi qanday?',
    ],
    placeholder: 'Savol bering…',
    send: 'Yuborish',
    stop: 'To‘xtatish',
    newChat: 'Yangi suhbat',
    you: 'Siz',
    thinking: 'O‘ylayapti…',
    readingData: 'Ma’lumotlar o‘qilmoqda…',
    preparingExcel: 'Excel fayl tayyorlanmoqda…',
    download: 'Yuklab olish',
    disclaimer: 'Yordamchi faqat ma’lumotlarni o‘qiydi va xato qilishi mumkin. Muhim raqamlarni Hisobotlar va Buxgalteriyada tekshiring.',
    stopped: 'To‘xtatildi.',
    errors: {
      UNAUTHORIZED: 'Sessiya tugadi. Qaytadan kiring.',
      INVALID_REQUEST: 'Savolni yuborib bo‘lmadi. Yangi suhbat boshlab, qayta urinib ko‘ring.',
      FORBIDDEN: 'Sizda AI yordamchiga ruxsat yo‘q.',
      NOT_CONFIGURED: 'Yordamchi hali sozlanmagan. Serverga AI provayder API kalitini qo‘shing.',
      BUSY: 'Yordamchi hozir band. Bir daqiqadan keyin urinib ko‘ring.',
      REFUSED: 'Yordamchi bu so‘rovga yordam bera olmaydi.',
      TOO_LONG: 'Bu savol juda ko‘p qadam talab qildi. Aniqroq so‘rang.',
      SERVER_ERROR: 'Nimadir xato ketdi. Qayta urinib ko‘ring.',
      NETWORK: 'Aloqa uzildi. Internetni tekshirib, qayta urinib ko‘ring.',
    },
    quota: {
      questionsLeft: count => `Bugun ≈${count} ta savol qoldi`,
      bestModel: (remaining, limit) => `Eng yaxshi model: ${limit} tadan ${remaining} ta qoldi`,
      lighterModels: 'Eng yaxshi model tugadi — yengilroq modellar javob bermoqda',
      usedUp: 'Bugungi bepul limit tugadi',
      resetsIn: (hours, minutes) => `${hours} soat ${minutes} daqiqadan keyin yangilanadi`,
    },
  },
  ru: {
    title: 'ИИ-ассистент',
    emptyTitle: 'Спросите о Zar Kebab',
    emptyDescription: 'Продажи, расходы, зарплаты, базар и блюда. Могу подготовить файл Excel.',
    suggestions: [
      'Какой доход и прибыль в этом месяце?',
      'Сравни этот месяц с прошлым',
      'Какие блюда продавались лучше всего в этом месяце?',
      'Выгрузи расходы за этот месяц в Excel',
      'Сколько мы потратили вчера?',
      'Какой итог за последние 6 месяцев?',
    ],
    placeholder: 'Задайте вопрос…',
    send: 'Отправить',
    stop: 'Остановить',
    newChat: 'Новый чат',
    you: 'Вы',
    thinking: 'Думает…',
    readingData: 'Читаю данные…',
    preparingExcel: 'Готовлю файл Excel…',
    download: 'Скачать',
    disclaimer: 'Ассистент только читает данные и может ошибаться. Важные цифры проверяйте в Отчётах и Бухгалтерии.',
    stopped: 'Остановлено.',
    errors: {
      UNAUTHORIZED: 'Сессия истекла. Войдите снова.',
      INVALID_REQUEST: 'Не удалось отправить вопрос. Начните новый чат и попробуйте снова.',
      FORBIDDEN: 'У вас нет доступа к ИИ-ассистенту.',
      NOT_CONFIGURED: 'Ассистент ещё не настроен. Добавьте API-ключ ИИ-провайдера на сервере.',
      BUSY: 'Ассистент сейчас занят. Попробуйте через минуту.',
      REFUSED: 'Ассистент не может помочь с этим запросом.',
      TOO_LONG: 'Для этого вопроса понадобилось слишком много шагов. Спросите конкретнее.',
      SERVER_ERROR: 'Что-то пошло не так. Попробуйте снова.',
      NETWORK: 'Связь потеряна. Проверьте интернет и попробуйте снова.',
    },
    quota: {
      questionsLeft: count => `≈${count} вопросов осталось сегодня`,
      bestModel: (remaining, limit) => `Лучшая модель: осталось ${remaining} из ${limit}`,
      lighterModels: 'Лучшая модель исчерпана — отвечают более лёгкие модели',
      usedUp: 'Бесплатный лимит на сегодня исчерпан',
      resetsIn: (hours, minutes) => `Обновится через ${hours} ч ${minutes} мин`,
    },
  },
  en: {
    title: 'AI Assistant',
    emptyTitle: 'Ask about Zar Kebab',
    emptyDescription: 'Sales, expenses, salaries, bazaar and dishes. I can also prepare Excel files.',
    suggestions: [
      'How much income and profit did we make this month?',
      'Compare this month with last month',
      'Which dishes sold best this month?',
      'Export this month\'s expenses to Excel',
      'How much did we spend yesterday?',
      'How did the last 6 months go?',
    ],
    placeholder: 'Ask a question…',
    send: 'Send',
    stop: 'Stop',
    newChat: 'New chat',
    you: 'You',
    thinking: 'Thinking…',
    readingData: 'Reading data…',
    preparingExcel: 'Preparing Excel file…',
    download: 'Download',
    disclaimer: 'The assistant only reads data and can make mistakes. Check important numbers in Reports and Accounting.',
    stopped: 'Stopped.',
    errors: {
      UNAUTHORIZED: 'Your session has expired. Sign in again.',
      INVALID_REQUEST: 'The question could not be sent. Start a new chat and try again.',
      FORBIDDEN: 'You don\'t have access to the AI Assistant.',
      NOT_CONFIGURED: 'The assistant is not set up yet. Add the AI provider API key on the server.',
      BUSY: 'The assistant is busy right now. Try again in a minute.',
      REFUSED: 'The assistant can\'t help with that request.',
      TOO_LONG: 'That question needed too many steps. Try asking something more specific.',
      SERVER_ERROR: 'Something went wrong. Try again.',
      NETWORK: 'Connection lost. Check your internet and try again.',
    },
    quota: {
      questionsLeft: count => `≈${count} questions left today`,
      bestModel: (remaining, limit) => `Best model: ${remaining} of ${limit} left`,
      lighterModels: 'Best model used up — lighter models are answering',
      usedUp: 'Free limit used up for today',
      resetsIn: (hours, minutes) => `Resets in ${hours} h ${minutes} min`,
    },
  },
}


// The library's unstyled Markdown, in the workspace style. Text is never HTML.
const MARKDOWN = {
  heading: ({ children }) => <p className="font-semibold">{children}</p>,
  paragraph: ({ children }) => <p>{children}</p>,
  list: ({ ordered, children }) => (ordered
    ? <ol className="list-decimal space-y-1 pl-5">{children}</ol>
    : <ul className="list-disc space-y-1 pl-5">{children}</ul>),
  listItem: ({ children }) => <li>{children}</li>,
  bold: ({ children }) => <strong className="font-semibold text-[#22201d]">{children}</strong>,
  inlineCode: ({ children }) => <code className="rounded bg-[#efece9] px-1 py-0.5 text-[0.9em]">{children}</code>,
  code: ({ text }) => <pre className="overflow-x-auto rounded-lg bg-[#f6f5f3] p-3 text-[13px]"><code>{text}</code></pre>,
  table: ({ header, rows }) => (
    <div className="overflow-x-auto rounded-xl border border-[#e4e1de]">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f5f3] text-[#68655f]">
          <tr>{header.map((cell, index) => <th key={index} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{cell}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#efece9]">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="whitespace-nowrap px-3 py-2 tabular-nums">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
}

export default function AdminAssistant() {
  const { state } = useApp()
  const l = L[state.lang] || L.en
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  // Read at request time, so a language switch keeps the chat and never refetches the quota.
  const langRef = useRef(state.lang)
  langRef.current = state.lang

  const headers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    return {
      'x-assistant-lang': langRef.current,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  const chat = useAssistantChat({ api: API, usageApi: API, headers, maxMessageChars: MAX_MESSAGE_CHARS })
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [chat.messages])

  async function ask(question) {
    if (!question.trim() || chat.busy) return
    setDraft('')
    await chat.send(question)
    inputRef.current?.focus()
  }

  function onSubmit(event) {
    event.preventDefault()
    ask(draft)
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      ask(draft)
    }
  }

  function statusLabel(entry) {
    if (entry.activeTool === 'export_excel') return l.preparingExcel
    if (entry.activeTool) return l.readingData
    return l.thinking
  }

  const { quota } = chat
  const resetIn = quota ? Math.max(0, Date.parse(quota.resetsAt) - Date.now()) : 0
  const quotaDetail = quota && [
    !quota.currentModel
      ? l.quota.usedUp
      : quota.usingFallback
        ? l.quota.lighterModels
        : l.quota.bestModel(quota.currentModel.remaining, quota.currentModel.limit),
    l.quota.resetsIn(Math.floor(resetIn / 3_600_000), Math.floor((resetIn % 3_600_000) / 60_000)),
  ].join(' · ')
  const quotaTone = quota && (quota.questionsLeft === 0 ? 'ws-tone-negative' : quota.usingFallback ? 'ws-tone-caution' : 'ws-tone-positive')

  return (
    <AppShell
      title={l.title}
      titleAccessory={quota ? <span className={`ws-badge ${quotaTone}`} title={quotaDetail}>{l.quota.questionsLeft(quota.questionsLeft)}</span> : null}
      headerActions={chat.messages.length > 0 ? (
        <button type="button" className="ws-btn ws-btn-outline ws-btn-sm" onClick={chat.newChat}>
          <MessageSquarePlus size={16} aria-hidden="true" />
          {l.newChat}
        </button>
      ) : null}
    >
      <div className="ws-page mx-auto min-h-full max-w-4xl">
        <div className="flex-1 space-y-4" aria-live="polite">
          {chat.messages.length === 0 ? (
            <section className="ws-panel flex flex-col items-center gap-3 py-10 text-center">
              <Sparkles size={32} className="text-[#68655f]" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-[#22201d]">{l.emptyTitle}</h2>
              <p className="max-w-md text-sm text-[#68655f]">{l.emptyDescription}</p>
              <div className="mt-2 flex max-w-2xl flex-wrap justify-center gap-2">
                {l.suggestions.map(suggestion => (
                  <button key={suggestion} type="button" className="ws-btn ws-btn-outline ws-btn-sm h-auto whitespace-normal py-2 text-left" onClick={() => ask(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>
          ) : chat.messages.map(entry => (
            entry.role === 'user' ? (
              <div key={entry.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#22201d] px-4 py-2.5 text-sm text-white">
                  <span className="sr-only">{l.you}: </span>
                  {entry.content}
                </div>
              </div>
            ) : (
              <section key={entry.id} className="ws-panel max-w-full space-y-3">
                {entry.content && (
                  <div className="space-y-3 text-sm leading-relaxed text-[#22201d]">
                    <AssistantMarkdown text={entry.content} components={MARKDOWN} />
                  </div>
                )}
                {entry.pending && (
                  <div role="status" aria-busy="true" className="space-y-2">
                    <span className="sr-only">{statusLabel(entry)}</span>
                    <Shimmer className="h-3.5 w-3/4 rounded" />
                    <Shimmer className="h-3.5 w-1/2 rounded" />
                  </div>
                )}
                {entry.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.files.map(file => (
                      <a
                        key={file.url}
                        href={file.url}
                        download={file.fileName}
                        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#e4e1de] bg-white px-3 py-2 text-sm font-medium text-[#22201d] transition hover:bg-[#f6f5f3]"
                      >
                        <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        <span className="truncate">{file.fileName}</span>
                        <Download size={15} className="shrink-0 text-[#68655f]" aria-hidden="true" />
                        <span className="sr-only">{l.download}</span>
                      </a>
                    ))}
                  </div>
                )}
                {entry.stopped && <p className="text-sm text-[#68655f]">{l.stopped}</p>}
                {entry.error && <p role="alert" className="ws-notice ws-tone-negative text-sm">{l.errors[entry.error] || l.errors.SERVER_ERROR}</p>}
              </section>
            )
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="sticky bottom-0 space-y-2 bg-[#f6f5f3] pb-2 pt-1">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={l.placeholder}
              aria-label={l.placeholder}
              maxLength={MAX_MESSAGE_CHARS}
              rows={2}
              className="ws-input min-h-11 flex-1 resize-none"
            />
            {chat.busy ? (
              <button type="button" className="ws-btn ws-btn-outline ws-btn-icon h-11 w-11" aria-label={l.stop} title={l.stop} onClick={chat.stop}>
                <Square size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" className="ws-btn ws-btn-primary ws-btn-icon h-11 w-11" aria-label={l.send} title={l.send} disabled={!draft.trim()}>
                <SendHorizontal size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          {quotaDetail && <p className="text-center text-xs text-[#68655f]">{quotaDetail}</p>}
          <p className="text-center text-xs text-[#8a867f]">{l.disclaimer}</p>
        </form>
      </div>
    </AppShell>
  )
}
