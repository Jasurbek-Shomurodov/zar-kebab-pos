import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { deleteProfile, getAllProfiles, updateProfile } from '../lib/supabase'
import AppShell from '../components/AppShell'
import PageShimmer from '../components/PageShimmer'
import StatusBadge from '../components/StatusBadge'
import { groupTeamProfiles } from '../lib/teamProfiles'
import {
  APP_ROLES,
  FEATURE_DEFINITIONS,
  assignableRoles,
  canDeleteTeamMember,
  canEditTeamMember,
  canManageFeatureAccess,
  featureAccessForProfile,
  updateFeatureAccessSelection,
} from '../lib/permissions'
import { Search, RefreshCw, UserCircle2, Loader2, Eye, Trash2, X, Check, ShieldCheck, ChevronRight } from 'lucide-react'

const STATUSES = ['pending', 'active', 'disabled']
const ROLES = APP_ROLES

const STATUS_LABELS = {
  pending:  { uz: 'Kutilmoqda', ru: 'Ожидает',   en: 'Pending'  },
  active:   { uz: 'Faol',       ru: 'Активен',   en: 'Active'   },
  disabled: { uz: 'Bloklangan', ru: 'Заблокирован', en: 'Disabled' },
}

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',     ru: 'Владелец',   en: 'Owner' },
  admin:       { uz: 'Admin',     ru: 'Админ',      en: 'Admin' },
  viewer:      { uz: 'Ko‘ruvchi', ru: 'Просмотр',   en: 'Viewer' },
  guest:       { uz: 'Mehmon',    ru: 'Гость',      en: 'Guest' },
}

