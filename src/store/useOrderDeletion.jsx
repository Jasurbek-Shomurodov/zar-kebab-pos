import React, { useCallback, useEffect, useRef, useState } from 'react'

const labels = {
  uz: ['Buyurtmani o‘chirish', 'O‘chirish sababi', 'Bekor qilish', 'O‘chirish', 'Investor Telegram guruhiga yuboriladi.'],
  ru: ['Удалить заказ', 'Причина удаления', 'Отмена', 'Удалить', 'Будет отправлено в Telegram-группу инвесторов.'],
  en: ['Delete order', 'Reason for deletion', 'Cancel', 'Delete', 'This will be sent to the investor Telegram group.'],
}

// All order deletion entry points must pass through this confirmation boundary.
export function useOrderDeletion(dispatch, lang) {
  const pending = useRef(null)
  const previousFocus = useRef(null)
  const [request, setRequest] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!request) return
    return () => previousFocus.current?.focus?.()
  }, [request])
  const guardedDispatch = useCallback(action => {
    if (action.type !== 'DELETE_ORDER') return dispatch(action)
    if (pending.current) return Promise.resolve({ error: new Error('Order deletion dialog is already open') })
    return new Promise(resolve => {
      pending.current = resolve
      previousFocus.current = document.activeElement
      setReason('')
      setError('')
      setRequest(action)
    })
  }, [dispatch])
  const finish = result => {
    pending.current?.(result)
    pending.current = null
    setRequest(null)
  }
  const copy = labels[lang] || labels.uz
  const dialog = request && (
    <div className="fixed inset-0 z-critical flex items-center justify-center bg-black/50 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="delete-order-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onKeyDown={event => {
          if (event.key === 'Escape' && !busy) finish({ error: new Error('Deletion cancelled'), cancelled: true })
          if (event.key === 'Tab') {
            const controls = [...event.currentTarget.querySelectorAll('textarea:not(:disabled), button:not(:disabled)')]
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}
        onSubmit={async event => {
          event.preventDefault()
          if (!reason.trim() || busy) return
          setBusy(true)
          setError('')
          try {
            const payload = typeof request.payload === 'string' ? { orderId: request.payload } : request.payload
            const result = await dispatch({ ...request, payload: { ...payload, reason: reason.trim() } })
            if (result?.error) setError(result.error.message || String(result.error))
            else finish(result)
          } catch (failure) { setError(failure.message || String(failure)) }
          finally { setBusy(false) }
        }}>
        <h2 id="delete-order-title" className="text-xl font-bold">{copy[0]}</h2>
        <p className="mt-2 text-sm text-gray-500">{copy[4]}</p>
        <label className="mt-4 block font-semibold" htmlFor="delete-order-reason">{copy[1]}</label>
        <textarea id="delete-order-reason" autoFocus required maxLength={1000} value={reason}
          disabled={busy} onChange={event => setReason(event.target.value)}
          className="mt-2 w-full rounded-xl border border-gray-300 p-3" rows={4} />
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => finish({ error: new Error('Deletion cancelled'), cancelled: true })}
            className="rounded-xl border px-4 py-2">{copy[2]}</button>
          <button disabled={busy || !reason.trim()} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? '…' : copy[3]}</button>
        </div>
      </form>
    </div>
  )
  return { guardedDispatch, deletionDialog: dialog }
}
