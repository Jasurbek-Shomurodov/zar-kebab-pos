import React from 'react'
import AppShell from '../components/AppShell'
import { useIngredientTabs } from '../components/IngredientNavigation'
import IngredientMovement from '../components/IngredientMovement'
import { useApp } from '../store/AppContext'

export default function IngredientUsage() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const { title, tabs } = useIngredientTabs(lang)
  return (
    <AppShell title={title} tabs={tabs}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <IngredientMovement lang={lang} />
        </div>
      </div>
    </AppShell>
  )
}