const L = {
  uz: {
    title:       'Jamoa',
    search:      'Ism yoki email...',
    allStatuses: 'Barcha holatlar',
    refresh:     'Yangilash',
    nameEmail:   'Ism / Email',
    role:        'Rol',
    status:      'Holat',
    accountStatus: 'Hisob holati',
    actions:     'Amallar',
    delete:      'O‘chirish',
    confirmDelete: 'Tasdiqlash',
    cancel:      'Bekor qilish',
    deleteHint:  'Hisob butunlay o‘chiriladi. Eski buyurtmalardagi ismlar saqlanadi; qayta ro‘yxatdan o‘tsa, yangi so‘rov sifatida chiqadi.',
    deleteError: 'Foydalanuvchini o‘chirib bo‘lmadi',
    deleted:     'Foydalanuvchi o‘chirildi',
    access:      'Kirish huquqlari',
    accessHelp:  'Bu foydalanuvchi uchun kerakli funksiyalarni yoqing yoki o‘chiring.',
    pageAccess:  'Sahifalarga kirish',
    pageAccessHelp: 'Foydalanuvchi ko‘rishi mumkin bo‘lgan ish bo‘limlari.',
    extraActions: 'Qo‘shimcha amallar',
    extraActionsHelp: 'Bu foydalanuvchi uchun tahrirlash va maxsus ruxsatlar.',
    manageAccess: 'Kirish huquqlari',
    accessSaved: 'Kirish huquqlari saqlandi',
    accessError: 'Kirish huquqlarini saqlab bo‘lmadi',
    noUsers:     'Foydalanuvchilar topilmadi',
    pendingRequests: 'Kutilayotgan so‘rovlar',
    pendingHelp: 'Yangi hisoblar tasdiqlanmaguncha shu yerda ko‘rsatiladi.',
    pendingCount: n => `${n} ta so‘rov`,
    removeAll: 'Hammasini o‘chirish',
    confirmRemoveAll: n => `${n} ta kutilayotgan hisobni o‘chirasizmi?`,
    removedPending: n => `${n} ta kutilayotgan hisob o‘chirildi`,
    removePendingPartial: (removed, failed) => `${removed} ta hisob o‘chirildi, ${failed} tasini o‘chirib bo‘lmadi`,
    you:         '(siz)',
    members:     n => `${n} ta a'zo`,
    editName:    'Ismni o‘zgartirish',
    saveName:    'Ismni saqlash',
    nameRequired: 'Ism bo‘sh bo‘lishi mumkin emas',
    nameSaved:   'Xodim ismi saqlandi',
    nameError:   'Xodim ismini saqlab bo‘lmadi',
    name:        'Ism',
    roleAndStatus: 'Rol va holat',
    close:       'Yopish',
    openMember:  'A’zoni ochish',
  },
  ru: {
    title:       'Команда',
    search:      'Имя или email...',
    allStatuses: 'Все статусы',
    refresh:     'Обновить',
    nameEmail:   'Имя / Email',
    role:        'Роль',
    status:      'Статус',
    accountStatus: 'Статус аккаунта',
    actions:     'Действия',
    delete:      'Удалить',
    confirmDelete: 'Подтвердить',
    cancel:      'Отмена',
    deleteHint:  'Аккаунт будет удалён полностью. Имена в старых заказах сохранятся; повторная регистрация создаст новую заявку.',
    deleteError: 'Не удалось удалить пользователя',
    deleted:     'Пользователь удалён',
    access:      'Доступы',
    accessHelp:  'Включите или выключите нужные функции для этого пользователя.',
    pageAccess:  'Доступ к разделам',
    pageAccessHelp: 'Рабочие разделы, которые пользователь может открывать.',
    extraActions: 'Дополнительные действия',
    extraActionsHelp: 'Права на редактирование и особые действия для этого пользователя.',
    manageAccess: 'Доступы',
    accessSaved: 'Доступы сохранены',
    accessError: 'Не удалось сохранить доступы',
    noUsers:     'Пользователи не найдены',
    pendingRequests: 'Ожидающие заявки',
    pendingHelp: 'Новые аккаунты отображаются здесь до подтверждения.',
    pendingCount: n => `${n} заявок`,
    removeAll: 'Удалить все',
    confirmRemoveAll: n => `Удалить все ожидающие аккаунты (${n})?`,
    removedPending: n => `Удалено ожидающих аккаунтов: ${n}`,
    removePendingPartial: (removed, failed) => `Удалено: ${removed}; не удалось удалить: ${failed}`,
    you:         '(вы)',
    members:     n => `${n} участников`,
    editName:    'Изменить имя',
    saveName:    'Сохранить имя',
    nameRequired: 'Имя не может быть пустым',
    nameSaved:   'Имя сотрудника сохранено',
    nameError:   'Не удалось сохранить имя сотрудника',
    name:        'Имя',
    roleAndStatus: 'Роль и статус',
    close:       'Закрыть',
    openMember:  'Открыть участника',
  },
  en: {
    title:       'Team Members',
    search:      'Search by name or email...',
    allStatuses: 'All statuses',
    refresh:     'Refresh',
    nameEmail:   'Name / Email',
    role:        'Role',
    status:      'Status',
    accountStatus: 'Account Status',
    actions:     'Actions',
    delete:      'Delete',
    confirmDelete: 'Confirm',
    cancel:      'Cancel',
    deleteHint:  'This permanently removes the account. Old order names stay preserved; registering again creates a new request.',
    deleteError: 'Could not delete user',
    deleted:     'User deleted',
    access:      'Feature access',
    accessHelp:  'Enable or disable the features this specific user should have.',
    pageAccess:  'Page access',
    pageAccessHelp: 'Work areas this user can open and view.',
    extraActions: 'Additional actions',
    extraActionsHelp: 'Editing and sensitive permissions for this user.',
    manageAccess: 'Feature access',
    accessSaved: 'Feature access saved',
    accessError: 'Could not save feature access',
    noUsers:     'No users found',
    pendingRequests: 'Pending requests',
    pendingHelp: 'New accounts appear here until an owner approves them.',
    pendingCount: n => `${n} request${n !== 1 ? 's' : ''}`,
    removeAll: 'Remove all',
    confirmRemoveAll: n => `Remove all ${n} pending account${n !== 1 ? 's' : ''}?`,
    removedPending: n => `${n} pending account${n !== 1 ? 's' : ''} removed`,
    removePendingPartial: (removed, failed) => `${removed} removed; ${failed} could not be removed`,
    you:         '(you)',
    members:     n => `${n} member${n !== 1 ? 's' : ''}`,
    editName:    'Edit name',
    saveName:    'Save name',
    nameRequired: 'Name cannot be empty',
    nameSaved:   'Employee name saved',
    nameError:   'Could not save employee name',
    name:        'Name',
    roleAndStatus: 'Role and status',
    close:       'Close',
    openMember:  'Open member',
  },
}

