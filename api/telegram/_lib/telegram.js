import crypto from 'crypto'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

function fromBase64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex')
  const right = Buffer.from(String(b || ''), 'hex')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  return token
}

function getSessionSecret() {
  return process.env.TELEGRAM_SESSION_SECRET || getBotToken()
}

export function validateTelegramInitData(initData) {
  if (!initData || typeof initData !== 'string') {
    throw new Error('Telegram initData is required')
  }

  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  if (!receivedHash) throw new Error('Telegram initData hash is missing')

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(getBotToken())
    .digest()
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (!timingSafeEqualHex(calculatedHash, receivedHash)) {
    throw new Error('Telegram initData signature is invalid')
  }

  const authDate = Number(params.get('auth_date') || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new Error('Telegram initData is expired')
  }

  const userRaw = params.get('user')
  if (!userRaw) throw new Error('Telegram initData user is missing')

  const user = JSON.parse(userRaw)
  if (!user?.id) throw new Error('Telegram user id is missing')

  return {
    authDate,
    queryId: params.get('query_id') || null,
    user: {
      id: String(user.id),
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      language_code: user.language_code || '',
    },
  }
}

export function createTelegramSession(payload) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const encoded = base64url(JSON.stringify(body))
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyTelegramSession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    throw new Error('Telegram session is required')
  }

  const [encoded, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
  const left = Buffer.from(sig || '')
  const right = Buffer.from(expected)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new Error('Telegram session signature is invalid')
  }

  const payload = JSON.parse(fromBase64url(encoded))
  if (!payload?.telegramUserId || !payload?.customerId || !payload?.exp) {
    throw new Error('Telegram session payload is invalid')
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Telegram session is expired')
  }
  return payload
}

export async function callTelegramApi(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw Object.assign(new Error(body.description || `Telegram ${method} failed with ${res.status}`), { telegramRejected: body.ok === false })
  }
  return body
}

export async function sendTelegramMessage(chatId, text, options = {}) {
  if (!chatId || !text) return { skipped: true }
  return callTelegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...options,
  })
}

export async function deleteTelegramMessage(chatId, messageId) {
  const normalizedChatId = String(chatId || '').trim()
  const normalizedMessageId = Number(messageId)
  if (!normalizedChatId || !Number.isSafeInteger(normalizedMessageId) || normalizedMessageId <= 0) {
    throw new Error('Telegram chat id and message id are required')
  }
  return callTelegramApi('deleteMessage', {
    chat_id: normalizedChatId,
    message_id: normalizedMessageId,
  })
}

export async function editTelegramMessage(chatId, messageId, text) {
  if (!chatId || !Number.isSafeInteger(Number(messageId)) || Number(messageId) <= 0 || !text) {
    throw new Error('Telegram chat id, message id and text are required')
  }
  return callTelegramApi('editMessageText', {
    chat_id: String(chatId),
    message_id: Number(messageId),
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  })
}

export async function sendTelegramPhoto(chatId, photo, {
  caption = '',
  filename = 'report.png',
  parseMode = 'HTML',
  contentType = 'image/png',
} = {}) {
  if (!chatId || !photo) return { skipped: true }
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('photo', new Blob([photo], { type: contentType }), filename)
  if (caption) {
    form.append('caption', caption)
    form.append('parse_mode', parseMode)
  }

  const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/sendPhoto`, {
    method: 'POST',
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(body.description || `Telegram sendPhoto failed with ${res.status}`)
  }
  return body
}

export async function sendTelegramMediaGroup(chatId, photos = []) {
  const normalizedChatId = String(chatId || '').trim()
  const normalizedPhotos = Array.isArray(photos) ? photos.filter(item => item?.photo) : []
  if (!normalizedChatId || normalizedPhotos.length === 0) return { skipped: true }
  if (normalizedPhotos.length < 2 || normalizedPhotos.length > 10) {
    throw new Error('Telegram media groups require between 2 and 10 photos')
  }

  const form = new FormData()
  form.append('chat_id', normalizedChatId)
  form.append('media', JSON.stringify(normalizedPhotos.map((item, index) => ({
    type: 'photo',
    media: `attach://photo${index}`,
    ...(item.caption ? {
      caption: item.caption,
      parse_mode: item.parseMode || 'HTML',
    } : {}),
  }))))
  normalizedPhotos.forEach((item, index) => {
    form.append(
      `photo${index}`,
      new Blob([item.photo], { type: 'image/png' }),
      item.filename || `report-${index + 1}.png`
    )
  })

  const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/sendMediaGroup`, {
    method: 'POST',
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.ok === false) {
    throw new Error(body.description || `Telegram sendMediaGroup failed with ${res.status}`)
  }
  return body
}

export function escapeTelegramHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[char])
}

export const TELEGRAM_STATUS_MESSAGES = {
  accepted: '✅ Order accepted',
  preparing: '👨‍🍳 Your order is being prepared',
  ready: '📦 Your order is ready',
  completed: '✅ Order completed',
  cancelled: 'Order cancelled',
}

export async function editTelegramPhoto(chatId, messageId, photo) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('message_id', String(messageId))
  form.append('media', JSON.stringify({ type: 'photo', media: 'attach://photo' }))
  form.append('photo', new Blob([photo], { type: 'image/png' }), 'team-kpi.png')
  const response = await fetch(`https://api.telegram.org/bot${getBotToken()}/editMessageMedia`, { method: 'POST', body: form })
  const body = await response.json()
  if (!response.ok || body.ok === false) {
    if (/message is not modified/i.test(body.description || '')) return body
    throw new Error(body.description || 'Telegram image update failed')
  }
  return body
}
