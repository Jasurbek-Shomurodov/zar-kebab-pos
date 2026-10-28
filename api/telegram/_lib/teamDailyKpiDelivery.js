import { loadSalaryRows } from '../../../src/lib/salaryData.js'
import { renderTeamDailyKpiImage } from './employeePayrollImages.js'
import { sendTelegramPhoto, editTelegramPhoto } from './telegram.js'

const TABLE = 'daily_team_kpi_image_deliveries'
const resultOf = row => ({
  status: row.status === 'sent' ? 'sent' : 'pending',
  telegramMessageId: row.telegram_message_id,
  sentAt: row.updated_at,
  errorMessage: row.status === 'sent' ? '' : 'Daily KPI image requires reconciliation; do not resend automatically',
})

export async function deliverTeamDailyKpi(supabase, date, chatId) {
  const prepared = await prepareTeamDailyKpi(supabase, date, chatId)
  if (prepared.result) return prepared.result
  // A timeout is an unknown send outcome. Keep the claim held for reconciliation.
  const response = await sendTelegramPhoto(chatId, prepared.photo, { filename: prepared.filename })
  return prepared.finish(response?.result?.message_id)
}

// Claims the date and renders its image but leaves the send to the caller, so
// the morning run can pair it with the unavailable-dishes snapshot in one album.
// Returns { result } when there is nothing to send.
export async function prepareTeamDailyKpi(supabase, date, chatId) {
  if (!chatId) return { result: { status: 'skipped', errorMessage: 'Team group is not configured' } }
  const saved = await supabase.from(TABLE).select('*').eq('business_date', date).maybeSingle()
  if (saved.error) throw saved.error
  if (saved.data) return { result: resultOf(saved.data) }
  // Only a completed immutable run can be published; load all awards, not the
  // caller's retry subset. A unique date claim protects concurrent event retries.
  const run = await supabase.from('employee_daily_kpi_runs').select('business_date').eq('business_date', date).maybeSingle()
  if (run.error) throw run.error
  if (!run.data) throw new Error('Daily KPI run is not finalized')
  const { data, error } = await loadSalaryRows(() => supabase.from('employee_salary_bonuses')
    .select('id, amount, salary_profile:employee_salary_profiles(employee_name)')
    .eq('bonus_date', date).eq('source_type', 'daily_kpi'))
  if (error) throw error
  const items = data.map(b => ({ bonus_id: b.id, employee_name: b.salary_profile?.employee_name || 'Сотрудник', amount: Number(b.amount) }))
  if (!items.length) return { result: { status: 'skipped', errorMessage: 'No KPI awards' } }
  const photo = await renderTeamDailyKpiImage(date, items)
  const claim = await supabase.from(TABLE).insert({ business_date: date, status: 'sending', chat_id: chatId, items }).select('*').single()
  if (claim.error?.code === '23505') {
    const concurrent = await supabase.from(TABLE).select('*').eq('business_date', date).single()
    if (concurrent.error) throw concurrent.error
    return { result: resultOf(concurrent.data) }
  }
  if (claim.error) throw claim.error
  return {
    photo,
    filename: `team-kpi-${date}.png`,
    async finish(messageId) {
      if (!messageId) throw new Error('Telegram did not return a message id')
      const savedSend = await supabase.from(TABLE).update({ status: 'sent', telegram_message_id: String(messageId), updated_at: new Date().toISOString() })
        .eq('business_date', date).eq('status', 'sending').select('*').single()
      if (savedSend.error) throw savedSend.error
      return resultOf(savedSend.data)
    },
  }
}

// Remove only the deleted award from the shared image; never retract everyone
// else's notification when one employee's bonus is deleted.
export async function retractTeamDailyKpiItem(supabase, date, bonusId) {
  const saved = await supabase.from(TABLE).select('*').eq('business_date', date).maybeSingle()
  if (saved.error) throw saved.error
  const row = saved.data
  if (!row || row.status === 'legacy') return
  if (row.status !== 'sent') throw new Error('Team KPI image delivery needs reconciliation before deleting this bonus')
  if (!row.items.some(item => item.bonus_id === bonusId)) return
  const items = row.items.filter(item => item.bonus_id !== bonusId)
  const photo = await renderTeamDailyKpiImage(date, items)
  const claim = await supabase.from(TABLE).update({ status: 'editing' }).eq('business_date', date)
    .eq('status', 'sent').eq('updated_at', row.updated_at).select('*').maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) throw new Error('Team KPI image is being updated; retry later')
  await editTelegramPhoto(row.chat_id, row.telegram_message_id, photo)
  const updated = await supabase.from(TABLE).update({ status: 'sent', items, updated_at: new Date().toISOString() })
    .eq('business_date', date).eq('status', 'editing').select('business_date').single()
  if (updated.error) throw updated.error
}
