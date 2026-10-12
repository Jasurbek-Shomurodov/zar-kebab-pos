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
import { Search, RefreshCw, UserCircle2, Loader2, Eye, Trash2, X, Check, ShieldCheck, ChevronDown, Pencil } from 'lucide-react'

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
  const [expandedAccessId, setExpandedAccessId] = useState(null)
  const [editingNameId, setEditingNameId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')

  async function loadUsers() {
    setLoading(true)
    const { data } = await getAllProfiles()
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

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
    if (fullName === String(user.full_name || '').trim()) {
      cancelNameEdit()
      return
    }

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
    cancelNameEdit()
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

  return (
    <AppShell title={l.title}>
      <div className="w-full max-w-[1280px] mx-auto px-4 py-5 sm:px-5 lg:px-6">

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

        {notice && (
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
            <div className="hidden xl:grid xl:grid-cols-[48px_minmax(240px,1fr)_100px_minmax(540px,580px)] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">#</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.nameEmail}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.status}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.actions}</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {displayedUsers.map((user, index) => {
                const startsPendingSection = pendingRequests.length > 0 && index === members.length
                const isMe       = user.id === myProfile?.id
                const isSaving   = saving === user.id
                const canEditRoleStatus = !isMe && canEditTeamMember(myRole, user.role)
                const canDelete  = canDeleteTeamMember(myProfile, user, isMe)
                const isDeleting = deleting === user.id
                const isConfirmingDelete = confirmDeleteId === user.id
                const isAccessExpanded = expandedAccessId === user.id
                const isEditingName = editingNameId === user.id
                const statusLabel = (STATUS_LABELS[user.status]?.[lang] || STATUS_LABELS[user.status]?.en) ?? user.status
                const statusOptions = user.status === 'pending' ? STATUSES : ['active', 'disabled']
                const roleLabel = (ROLE_LABELS[user.role]?.[lang] || ROLE_LABELS[user.role]?.en) ?? user.role
                const roleOptions = assignableRoles(myRole)
                const featureAccess = featureAccessForProfile(user)
                const pageFeatures = FEATURE_DEFINITIONS.filter(feature => feature.kind === 'page')
                const actionFeatures = FEATURE_DEFINITIONS.filter(feature => {
                  if (!['owner', 'admin'].includes(user.role)) return false
                  if (feature.kind !== 'action') return false
                  const hasRequired = (feature.requires || []).every(key => featureAccess.includes(key))
                  const hasRequiredAny = !feature.requiresAny?.length || feature.requiresAny.some(key => featureAccess.includes(key))
                  return hasRequired && hasRequiredAny
                })
                const accessCount = featureAccess.length

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
                  <div
                    className={`grid grid-cols-1 xl:grid-cols-[48px_minmax(240px,1fr)_100px_minmax(540px,580px)] gap-3 xl:gap-4 items-center px-4 py-4 sm:px-5 transition-colors ${
                      isSaving ? 'bg-orange-50/50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="hidden xl:flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-black text-gray-500">
                      {index + 1}
                    </div>
                    {/* Name / Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-gray-100 px-1.5 text-[11px] font-black text-gray-500 xl:hidden">
                        {index + 1}
                      </span>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a1a1a]">
                        <span className="text-white text-xs font-black">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {isEditingName ? (
                          <div className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="text"
                              value={nameDraft}
                              onChange={event => setNameDraft(event.target.value)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') saveName(user)
                                if (event.key === 'Escape') cancelNameEdit()
                              }}
                              autoFocus
                              autoComplete="off"
                              className="h-8 min-w-0 flex-1 rounded-lg border border-orange-300 bg-white px-2 text-sm font-bold text-gray-900 outline-none ring-2 ring-orange-100"
                              aria-label={l.editName}
                              disabled={isSaving}
                            />
                            <button
                              type="button"
                              onClick={() => saveName(user)}
                              disabled={isSaving || !nameDraft.trim()}
                              title={l.saveName}
                              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#ff5a00] text-white disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelNameEdit}
                              disabled={isSaving}
                              title={l.cancel}
                              className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-50"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-sm text-gray-900 truncate">
                              {user.full_name || '—'}
                            </p>
                            {isMe && <span className="text-[10px] text-[#ff5a00] font-bold">{l.you}</span>}
                            {myRole === 'owner' && (
                              <button
                                type="button"
                                onClick={() => startNameEdit(user)}
                                disabled={isSaving || removingAllPending}
                                title={l.editName}
                                aria-label={`${l.editName}: ${user.full_name || user.email}`}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-orange-50 hover:text-[#ff5a00] disabled:opacity-50"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{roleLabel}</p>
                      </div>
                    </div>

                    {/* Current status badge */}
                    <div>
                      <StatusBadge status={user.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:flex-nowrap">
                      {isSaving && <Loader2 size={15} className="animate-spin text-[#ff5a00]" />}
                      {canEditRoleStatus && (
                        <select
                          value={ROLES.includes(user.role) ? user.role : 'guest'}
                          disabled={isSaving || removingAllPending}
                          onChange={e => handleChange(user.id, 'role', e.target.value)}
                          className="h-10 w-[124px] flex-shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                          title={l.role}
                        >
                          {roleOptions.map(role => (
                            <option key={role} value={role}>{(ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en) ?? role}</option>
                          ))}
                        </select>
                      )}
                      {canEditRoleStatus ? (
                        <select
                          value={user.status || 'pending'}
                          disabled={isSaving || removingAllPending}
                          onChange={e => handleChange(user.id, 'status', e.target.value)}
                          className="h-10 w-[124px] flex-shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                          title={l.accountStatus}
                        >
                          {statusOptions.map(s => (
                            <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex h-10 flex-shrink-0 items-center rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs font-semibold text-gray-600">
                          {statusLabel}
                        </span>
                      )}
                      {canEditAccess && !isMe && (
                        <button
                          type="button"
                          onClick={() => setExpandedAccessId(current => current === user.id ? null : user.id)}
                          disabled={removingAllPending}
                          className={`inline-flex h-10 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-black transition-colors ${
                            isAccessExpanded
                              ? 'border-orange-200 bg-orange-50 text-[#ff5a00]'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <ShieldCheck size={14} />
                          <span>{l.manageAccess}</span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{accessCount}</span>
                          <ChevronDown size={14} className={`transition-transform ${isAccessExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canDelete && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(user.id)
                            setNotice(null)
                          }}
                          disabled={isDeleting || removingAllPending}
                          title={l.delete}
                          className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-black text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          <span>{l.delete}</span>
                        </button>
                      )}
                      {canDelete && isConfirmingDelete && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(user)}
                            disabled={isDeleting || removingAllPending}
                            title={l.confirmDelete}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-600 px-2.5 py-2 text-xs font-black text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {l.confirmDelete}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={isDeleting || removingAllPending}
                            title={l.cancel}
                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-black text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {canDelete && isConfirmingDelete && (
                      <p className="xl:col-start-4 text-xs font-medium leading-snug text-red-500">
                        {l.deleteHint}
                      </p>
                    )}
                    {notice?.tone === 'error' && notice.userId === user.id && (
                      <p role="alert" className="xl:col-span-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                        {notice.message}
                      </p>
                    )}
                    {canEditAccess && !isMe && isAccessExpanded && (
                      <div className="xl:col-span-4 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-600">
                              <ShieldCheck size={14} className="text-[#ff5a00]" />
                              {l.access}
                            </p>
                            <p className="mt-0.5 text-xs font-medium leading-snug text-gray-400">{l.accessHelp}</p>
                          </div>
                        </div>
                        <div className="mb-2">
                          <p className="text-xs font-black text-gray-700">{l.pageAccess}</p>
                          <p className="text-[11px] font-medium text-gray-400">{l.pageAccessHelp}</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {pageFeatures.map(feature => {
                            const enabled = featureAccessForProfile(user).includes(feature.key)
                            return (
                              <label
                                key={feature.key}
                                className={`flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 transition-colors ${
                                  enabled ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  disabled={isSaving || removingAllPending}
                                  onChange={event => handleFeatureAccessChange(user, feature.key, event.target.checked)}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff5a00] focus:ring-[#ff5a00]"
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
                        {actionFeatures.length > 0 && (
                          <div className="mt-4 border-t border-gray-200 pt-4">
                            <div className="mb-2">
                              <p className="text-xs font-black text-gray-700">{l.extraActions}</p>
                              <p className="text-[11px] font-medium text-gray-400">{l.extraActionsHelp}</p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {actionFeatures.map(feature => {
                                const enabled = featureAccess.includes(feature.key)
                                return (
                                  <label
                                    key={feature.key}
                                    className={`flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 transition-colors ${
                                      enabled ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={enabled}
                                      disabled={isSaving || removingAllPending}
                                      onChange={event => handleFeatureAccessChange(user, feature.key, event.target.checked)}
                                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff5a00] focus:ring-[#ff5a00]"
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
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
