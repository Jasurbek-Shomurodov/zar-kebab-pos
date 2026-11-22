import React, { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalKeyboard } from '../lib/modalKeyboard'

const SIZE = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-3xl',
}

/**
 * The one modal surface of the workspace: a pinned title, a scrolling body and a
 * pinned footer, so the title and Save/Cancel stay in view on a 320x568 phone,
 * a landscape phone and with the keyboard up. Layout and states live in
 * src/styles/workspace.css (.ws-dialog-*); see DESIGN.md "Dialogs".
 *
 * variant: "dialog" (centred), "sheet" (bottom sheet on phones, centred from sm)
 * or "alert" (a confirmation: the backdrop does not dismiss it).
 */
export default function WorkspaceDialog({
  title,
  description = null,
  onClose,
  closeLabel,
  variant = 'dialog',
  size = 'md',
  footer = null,
  notice = null,
  busy = false,
  initialFocusRef,
  as: Panel = 'div',
  panelProps = {},
  bodyClassName = '',
  children,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef(null)
  const close = busy ? undefined : onClose
  const onKeyDown = useModalKeyboard({ dialogRef, initialFocusRef, onEscape: close })
  const alert = variant === 'alert'

  return createPortal(
    <div className="ws-dialog-layer" data-variant={variant}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="ws-dialog-backdrop"
        onClick={alert ? undefined : close}
      />
      <Panel
        {...panelProps}
        ref={dialogRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`ws-dialog ws-dialog-panel ${SIZE[size] || SIZE.md}`}
      >
        <header className="ws-dialog-header">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="ws-dialog-title">{title}</h2>
            {description && <p id={descriptionId} className="ws-caption mt-0.5">{description}</p>}
          </div>
          {onClose && closeLabel && (
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label={closeLabel}
              className="ws-btn ws-btn-ghost ws-btn-sm ws-btn-icon"
            >
              <X aria-hidden="true" />
            </button>
          )}
        </header>
        <div className={`ws-dialog-body ${bodyClassName}`}>{children}</div>
        {(footer || notice) && (
          <footer className="ws-dialog-footer">
            {notice}
            {footer && <div className="ws-dialog-actions">{footer}</div>}
          </footer>
        )}
      </Panel>
    </div>,
    document.body
  )
}
