import { json, methodNotAllowed, readJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import {
  buildDailySalaryMessage,
  getTashkentDate,
  parseEmployeeStartToken,
  normalizeSalaryNotificationLanguage,
} from './_lib/salaryMessages.js'
import { loadSalaryProfiles } from './_lib/salaryProfileData.js'
import { callTelegramApi, escapeTelegramHtml, sendTelegramMessage } from './_lib/telegram.js'
import { getEmployeePaymentConfirmationCopy } from './_lib/paymentMessages.js'
import {
  employeeRegistrationAlreadyLinkedMessage,
  employeeRegistrationLinkedMessage,
  linkEmployeeRegistration,
} from './_lib/employeeRegistration.js'
import {
  buildAttendanceCheckinMessage,
  buildAttendanceCheckinRow,
  buildAttendanceCodeRejectedMessage,
  buildAttendanceConnectBotFirstMessage,
  buildAttendanceNotLinkedMessage,
  parseAttendanceCheckinCommand,
  buildAttendanceNotStartedMessage,
  getTashkentClock,
  isAttendanceStarted,
} from '../../src/lib/attendance.js'

const LANGUAGES = {
  uz: { label: "O'zbekcha", saved: "Til tanlandi. Menyuni ochishingiz mumkin.", openMenu: "Menyuni ochish" },
  ru: { label: 'Русский', saved: 'Язык выбран. Теперь можно открыть меню.', openMenu: 'Открыть меню' },
  en: { label: 'English', saved: 'Language saved. You can open the menu now.', openMenu: 'Open Menu' },
}
const CHOOSE_LANGUAGE = "Tilni tanlang / Выберите язык / Choose language"

function requireWebhookSecret(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  const received = req.headers['x-telegram-bot-api-secret-token']
  if (!expected) {
    throw Object.assign(new Error('Telegram webhook secret is not configured'), { status: 503 })
  }
  if (received !== expected) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }
}

function linkedMessage() {
  return '✅ Ваш Telegram-аккаунт успешно привязан к профилю зарплаты.'
}

function invalidLinkMessage() {
  return 'Эта ссылка недействительна или устарела. Попросите администратора создать новую.'
}

