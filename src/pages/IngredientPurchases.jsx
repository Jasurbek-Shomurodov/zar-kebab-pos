import React from 'react'
import AppShell from '../components/AppShell'
import { useIngredientTabs } from '../components/IngredientNavigation'
import IngredientPurchaseSheet from '../components/IngredientPurchaseSheet'
import { useApp } from '../store/AppContext'

export default function IngredientPurchases() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const { title, tabs } = useIngredientTabs(lang)
  return (
    <AppShell title={title} tabs={tabs}>
      <div className="min-h-full bg-[#f6f5f3]">
        <div className="ws-page">
          <IngredientPurchaseSheet lang={lang} />
        </div>
      </div>
    </AppShell>
  )
}
