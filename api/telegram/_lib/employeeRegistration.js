// New employees link Telegram before their salary profile exists (migration
// 248). The bot only records who pressed Start; Salaries creates the profile,
// rate and link together once it sees the registration is linked.

export function employeeRegistrationLinkedMessage() {
  return '✅ Telegram подключён. Администратор завершит добавление сотрудника.'
}

export function employeeRegistrationAlreadyLinkedMessage() {
  return 'Этот Telegram-аккаунт уже привязан к другому сотруднику. Обратитесь к администратору.'
}

// Returns 'linked', 'invalid' (unknown/expired/used token, or already claimed
// by someone else) or 'already_linked' (this Telegram account belongs to an
// existing, non-archived employee).
export async function linkEmployeeRegistration(supabase, { token, user, chat, now = new Date() }) {
  const nowIso = now.toISOString()
  const telegramUserId = String(user.id)
  const { data: registration, error: findError } = await supabase
    .from('employee_telegram_registrations')
    .select('token, telegram_user_id, linked_at')
    .eq('token', token)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .maybeSingle()
  if (findError) throw findError
  if (!registration) return 'invalid'
  if (registration.linked_at && String(registration.telegram_user_id || '') !== telegramUserId) return 'invalid'

  const { data: existingLink, error: linkError } = await supabase
    .from('employee_salary_telegram_links')
    .select('salary_profile_id, salary_profile:employee_salary_profiles(deleted_at)')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()
  if (linkError) throw linkError
  if (existingLink && !existingLink.salary_profile?.deleted_at) return 'already_linked'

  const { data: updated, error: updateError } = await supabase
    .from('employee_telegram_registrations')
    .update({
      telegram_user_id: telegramUserId,
      chat_id: String(chat.id),
      username: user.username || '',
      linked_at: nowIso,
    })
    .eq('token', token)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('token')
    .maybeSingle()
  if (updateError) throw updateError
  return updated ? 'linked' : 'invalid'
}