async function linkEmployee(supabase, message, token) {
  const user = message.from
  const language = 'ru'
  const { data: link, error: findError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id')
    .eq('link_token', token)
    .gt('link_token_expires_at', new Date().toISOString())
    .maybeSingle()
  if (findError) throw findError

  if (!link) {
    // Not an existing employee's link: it may be a new-employee registration.
    const outcome = await linkEmployeeRegistration(supabase, { token, user, chat: message.chat })
    await sendTelegramMessage(message.chat.id, outcome === 'linked'
      ? employeeRegistrationLinkedMessage()
      : outcome === 'already_linked'
        ? employeeRegistrationAlreadyLinkedMessage()
        : invalidLinkMessage())
    return
  }

  const salaryProfiles = await loadSalaryProfiles(supabase, [link.salary_profile_id])
  const salaryProfile = salaryProfiles.get(link.salary_profile_id)
  if (!salaryProfile) throw new Error('Employee salary profile not found')

  const { data: updated, error: updateError } = await supabase
    .from('employee_salary_telegram_links')
    .update({
      telegram_user_id: String(user.id),
      chat_id: String(message.chat.id),
      username: user.username || '',
      preferred_language: language,
      notifications_enabled: true,
      link_token: null,
      link_token_expires_at: null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('salary_profile_id', link.salary_profile_id)
    .eq('link_token', token)
    .select('salary_profile_id')
    .maybeSingle()

  if (updateError) throw updateError
  if (!updated) {
    await sendTelegramMessage(message.chat.id, invalidLinkMessage())
    return
  }

  const currentStatus = buildDailySalaryMessage(salaryProfile, getTashkentDate(), 'ru')
  try {
    await sendTelegramMessage(
      message.chat.id,
      `${linkedMessage()}\n\n📌 <b>Текущий статус</b>\n\n${currentStatus}`
    )
  } catch (error) {
    console.error('[telegram/webhook] linked status send failed:', error)
  }
}

// Entrance-screen check-in. The rotating QR proves presence (verified in the
// database against Telegram's message time, so a delayed webhook is judged by
// when Start was pressed); the linked Telegram account proves identity. The
// first scan per Tashkent date wins and later scans only echo it.
async function checkInEmployee(supabase, message, command) {
  if (command.kind !== 'rotating') {
    await sendTelegramMessage(message.chat.id, buildAttendanceCodeRejectedMessage('legacy'))
    return
  }
  const scannedAt = Number.isFinite(message.date) ? new Date(message.date * 1000) : new Date()
  // Before the start date the database refuses check-ins (migration 249); answer politely.
  if (!isAttendanceStarted(getTashkentClock(scannedAt).date)) {
    await sendTelegramMessage(message.chat.id, buildAttendanceNotStartedMessage())
    return
  }
  const { data: verdict, error: verifyError } = await supabase.rpc('verify_attendance_checkin_payload', {
    p_payload: command.payload,
    p_at: scannedAt.toISOString(),
  })
  if (verifyError) throw verifyError
  if (verdict !== 'valid') {
    await sendTelegramMessage(message.chat.id, buildAttendanceCodeRejectedMessage(verdict))
    return
  }

  const { data: link, error: linkError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id, preferred_language')
    .eq('telegram_user_id', String(message.from.id))
    .not('linked_at', 'is', null)
    .maybeSingle()
  if (linkError) throw linkError
  if (!link) {
    await sendTelegramMessage(message.chat.id, buildAttendanceConnectBotFirstMessage())
    return
  }

  const { data: salaryProfile, error: profileError } = await supabase
    .from('employee_salary_profiles')
    .select('id, employee_name, work_start_time, is_active, deleted_at')
    .eq('id', link.salary_profile_id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!salaryProfile || salaryProfile.is_active === false || salaryProfile.deleted_at) {
    await sendTelegramMessage(message.chat.id, buildAttendanceNotLinkedMessage())
    return
  }

  const row = buildAttendanceCheckinRow(salaryProfile, message.from.id, scannedAt)
  const { data: inserted, error: insertError } = await supabase
    .from('employee_attendance_checkins')
    .upsert(row, { onConflict: 'salary_profile_id,business_date', ignoreDuplicates: true })
    .select('*')
  if (insertError) throw insertError

  let checkin = inserted?.[0]
  const alreadyCheckedIn = !checkin
  if (alreadyCheckedIn) {
    const { data: existing, error: existingError } = await supabase
      .from('employee_attendance_checkins')
      .select('*')
      .eq('salary_profile_id', salaryProfile.id)
      .eq('business_date', row.business_date)
      .single()
    if (existingError) throw existingError
    checkin = existing
  }

  await sendTelegramMessage(message.chat.id, buildAttendanceCheckinMessage({
    name: escapeTelegramHtml(salaryProfile.employee_name || ''),
    checkin,
    alreadyCheckedIn,
    lang: link.preferred_language,
  }))
}

function languageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: LANGUAGES.uz.label, callback_data: 'language:uz' },
        { text: LANGUAGES.ru.label, callback_data: 'language:ru' },
      ],
      [{ text: LANGUAGES.en.label, callback_data: 'language:en' }],
    ],
  }
}

function openMenuKeyboard(language) {
  const webAppUrl = process.env.TELEGRAM_WEB_APP_URL
  return webAppUrl ? {
    inline_keyboard: [[{
      text: LANGUAGES[language].openMenu,
      web_app: { url: webAppUrl },
    }]],
  } : undefined
}

async function sendChatIdMessage(message) {
  const chatName = escapeTelegramHtml(message.chat.title || message.chat.first_name || 'this chat')
  await sendTelegramMessage(
    message.chat.id,
    `Telegram chat ID for <b>${chatName}</b>:\n<code>${escapeTelegramHtml(message.chat.id)}</code>`
  )
}

async function savePreferredLanguage(supabase, user, chatId, language) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
    || user.username
    || `Telegram ${user.id}`
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .upsert({
      name: fullName,
      telegram_user_id: String(user.id),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'telegram_user_id' })
    .select('id')
    .single()
  if (customerError) throw customerError

  const { error } = await supabase.from('telegram_users').upsert({
    telegram_user_id: String(user.id),
    chat_id: String(chatId || user.id),
    username: user.username || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    language_code: user.language_code || '',
    preferred_language: language,
    customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_user_id' })
  if (error) throw error
}

async function handleLanguageCallback(supabase, callbackQuery) {
  const language = String(callbackQuery?.data || '').split(':')[1]
  if (!LANGUAGES[language] || !callbackQuery?.message?.chat?.id) return

  await savePreferredLanguage(
    supabase,
    callbackQuery.from,
    callbackQuery.message.chat.id,
    language
  )
  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
    text: LANGUAGES[language].saved,
  })
  await callTelegramApi('editMessageText', {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id,
    text: LANGUAGES[language].saved,
    reply_markup: openMenuKeyboard(language),
  })
}

