import { useMemo } from 'react'
import { useApp } from './AppContext'
import { countCashierAttentionBills } from '../lib/cashierBills'

export function useAppDataStatus() {
  const { state, retryPOSLoad } = useApp()
  return {
    loaded: state.loaded,
    loadError: state.loadError,
    connectionNotice: state.connectionNotice,
    // Re-runs the first load; use it as the Retry action of a load-error screen.
    retry: retryPOSLoad,
  }
}

export function useOrders() {
  return useApp().state.orders
}

export function useCart() {
  return useApp().state.cart
}

export function useSettings() {
  return useApp().state.settings
}

export function useMenuData() {
  const { state } = useApp()
  return {
    categories: state.categories,
    menuItems: state.menuItems,
  }
}

/** Cashier bills that need attention: shown as the Cashier badge in the drawer and top bar. */
export function useCashierAttentionCount() {
  const orders = useApp().state.orders
  return useMemo(() => countCashierAttentionBills(orders), [orders])
}
