import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { deleteProfile, getAllProfiles, updateProfile } from '../lib/supabase'
import AppShell from '../components/AppShell'
import WorkspaceDialog from '../components/WorkspaceDialog'
import { OperationalError } from '../components/OperationalState'
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
import { Search, RefreshCw, UserCircle2, Loader2, Eye, Trash2, Check, ShieldCheck, ChevronRight } from 'lucide-react'

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

// Russian needs three forms: 1 заявка, 2 заявки, 5 заявок.
function ruPlural(n, one, few, many) {
  const mod10 = Math.abs(n) % 10
  const mod100 = Math.abs(n) % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** A stored notice is a label key plus arguments, so it follows the language. */
function noticeText(labels, notice) {
  const value = labels[notice.key]
  return typeof value === 'function' ? value(...(notice.args || [])) : value
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
    confirmDelete: 'Hisobni o‘chirish',
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
    saving:      'Saqlanmoqda',
    changeError: 'O‘zgarishni saqlab bo‘lmadi. Qayta urinib ko‘ring.',
    loadFailed:  'Jamoani yuklab bo‘lmadi',
    readOnly:    'Faqat ko‘rish huquqi: hisob holati va kirish huquqlarini o‘zgartirib bo‘lmaydi.',
    noUsersHint: 'Xodim tizimga ro‘yxatdan o‘tgach, shu yerda paydo bo‘ladi.',
    noUsersFilteredHint: 'Qidiruv yoki holat filtriga mos hisob yo‘q.',
    clearFilters: 'Filtrlarni tozalash',
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
    confirmDelete: 'Удалить аккаунт',
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
    pendingCount: n => `${n} ${ruPlural(n, 'заявка', 'заявки', 'заявок')}`,
    removeAll: 'Удалить все',
    confirmRemoveAll: n => `Удалить все ожидающие аккаунты (${n})?`,
    removedPending: n => `Удалено ожидающих аккаунтов: ${n}`,
    removePendingPartial: (removed, failed) => `Удалено: ${removed}; не удалось удалить: ${failed}`,
    you:         '(вы)',
    members:     n => `${n} ${ruPlural(n, 'участник', 'участника', 'участников')}`,
    editName:    'Изменить имя',
    saveName:    'Сохранить имя',
    nameRequired: 'Имя не может быть пустым',
    nameSaved:   'Имя сотрудника сохранено',
    nameError:   'Не удалось сохранить имя сотрудника',
    name:        'Имя',
    roleAndStatus: 'Роль и статус',
    close:       'Закрыть',
    openMember:  'Открыть участника',
    saving:      'Сохранение',
    changeError: 'Не удалось сохранить изменение. Попробуйте ещё раз.',
    loadFailed:  'Не удалось загрузить команду',
    readOnly:    'Только просмотр: изменить статус аккаунта и доступы нельзя.',
    noUsersHint: 'Сотрудник появится здесь после регистрации в системе.',
    noUsersFilteredHint: 'Нет аккаунтов, подходящих под поиск или фильтр статуса.',
    clearFilters: 'Сбросить фильтры',
  },
  en: {
    title:       'Team members',
    search:      'Search by name or email...',
    allStatuses: 'All statuses',
    refresh:     'Refresh',
    nameEmail:   'Name / Email',
    role:        'Role',
    status:      'Status',
    accountStatus: 'Account status',
    actions:     'Actions',
    delete:      'Delete',
    confirmDelete: 'Delete account',
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
    saving:      'Saving',
    changeError: 'Could not save the change. Try again.',
    loadFailed:  'Could not load the team',
    readOnly:    'View-only access: you cannot change account statuses or feature access.',
    noUsersHint: 'A staff member appears here after registering in the app.',
    noUsersFilteredHint: 'No account matches the search or the status filter.',
    clearFilters: 'Clear filters',
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

  const [loadFailed, setLoadFailed]     = useState(false)

  async function loadUsers() {
    setLoading(true)
    setLoadFailed(false)
    const { data, error } = await getAllProfiles()
    if (error) {
      // A failed load is an error with a retry, never an empty team.
      console.error('[team] load failed:', error)
      setLoadFailed(true)
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

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
      console.error('[team] profile update failed:', error)
      setNotice({ tone: 'error', key: 'changeError' })
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
      console.error('[team] feature access update failed:', error)
      setNotice({ tone: 'error', key: 'accessError' })
      setSaving(null)
      return
    }
    setUsers(list => list.map(row => row.id === user.id ? { ...row, feature_access: nextAccess } : row))
    setSaving(null)
    setNotice({ tone: 'success', key: 'accessSaved' })
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
      setNotice({ tone: 'error', key: 'nameRequired' })
      return
    }
    if (fullName === String(user.full_name || '').trim()) return

    setSaving(user.id)
    setNotice(null)
    const { error } = await updateProfile(user.id, { full_name: fullName })
    if (error) {
      console.error('[team] name update failed:', error)
      setNotice({ tone: 'error', key: 'nameError' })
      setSaving(null)
      return
    }
    setUsers(list => list.map(row => row.id === user.id ? { ...row, full_name: fullName } : row))
    setSaving(null)
    setNameDraft(fullName)
    setNotice({ tone: 'success', key: 'nameSaved' })
    refreshPOSData().catch(error => console.warn('[team] waiter name refresh failed:', error))
  }

  async function handleDelete(user) {
    if (removingAllPending || !canDeleteTeamMember(myProfile, user, user.id === myProfile?.id)) return
    setDeleting(user.id)
    setNotice(null)
    const { error } = await deleteProfile(user.id)
    if (error) {
      console.error('[team] account deletion failed:', error)
      setNotice({ tone: 'error', key: 'deleteError', userId: user.id })
      setDeleting(null)
      return
    }
    setUsers(list => list.filter(row => row.id !== user.id))
    setConfirmDeleteId(null)
    closeMember()
    setDeleting(null)
    setNotice({ tone: 'success', key: 'deleted' })
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
      if (error) { console.error('[team] pending account deletion failed:', error); failed += 1 }
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
      key: failed > 0 ? 'removePendingPartial' : 'removedPending',
      args: failed > 0 ? [removedIds.length, failed] : [removedIds.length],
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
              className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[10px] border bg-white p-3 transition-colors ${
                enabled ? 'border-[#ff5a00]/50 bg-[#fff1e8]' : 'border-[#e4e1de] hover:border-[#dcd9d6]'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={disabled}
                onChange={event => handleFeatureAccessChange(user, feature.key, event.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 accent-[#cc4800]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[#22201d]">
                  {feature.labels[lang] || feature.labels.en}
                </span>
                <span className="block text-xs leading-snug text-[#68655f]">
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

    const memberNotice = notice && (notice.userId ? notice.userId === user.id : true) ? notice : null
    const dialogNotice = (memberNotice || isConfirmingDelete) ? (
      <div className="grid gap-2">
        {notice?.tone === 'error' && notice.userId === user.id && (
          <p role="alert" className="ws-notice ws-tone-negative">{noticeText(l, notice)}</p>
        )}
        {memberNotice && !memberNotice.userId && (
          <p role={memberNotice.tone === 'error' ? 'alert' : 'status'} className={`ws-notice ${memberNotice.tone === 'error' ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
            {noticeText(l, memberNotice)}
          </p>
        )}
        {isConfirmingDelete && <p className="text-sm text-[#c4262c]">{l.deleteHint}</p>}
      </div>
    ) : null
    const dialogFooter = canDelete ? (
      isConfirmingDelete ? (
        <>
          <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={busy} className="ws-btn ws-btn-outline">
            {l.cancel}
          </button>
          <button type="button" onClick={() => handleDelete(user)} disabled={busy} className="ws-btn ws-btn-danger-solid">
            {isDeleting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
            {l.confirmDelete}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirmDeleteId(user.id)
            setNotice(null)
          }}
          disabled={busy}
          className="ws-btn ws-btn-ghost ws-btn-danger mr-auto"
        >
          <Trash2 size={16} aria-hidden="true" />
          {l.delete}
        </button>
      )
    ) : null

    return (
      <WorkspaceDialog
        variant="sheet"
        size="xl"
        title={<>{user.full_name || '—'} {isMe && <span className="text-xs font-medium text-[#bf4300]">{l.you}</span>}</>}
        description={user.email}
        onClose={closeMember}
        closeLabel={l.close}
        busy={isDeleting}
        notice={dialogNotice}
        footer={dialogFooter}
        bodyClassName="space-y-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={user.status} />
          <span className="ws-caption">{roleLabelFor(user.role)}</span>
          {isSaving && <Loader2 size={16} className="animate-spin text-[#bf4300]" aria-label={l.saving} />}
        </div>

        {myRole === 'owner' && isEditingName && (
          <section>
            <label htmlFor="team-member-name" className="ws-caption mb-1.5 block font-medium">{l.name}</label>
            <div className="flex flex-wrap gap-2">
              <input
                id="team-member-name"
                type="text"
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') saveName(user) }}
                autoComplete="off"
                maxLength={120}
                disabled={busy}
                className="ws-input min-w-0 flex-1 basis-48"
              />
              <button
                type="button"
                onClick={() => saveName(user)}
                disabled={busy || !nameDraft.trim() || !nameChanged}
                className="ws-btn ws-btn-primary flex-shrink-0"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                {l.saveName}
              </button>
            </div>
          </section>
        )}

        {canEditRoleStatus && (
          <section>
            <p className="ws-caption mb-1.5 font-medium">{l.roleAndStatus}</p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={ROLES.includes(user.role) ? user.role : 'guest'}
                disabled={busy}
                onChange={e => handleChange(user.id, 'role', e.target.value)}
                className="ws-input"
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
                className="ws-input"
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
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#22201d]">
              <ShieldCheck size={14} className="text-[#ff5a00]" aria-hidden="true" />
              {l.access}
              <span className="ws-count tabular-nums">{featureAccess.length}</span>
            </p>
            <div className="mb-2 mt-3">
              <p className="text-sm font-medium text-[#22201d]">{l.pageAccess}</p>
              <p className="ws-caption">{l.pageAccessHelp}</p>
            </div>
            {renderFeatureToggles(user, pageFeatures, featureAccess, busy)}
            {actionFeatures.length > 0 && (
              <div className="mt-4 border-t border-[#e4e1de] pt-4">
                <div className="mb-2">
                  <p className="text-sm font-medium text-[#22201d]">{l.extraActions}</p>
                  <p className="ws-caption">{l.extraActionsHelp}</p>
                </div>
                {renderFeatureToggles(user, actionFeatures, featureAccess, busy)}
              </div>
            )}
          </section>
        )}
      </WorkspaceDialog>
    )
  }

  const filtersActive = search.trim() !== '' || statusFilter !== 'all'

  return (
    <AppShell title={l.title}>
      <div className="w-full px-4 py-5 sm:px-5 lg:px-6">

        {/* Read-only notice for non-editors */}
        {!['owner', 'admin'].includes(myRole) && (
          <div className="ws-notice ws-tone-info mb-4 flex items-center gap-2.5">
            <Eye size={15} className="flex-shrink-0" aria-hidden="true" />
            <span>{l.readOnly}</span>
          </div>
        )}

        {notice && !openUserId && (
          <div role={notice.tone === 'error' ? 'alert' : 'status'} className={`ws-notice mb-4 ${notice.tone === 'error' ? 'ws-tone-negative' : 'ws-tone-positive'}`}>
            {noticeText(l, notice)}
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68655f]" aria-hidden="true" />
            <input
              type="search"
              placeholder={l.search}
              aria-label={l.search}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="ws-input !pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label={l.status}
            className="ws-input !w-auto min-w-0 flex-1 basis-40 sm:flex-none"
          >
            <option value="all">{l.allStatuses}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
            ))}
          </select>
          <button type="button" onClick={loadUsers} disabled={loading} className="ws-btn ws-btn-outline">
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {l.refresh}
          </button>
        </div>

        {/* Count */}
        {!loading && !loadFailed && statusFilter !== 'pending' && (
          <p className="ws-caption mb-3 tabular-nums">{l.members(members.length)}</p>
        )}

        {/* Table */}
        {loading ? (
          <PageShimmer layout="table" className="!p-0" />
        ) : loadFailed ? (
          <OperationalError lang={lang} title={l.loadFailed} onAction={loadUsers} />
        ) : displayedUsers.length === 0 ? (
          <div className="ws-empty">
            <UserCircle2 aria-hidden="true" />
            <h3>{l.noUsers}</h3>
            {filtersActive ? (
              <>
                <p>{l.noUsersFilteredHint}</p>
                <button type="button" onClick={() => { setSearch(''); setStatusFilter('all') }} className="ws-btn ws-btn-outline">{l.clearFilters}</button>
              </>
            ) : (
              <p>{l.noUsersHint}</p>
            )}
          </div>
        ) : (
          <div className="ws-panel ws-panel-flush">
            {/* Table header */}
            <div className="ws-table-head hidden gap-4 px-5 py-2.5 md:grid md:grid-cols-[40px_minmax(0,1fr)_120px_96px_20px]">
              <p>#</p>
              <p>{l.nameEmail}</p>
              <p>{l.status}</p>
              <p>{canEditAccess ? l.access : ''}</p>
              <span />
            </div>

            {/* Rows */}
            <div>
              {displayedUsers.map((user, index) => {
                const startsPendingSection = pendingRequests.length > 0 && index === members.length
                const isMe       = user.id === myProfile?.id
                const isSaving   = saving === user.id
                const isOpen     = openUserId === user.id
                const accessCount = featureAccessForProfile(user).length

                return (
                  <React.Fragment key={user.id}>
                    {startsPendingSection && (
                      <div className={`border-[#f6f5f3] bg-[#efece9] px-4 py-4 sm:px-5 ${members.length > 0 ? 'border-t-8' : ''}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1 basis-56">
                            <h2 className="text-sm font-semibold text-[#22201d]">{l.pendingRequests}</h2>
                            <p className="ws-caption">{l.pendingHelp}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="ws-status ws-tone-caution tabular-nums">
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
                                className="ws-btn ws-btn-ghost ws-btn-danger ws-btn-sm"
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                {l.removeAll}
                              </button>
                            )}
                            {canEditAccess && confirmRemoveAllPending && (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="text-sm font-medium text-[#c4262c]">
                                  {l.confirmRemoveAll(allPendingRequests.length)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveAllPending(false)}
                                  disabled={removingAllPending}
                                  className="ws-btn ws-btn-outline ws-btn-sm"
                                >
                                  {l.cancel}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRemoveAllPending}
                                  disabled={removingAllPending}
                                  className="ws-btn ws-btn-danger-solid ws-btn-sm"
                                >
                                  {removingAllPending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                                  {l.removeAll}
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
                    className={`ws-row flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5 md:grid md:grid-cols-[40px_minmax(0,1fr)_120px_96px_20px] md:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff5a00]/40 disabled:cursor-not-allowed ${
                      isSaving || isOpen ? 'bg-[#fff1e8]' : ''
                    }`}
                  >
                    <span className="hidden h-8 w-8 items-center justify-center rounded-lg bg-[#efece9] text-xs font-medium tabular-nums text-[#68655f] md:flex">
                      {index + 1}
                    </span>
                    {/* Name / Email */}
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#22201d]" aria-hidden="true">
                        <span className="text-xs font-semibold text-white">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-sm font-semibold text-[#22201d]">{user.full_name || '—'}</span>
                          {isMe && <span className="flex-shrink-0 text-xs font-medium text-[#bf4300]">{l.you}</span>}
                        </span>
                        <span className="block truncate text-xs text-[#68655f]">{user.email}</span>
                        <span className="mt-0.5 block text-xs text-[#68655f]">{roleLabelFor(user.role)}</span>
                      </span>
                    </span>

                    {/* Current status badge */}
                    <span className="flex-shrink-0">
                      <StatusBadge status={user.status} />
                    </span>

                    <span className="hidden items-center gap-1.5 text-xs font-medium tabular-nums text-[#68655f] md:inline-flex">
                      {canEditAccess && !isMe && (
                        <>
                          <ShieldCheck size={14} aria-hidden="true" />
                          {accessCount}
                        </>
                      )}
                    </span>

                    {isSaving
                      ? <Loader2 size={16} className="flex-shrink-0 animate-spin text-[#bf4300]" aria-hidden="true" />
                      : <ChevronRight size={18} className="flex-shrink-0 text-[#68655f]" aria-hidden="true" />}
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