export default function AdminUsers() {
  const { profile: myProfile } = useAuth()
  const { state, refreshPOSData } = useApp()
  const lang   = state.lang
  const l      = L[lang] || L.en
  const myRole = (myProfile?.role || 'guest').toLowerCase()
  const canEditAccess = canManageFeatureAccess(myProfile)

  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving]             = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting]         = useState(null)
  const [confirmRemoveAllPending, setConfirmRemoveAllPending] = useState(false)
  const [removingAllPending, setRemovingAllPending] = useState(false)
  const [notice, setNotice]             = useState(null)
  const [openUserId, setOpenUserId] = useState(null)
  const [editingNameId, setEditingNameId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')

  async function loadUsers() {
    setLoading(true)
    const { data } = await getAllProfiles()
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  useEffect(() => {
    if (!openUserId) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') closeMember() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openUserId])

  function openMember(user) {
    if (removingAllPending || !user?.id) return
    setOpenUserId(user.id)
    setConfirmDeleteId(null)
    setNotice(null)
    if (myRole === 'owner') startNameEdit(user)
    else cancelNameEdit()
  }

  function closeMember() {
    setOpenUserId(null)
    setConfirmDeleteId(null)
    cancelNameEdit()
  }

  async function handleChange(userId, field, value) {
    if (removingAllPending) return
    const target = users.find(u => u.id === userId)
    if (!target || target.id === myProfile?.id) return
    if (!canEditTeamMember(myRole, target.role)) return
    if (field === 'status' && !STATUSES.includes(value)) return
    if (field === 'status' && value === 'pending' && target.status !== 'pending') return
    if (field === 'role' && !assignableRoles(myRole).includes(value)) return

    // Guard: prevent removing/disabling the last active owner
    if (target?.role === 'owner') {
      const activeOwners = users.filter(u => u.role === 'owner' && u.status !== 'disabled')
      if (field === 'status' && value === 'disabled' && activeOwners.length <= 1) return
      if (field === 'role' && value !== 'owner' && activeOwners.length <= 1) return
    }
    const updates = { [field]: value }
    if (field === 'role' && myRole === 'owner' && !['owner', 'admin'].includes(value)) {
      const pageFeatureKeys = new Set(FEATURE_DEFINITIONS.filter(feature => feature.kind === 'page').map(feature => feature.key))
      updates.feature_access = featureAccessForProfile(target).filter(key => pageFeatureKeys.has(key))
    }

    setSaving(userId)
    setNotice(null)
    const { error } = await updateProfile(userId, updates)
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.accessError })
      setSaving(null)
      return
    }
    setUsers(u => u.map(x => x.id === userId ? { ...x, ...updates } : x))
    setSaving(null)
  }

  async function handleFeatureAccessChange(user, featureKey, enabled) {
    if (!canEditAccess || removingAllPending || user.id === myProfile?.id) return
    const currentAccess = featureAccessForProfile(user)
    const nextAccess = updateFeatureAccessSelection(currentAccess, featureKey, enabled)

    setSaving(user.id)
    setNotice(null)
    const { error } = await updateProfile(user.id, { feature_access: nextAccess })
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.accessError })
      setSaving(null)
      return
    }
    setUsers(list => list.map(row => row.id === user.id ? { ...row, feature_access: nextAccess } : row))
    setSaving(null)
    setNotice({ tone: 'success', message: l.accessSaved })
  }

  function startNameEdit(user) {
    if (myRole !== 'owner' || removingAllPending || !user?.id) return
    setEditingNameId(user.id)
    setNameDraft(user.full_name || '')
    setNotice(null)
  }

  function cancelNameEdit() {
    setEditingNameId(null)
    setNameDraft('')
  }

  async function saveName(user) {
    if (myRole !== 'owner' || removingAllPending || !user?.id) return
    const fullName = nameDraft.trim().replace(/\s+/g, ' ')
    if (!fullName) {
      setNotice({ tone: 'error', message: l.nameRequired })
      return
    }
    if (fullName === String(user.full_name || '').trim()) return

    setSaving(user.id)
    setNotice(null)
    const { error } = await updateProfile(user.id, { full_name: fullName })
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.nameError })
      setSaving(null)
      return
    }
    setUsers(list => list.map(row => row.id === user.id ? { ...row, full_name: fullName } : row))
    setSaving(null)
    setNameDraft(fullName)
    setNotice({ tone: 'success', message: l.nameSaved })
    refreshPOSData().catch(error => console.warn('[team] waiter name refresh failed:', error))
  }

  async function handleDelete(user) {
    if (removingAllPending || !canDeleteTeamMember(myProfile, user, user.id === myProfile?.id)) return
    setDeleting(user.id)
    setNotice(null)
    const { error } = await deleteProfile(user.id)
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.deleteError, userId: user.id })
      setDeleting(null)
      return
    }
    setUsers(list => list.filter(row => row.id !== user.id))
    setConfirmDeleteId(null)
    closeMember()
    setDeleting(null)
    setNotice({ tone: 'success', message: l.deleted })
  }

  async function handleRemoveAllPending() {
    if (!canEditAccess || removingAllPending) return
    const targets = users.filter(user =>
      user.status === 'pending'
      && canDeleteTeamMember(myProfile, user, user.id === myProfile?.id)
    )
    if (targets.length === 0) {
      setConfirmRemoveAllPending(false)
      return
    }

    setRemovingAllPending(true)
    setNotice(null)
    const removedIds = []
    let failed = 0

    for (const target of targets) {
      const { error } = await deleteProfile(target.id, { expectedStatus: 'pending' })
      if (error) failed += 1
      else removedIds.push(target.id)
    }

    if (removedIds.length > 0) {
      const removed = new Set(removedIds)
      setUsers(list => list.filter(user => !removed.has(user.id)))
    }
    if (failed > 0) await loadUsers()

    setRemovingAllPending(false)
    setConfirmRemoveAllPending(false)
    setNotice({
      tone: failed > 0 ? 'error' : 'success',
      message: failed > 0
        ? l.removePendingPartial(removedIds.length, failed)
        : l.removedPending(removedIds.length),
    })
  }

  const { members, pendingRequests } = groupTeamProfiles(users, search, statusFilter)
  const allPendingRequests = users.filter(user => user.status === 'pending')
  const displayedUsers = [...members, ...pendingRequests]
  const openUser = users.find(user => user.id === openUserId) || null
  const pageFeatures = FEATURE_DEFINITIONS.filter(feature => feature.kind === 'page')
  const statusLabelFor = status => (STATUS_LABELS[status]?.[lang] || STATUS_LABELS[status]?.en) ?? status
  const roleLabelFor = role => (ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en) ?? role

  function renderFeatureToggles(user, features, featureAccess, disabled) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {features.map(feature => {
          const enabled = featureAccess.includes(feature.key)
          return (
            <label
              key={feature.key}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white p-3 transition-colors ${
                enabled ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={disabled}
                onChange={event => handleFeatureAccessChange(user, feature.key, event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-[#ff5a00] focus:ring-[#ff5a00]"
              />
              <span className="min-w-0">
                <span className="block text-xs font-black text-gray-900">
                  {feature.labels[lang] || feature.labels.en}
                </span>
                <span className="block text-[11px] font-medium leading-snug text-gray-400">
                  {feature.description[lang] || feature.description.en}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    )
  }

  function renderMemberDialog(user) {
    const isMe       = user.id === myProfile?.id
    const isSaving   = saving === user.id
    const canEditRoleStatus = !isMe && canEditTeamMember(myRole, user.role)
    const canDelete  = canDeleteTeamMember(myProfile, user, isMe)
    const isDeleting = deleting === user.id
    const isConfirmingDelete = confirmDeleteId === user.id
    const isEditingName = editingNameId === user.id
    const busy = isSaving || isDeleting || removingAllPending
    const statusOptions = user.status === 'pending' ? STATUSES : ['active', 'disabled']
    const roleOptions = assignableRoles(myRole)
    const featureAccess = featureAccessForProfile(user)
    const actionFeatures = FEATURE_DEFINITIONS.filter(feature => {
      if (!['owner', 'admin'].includes(user.role)) return false
      if (feature.kind !== 'action') return false
      const hasRequired = (feature.requires || []).every(key => featureAccess.includes(key))
      const hasRequiredAny = !feature.requiresAny?.length || feature.requiresAny.some(key => featureAccess.includes(key))
      return hasRequired && hasRequiredAny
    })
    const nameChanged = nameDraft.trim().replace(/\s+/g, ' ') !== String(user.full_name || '').trim()

    return (
      <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
        <button type="button" aria-label={l.close} onClick={closeMember}
          className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm" />
        <div role="dialog" aria-modal="true" aria-labelledby="team-member-title"
          className="ws-dialog relative flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-b-2xl">
          <div className="flex items-start gap-3 border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#1a1a1a]">
              <span className="text-sm font-black text-white">
                {(user.full_name || user.email || '?')[0].toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="team-member-title" className="truncate text-lg font-black text-gray-900">
                {user.full_name || '—'} {isMe && <span className="text-xs font-bold text-[#ff5a00]">{l.you}</span>}
              </h2>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={user.status} />
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{roleLabelFor(user.role)}</span>
              </div>
            </div>
            {isSaving && <Loader2 size={16} className="mt-2 animate-spin text-[#ff5a00]" />}
            <button type="button" onClick={closeMember} aria-label={l.close}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            {notice?.tone === 'error' && notice.userId === user.id && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {notice.message}
              </p>
            )}
            {notice && !notice.userId && (
              <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm font-semibold ${
                notice.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {notice.message}
              </p>
            )}

            {myRole === 'owner' && isEditingName && (
              <section>
                <label htmlFor="team-member-name" className="mb-1.5 block text-xs font-black text-gray-700">{l.name}</label>
                <div className="flex gap-2">
                  <input
                    id="team-member-name"
                    type="text"
                    value={nameDraft}
                    onChange={event => setNameDraft(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') saveName(user) }}
                    autoComplete="off"
                    maxLength={120}
                    disabled={busy}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-base font-semibold text-gray-900 focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:opacity-60 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => saveName(user)}
                    disabled={busy || !nameDraft.trim() || !nameChanged}
                    className="inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white transition-opacity disabled:opacity-40"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {l.saveName}
                  </button>
                </div>
              </section>
            )}

            {canEditRoleStatus && (
              <section>
                <p className="mb-1.5 text-xs font-black text-gray-700">{l.roleAndStatus}</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={ROLES.includes(user.role) ? user.role : 'guest'}
                    disabled={busy}
                    onChange={e => handleChange(user.id, 'role', e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={l.role}
                  >
                    {roleOptions.map(role => (
                      <option key={role} value={role}>{roleLabelFor(role)}</option>
                    ))}
                  </select>
                  <select
                    value={user.status || 'pending'}
                    disabled={busy}
                    onChange={e => handleChange(user.id, 'status', e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={l.accountStatus}
                  >
                    {statusOptions.map(s => (
                      <option key={s} value={s}>{statusLabelFor(s)}</option>
                    ))}
                  </select>
                </div>
              </section>
            )}

            {canEditAccess && !isMe && (
              <section>
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-600">
                  <ShieldCheck size={14} className="text-[#ff5a00]" />
                  {l.access}
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{featureAccess.length}</span>
                </p>
                <div className="mb-2 mt-3">
                  <p className="text-xs font-black text-gray-700">{l.pageAccess}</p>
                  <p className="text-[11px] font-medium text-gray-400">{l.pageAccessHelp}</p>
                </div>
                {renderFeatureToggles(user, pageFeatures, featureAccess, busy)}
                {actionFeatures.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="mb-2">
                      <p className="text-xs font-black text-gray-700">{l.extraActions}</p>
                      <p className="text-[11px] font-medium text-gray-400">{l.extraActionsHelp}</p>
                    </div>
                    {renderFeatureToggles(user, actionFeatures, featureAccess, busy)}
                  </div>
                )}
              </section>
            )}
          </div>

          {canDelete && (
            <div className="border-t border-gray-100 px-5 py-4 sm:px-6">
              {isConfirmingDelete ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium leading-snug text-red-500">{l.deleteHint}</p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={busy}
                      className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {l.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      disabled={busy}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {l.confirmDelete}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteId(user.id)
                    setNotice(null)
                  }}
                  disabled={busy}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {l.delete}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <AppShell title={l.title}>
      <div className="w-full px-4 py-5 sm:px-5 lg:px-6">

        {/* Read-only notice for non-editors */}
        {!['owner', 'admin'].includes(myRole) && (
          <div className="flex items-center gap-2.5 mb-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-700">
            <Eye size={15} className="flex-shrink-0" />
            <span className="font-medium">
              {lang === 'uz' ? 'Faqat ko\'rish huquqi — hisob holati va kirish huquqlarini o\'zgartirib bo\'lmaydi.'
               : lang === 'ru' ? 'Только просмотр — изменение статуса аккаунта и доступов недоступно.'
              : 'View-only access — you cannot change account statuses or feature access.'}
            </span>
          </div>
        )}

        {notice && !openUserId && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            notice.tone === 'error'
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-green-100 bg-green-50 text-green-700'
          }`}>
            {notice.message}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={l.search}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
          >
            <option value="all">{l.allStatuses}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
            ))}
          </select>
          <button
            onClick={loadUsers}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {l.refresh}
          </button>
        </div>

        {/* Count */}
        {statusFilter !== 'pending' && (
          <p className="text-xs text-gray-400 mb-4">{l.members(members.length)}</p>
        )}

        {/* Table */}
        {loading ? (
          <PageShimmer layout="table" className="!p-0" />
        ) : displayedUsers.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <UserCircle2 size={44} className="mx-auto mb-3 opacity-20" />
            <p>{l.noUsers}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid md:grid-cols-[40px_minmax(0,1fr)_120px_96px_20px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">#</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.nameEmail}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.status}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{canEditAccess ? l.access : ''}</p>
              <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {displayedUsers.map((user, index) => {
                const startsPendingSection = pendingRequests.length > 0 && index === members.length
                const isMe       = user.id === myProfile?.id
                const isSaving   = saving === user.id
                const isOpen     = openUserId === user.id
                const accessCount = featureAccessForProfile(user).length

                return (
                  <React.Fragment key={user.id}>
                    {startsPendingSection && (
                      <div className={`border-[#faf9f7] bg-orange-50/60 px-4 py-4 sm:px-5 ${members.length > 0 ? 'border-t-8' : ''}`}>
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <div>
                            <h2 className="text-sm font-black text-gray-900">{l.pendingRequests}</h2>
                            <p className="mt-0.5 text-xs font-medium text-gray-500">{l.pendingHelp}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700">
                              {l.pendingCount(pendingRequests.length)}
                            </span>
                            {canEditAccess && !confirmRemoveAllPending && (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmRemoveAllPending(true)
                                  setNotice(null)
                                }}
                                disabled={removingAllPending || allPendingRequests.length === 0}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Trash2 size={13} />
                                {l.removeAll}
                              </button>
                            )}
                            {canEditAccess && confirmRemoveAllPending && (
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <span className="text-[11px] font-bold text-red-600">
                                  {l.confirmRemoveAll(allPendingRequests.length)}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleRemoveAllPending}
                                  disabled={removingAllPending}
                                  className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-2.5 py-1.5 text-[11px] font-black text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {removingAllPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  {l.confirmDelete}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveAllPending(false)}
                                  disabled={removingAllPending}
                                  title={l.cancel}
                                  className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-1.5 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  <button
                    type="button"
                    onClick={() => openMember(user)}
                    disabled={removingAllPending}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    aria-label={`${l.openMember}: ${user.full_name || user.email}`}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors sm:px-5 md:grid md:grid-cols-[40px_minmax(0,1fr)_120px_96px_20px] md:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a00]/40 disabled:cursor-not-allowed ${
                      isSaving || isOpen ? 'bg-orange-50/50' : 'hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <span className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-black text-gray-500">
                      {index + 1}
                    </span>
                    {/* Name / Email */}
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a1a1a]">
                        <span className="text-white text-xs font-black">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-sm font-bold text-gray-900">{user.full_name || '—'}</span>
                          {isMe && <span className="flex-shrink-0 text-[10px] font-bold text-[#ff5a00]">{l.you}</span>}
                        </span>
                        <span className="block truncate text-xs text-gray-400">{user.email}</span>
                        <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide text-gray-400">{roleLabelFor(user.role)}</span>
                      </span>
                    </span>

                    {/* Current status badge */}
                    <span className="flex-shrink-0">
                      <StatusBadge status={user.status} />
                    </span>

                    <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
                      {canEditAccess && !isMe && (
                        <>
                          <ShieldCheck size={14} className="text-gray-400" />
                          {accessCount}
                        </>
                      )}
                    </span>

                    {isSaving
                      ? <Loader2 size={16} className="flex-shrink-0 animate-spin text-[#ff5a00]" />
                      : <ChevronRight size={18} className="flex-shrink-0 text-gray-300" />}
                  </button>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {openUser && renderMemberDialog(openUser)}
    </AppShell>
  )
}