async function handleSalaryPaymentConfirmation(supabase, callbackQuery) {
  const deliveryId = String(callbackQuery?.data || '').split(':')[1]
  const telegramUserId = String(callbackQuery?.from?.id || '')
  const chatId = String(callbackQuery?.message?.chat?.id || '')
  if (!deliveryId || !telegramUserId || !chatId) return

  const { data: delivery, error: deliveryError } = await supabase
    .from('employee_salary_payment_notification_deliveries')
    .select('id, status, telegram_message_id, salary_profile_id')
    .eq('id', deliveryId)
    .maybeSingle()
  if (deliveryError) throw deliveryError
  if (!delivery) {
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'This confirmation is not available.',
      show_alert: true,
    })
    return
  }

  const { data: employeeLink, error: linkError } = await supabase
    .from('employee_salary_telegram_links')
    .select('telegram_user_id, chat_id, preferred_language')
    .eq('salary_profile_id', delivery.salary_profile_id)
    .maybeSingle()
  if (linkError) throw linkError

  const confirmation = getEmployeePaymentConfirmationCopy(employeeLink?.preferred_language)
  const ownsDelivery = delivery
    && String(employeeLink?.telegram_user_id || '') === telegramUserId
    && String(employeeLink?.chat_id || '') === chatId
    && String(delivery.telegram_message_id || '') === String(callbackQuery?.message?.message_id || '')
  if (!ownsDelivery) {
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: 'This confirmation is not available.',
      show_alert: true,
    })
    return
  }

  if (delivery.status !== 'confirmed') {
    const confirmedAt = new Date().toISOString()
    const { error: confirmError } = await supabase
      .from('employee_salary_payment_notification_deliveries')
      .update({
        status: 'confirmed',
        confirmed_at: confirmedAt,
        confirmed_by_telegram_user_id: telegramUserId,
        updated_at: confirmedAt,
      })
      .eq('id', delivery.id)
      .in('status', ['sent', 'confirmed'])
    if (confirmError) throw confirmError
  }

  await callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQuery.id,
    text: confirmation.confirmed,
  })
  await callTelegramApi('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: callbackQuery.message.message_id,
    reply_markup: { inline_keyboard: [] },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res)

  try {
    requireWebhookSecret(req)
    const update = await readJson(req)
    const supabase = getSupabaseAdmin()
    const message = update?.message
    const token = parseEmployeeStartToken(message?.text)
    const attendanceCommand = parseAttendanceCheckinCommand(message?.text)
    const isPrivateChat = message?.chat?.type === 'private'
    const isLanguageCommand = /^\/(?:start|language)(?:@\w+)?(?:\s|$)/i.test(message?.text || '')
    if (message?.chat?.id && /^\/chatid(?:@\w+)?(?:\s|$)/i.test(message?.text || '')) {
      await sendChatIdMessage(message)
    } else if (message?.chat?.id && message?.from?.id && isPrivateChat && attendanceCommand) {
      await checkInEmployee(supabase, message, attendanceCommand)
    } else if (message?.chat?.id && message?.from?.id && token && isPrivateChat) {
      await linkEmployee(supabase, message, token)
    } else if (message?.chat?.id && token) {
      await sendTelegramMessage(
        message.chat.id,
        'Open the employee link in a private chat with the bot.'
      )
    } else if (message?.chat?.id && isLanguageCommand && isPrivateChat) {
      await callTelegramApi('sendMessage', {
        chat_id: message.chat.id,
        text: CHOOSE_LANGUAGE,
        reply_markup: languageKeyboard(),
      })
    } else if (message?.chat?.id && isLanguageCommand) {
      await sendChatIdMessage(message)
    } else if (update?.callback_query?.data?.startsWith('language:')) {
      await handleLanguageCallback(supabase, update.callback_query)
    } else if (update?.callback_query?.data?.startsWith('salary_payment_confirm:')) {
      await handleSalaryPaymentConfirmation(supabase, update.callback_query)
    }
    return json(res, 200, { ok: true })
  } catch (error) {
    console.error('[telegram/webhook]', error)
    return json(res, error?.status || 500, { error: error.message || 'Telegram webhook failed' })
  }
}
