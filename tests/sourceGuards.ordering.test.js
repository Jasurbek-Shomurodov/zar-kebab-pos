import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { functionBody, readSource, root, sourceFiles } from './helpers/sourceGuard.js'

test('CartPanel exposes in-flight send state from its parent', () => {
  const source = readSource('src/components/CartPanel.jsx')
  const body = functionBody(source, 'CartPanel')

  assert.match(source, /function CartPanel\(\{[\s\S]*isSending = false[\s\S]*onSendingChange[\s\S]*\}\)/)
  assert.match(body, /onSendingChange\?\.\(true\)/)
  assert.match(body, /onSendingChange\?\.\(false\)/)
  assert.doesNotMatch(body, /const \[isSending,\s*setIsSending\]/)
})

test('submit order writes have a finite timeout before the cart can stay loading forever', () => {
  const appContext = readSource('src/store/AppContext.jsx')
  const cartPanel = readSource('src/components/CartPanel.jsx')
  const db = readSource('src/lib/db.js')
  const idempotencyMigration = readSource('migrations/096_idempotent_kitchen_submissions.sql')
  const timeout = readSource('src/lib/writeTimeout.js')

  assert.match(timeout, /export const POS_WRITE_TIMEOUT_MS = \d+/)
  assert.match(timeout, /POSWriteTimeoutError/)
  assert.match(timeout, /Promise\.race/)
  assert.match(timeout, /controller\?\.abort\(timeoutError\)/)
  assert.match(appContext, /withWriteTimeout\(signal => writeToSupabase\(action, stateSnapshot, \{ signal \}\), action\.type\)/)
  assert.match(appContext, /isWriteTimeoutError\(error\)/)
  assert.match(appContext, /KITCHEN_SUBMISSION_CONFIRM_TIMEOUT_MS = \d+/)
  assert.match(appContext, /waitForKitchenRoundSubmission\(action, \{[\s\S]*signal,/)
  assert.match(appContext, /PENDING_KITCHEN_SUBMISSION_STORAGE_KEY/)
  assert.match(appContext, /const pendingAttempt = pendingKitchenSubmissionRef\.current/)
  assert.match(appContext, /enriched = \{ \.\.\.pendingAttempt, _kitchenSubmissionRetry: true \}/)
  assert.match(appContext, /_submittedByUserId: sessionUserIdRef\.current/)
  assert.match(appContext, /function assertKitchenSubmissionUser\(action\)/)
  assert.match(appContext, /async function writeKitchenAttempt\(action, stateSnapshot\) \{\s*assertKitchenSubmissionUser\(action\)/)
  assert.match(appContext, /refreshedSession\?\.user\?\.id/)
  assert.match(appContext, /POS_KITCHEN_SUBMISSION_USER_CHANGED/)
  assert.match(appContext, /_tableId: isOffPremise \? null : stateRef\.current\.currentTableId/)
  assert.match(appContext, /_cart: Array\.isArray\(action\._cart\)/)
  assert.match(appContext, /error\.kitchenSubmissionUnresolved = true/)
  assert.match(appContext, /error\?\.status[\s\S]*error\?\.statusCode[\s\S]*error\?\.code/)
  assert.match(appContext, /\(408\|425\|429\|5\\d\{2\}\)/)
  assert.match(appContext, /bad gateway\|gateway timeout\|service unavailable/)
  assert.match(appContext, /await writeAttempt\(action, stateRef\.current\)/)
  assert.match(appContext, /recoveredAfterUnknown: true/)
  assert.match(appContext, /const initiatingUserStillActive = expectedUserId && sessionUserIdRef\.current === expectedUserId/)
  assert.match(appContext, /if \(initiatingUserStillActive && !err\?\.kitchenSubmissionUnresolved\)/)
  assert.match(appContext, /_kitchenSubmissionReconciled: true/)
  assert.match(appContext, /if \(action\._kitchenSubmissionRetry\)[\s\S]*waitForKitchenRoundSubmission\(action, \{ signal, attempts: 1 \}\)/)
  assert.match(db, /function withAbortSignal\(query, signal\)/)
  assert.match(db, /withAbortSignal\(supabase\.rpc\('submit_order_to_kitchen'/)
  assert.match(db, /signal: options\.signal/)
  assert.match(db, /export async function confirmKitchenRoundSubmission/)
  assert.match(db, /\.from\('order_kitchen_rounds'\)[\s\S]*\.select\('item_ids'\)[\s\S]*POS_KITCHEN_RECEIPT_MISMATCH/)
  assert.match(db, /\.eq\('order_id', identity\.orderId\)[\s\S]*\.eq\('kitchen_round_id', identity\.kitchenRoundId\)[\s\S]*\.in\('id', identity\.itemIds\)/)
  assert.match(db, /\.from\('order_item_cancellations'\)[\s\S]*\.in\('order_item_id', missingItemIds\)/)
  assert.match(db, /export async function waitForKitchenRoundSubmission/)
  assert.match(db, /const tableId\s+= action\._tableId \?\? state\.currentTableId/)
  assert.match(db, /const \{ data: existingOrder, error: existingOrderError \} = await withAbortSignal[\s\S]*if \(existingOrderError\) throw existingOrderError[\s\S]*const subtotal/)
  assert.doesNotMatch(cartPanel, /retrySubmissionRef/)
  assert.match(cartPanel, /const \{ state, dispatch, pendingKitchenSubmission \} = useApp\(\)/)
  assert.match(cartPanel, /const submitAction = pendingKitchenSubmission \|\|/)
  assert.match(cartPanel, /Retry submission/)
  assert.match(appContext, /const submissionCart = Array\.isArray\(action\._cart\) \? action\._cart : stateRef\.current\.cart/)
  assert.match(appContext, /_items: action\._items \|\| submissionCart\.map/)
  assert.match(appContext, /return \{ error: err, action: enriched \}/)
  assert.match(db, /kitchen_round_id: action\._kitchenRoundId/)
  assert.match(appContext, /if \(confirmationError\?\.kitchenSubmissionUnresolved\) throw confirmationError/)
  assert.match(idempotencyMigration, /target_kitchen_round_id/)
  assert.match(idempotencyMigration, /pg_advisory_xact_lock/)
  assert.match(idempotencyMigration, /kitchen_round_id = target_kitchen_round_id/)
  assert.match(idempotencyMigration, /then\s+return;/)
})

test('WaiterOrder locks menu mutations while order send is pending', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')

  assert.match(source, /const \[isSendingOrder,\s*setSendingOrder\]/)
  assert.match(source, /const orderLocked = isSendingOrder \|\| !!pendingKitchenSubmission/)
  assert.match(functionBody(source, 'handleAdd'), /if \(orderLocked \|\| !canEditTables\) return/)
  assert.match(functionBody(source, 'handleIncrement'), /if \(orderLocked \|\| !canEditTables\) return/)
  assert.match(functionBody(source, 'handleDecrement'), /if \(orderLocked \|\| !canEditTables\) return/)
  assert.match(source, /<BottomTableChips[\s\S]*disabled=\{orderLocked\}/)
  assert.match(source, /if \(!orderLockedRef\.current\) dispatch\(\{ type: 'CLEAR_CART' \}\)/)
  assert.match(source, /const isManageOrderOnly = [^\n]+&& !pendingKitchenSubmission/)
  assert.match(source, /!shouldOpenOrderPanel && !pendingKitchenSubmission/)
  assert.match(readSource('src/store/AppContext.jsx'), /pendingKitchenCartSnapshot\(enriched\)[\s\S]*REPLACE_CART/)
})

test('orders reducer clears only the sent cart snapshot after kitchen submit', () => {
  const source = readSource('src/store/ordersReducer.js')

  assert.match(source, /removeSentCartItems\(state\.cart,\s*cartItems\)/)
  assert.match(source, /const existingItemIds = new Set/)
  assert.match(source, /items: \[\.\.\.\(o\.items \|\| \[\]\), \.\.\.newCartItems\]/)
  assert.match(source, /const tableId = isOffPremise \? null : \(action\._tableId \|\| state\.currentTableId\)/)
  assert.match(source, /cartItems\.length === 0/)
  assert.match(source, /if \(action\._kitchenSubmissionReconciled\) \{\s*return \{ \.\.\.state, cart: removeSentCartItems\(state\.cart, cartItems\) \}/)
  assert.match(source, /const exactRoundAlreadyLoaded =/)
  assert.match(source, /if \(exactRoundAlreadyLoaded\) \{\s*return \{ \.\.\.state, cart: removeSentCartItems\(state\.cart, cartItems\) \}/)
  assert.match(source, /if \(exactOrder && isPaidOrder\(exactOrder\)\) return state/)
  assert.doesNotMatch(source, /orders: nextOrders,\s*cart: \[\]/)
})

test('AppContext delegates state changes to domain reducers', () => {
  const source = readSource('src/store/AppContext.jsx')

  assert.match(source, /const domainReducers = \[/)
  assert.match(source, /settingsReducer/)
  assert.match(source, /appMetaReducer/)
  assert.match(source, /tablesReducer/)
  assert.match(source, /menuReducer/)
  assert.match(source, /cartReducer/)
  assert.match(source, /ordersReducer/)
  assert.doesNotMatch(functionBody(source, 'reducer'), /switch \(action\.type\)/)
})

test('kitchen submit RPC migration protects paid orders from late item inserts', () => {
  const source = readSource('migrations/018_submit_order_to_kitchen_rpc.sql')

  assert.match(source, /payment_status <> 'paid'/)
  assert.match(source, /raise exception 'order % is already paid or unavailable'/)
})

test('WaiterTables keeps urgent status sections before available tables', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /const SECTION_ORDER = \['ready', 'preparing', 'waiting_kitchen', 'needs_bill', 'reserved', 'occupied', 'available'\]/)
  assert.match(source, /SECTION_ORDER\s*\n\s*\.map\(status =>/)
})

test('WaiterTables orders waiting and needs-bill cards by opened time', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const tableManagement = readSource('src/lib/tableManagement.js')
  const sorter = functionBody(tableManagement, 'sortWaiterTableInfosByOpenedTime')

  assert.match(source, /sortWaiterTableInfosByOpenedTime\(/)
  assert.match(sorter, /\['waiting_kitchen', 'needs_bill'\]\.includes\(status\)/)
  assert.match(sorter, /counts\?\.createdAt/)
  assert.match(sorter, /openedAtB - openedAtA/)
})

test('WaiterTables refreshes operational data whenever the waiter returns', () => {
  const appContext = readSource('src/store/AppContext.jsx')
  const db = readSource('src/lib/db.js')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')
  const performHydration = functionBody(appContext, 'performHydration')

  assert.match(appContext, /const refreshPOSData = useCallback\(function refreshPOSData\(\)/)
  assert.match(appContext, /refreshPOSDataRef\.current = \(\) =>/)
  assert.match(appContext, /loadOperationalTableData\(\)/)
  assert.match(appContext, /if \(tableRefreshPromise\) return tableRefreshPromise/)
  assert.match(appContext, /value=\{\{ state, dispatch: guardedDispatch, refreshPOSData, pendingKitchenSubmission \}\}/)
  assert.match(appContext, /useOrderDeletion\(dbDispatch, state.lang\)/)
  assert.match(db, /export async function loadOperationalTableData\(\)/)
  assert.doesNotMatch(performHydration, /refreshSupabaseSession\(\)/)
  assert.match(waiterTables, /const \{ state, dispatch, refreshPOSData \} = useApp\(\)/)
  assert.match(waiterTables, /useEffect\(\(\) => \{\s*refreshPOSData\(\)/)
  assert.match(waiterTables, /event\.persisted\) refreshPOSData\(\)/)
})

test('WaiterTables ready-card total uses shared payment math instead of stale stored totals', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const getPreparationCounts = functionBody(source, 'getPreparationCounts')

  assert.match(source, /import \{ getOrderTotal \} from '\.\.\/lib\/analytics'/)
  assert.match(getPreparationCounts, /total: active\.reduce\(\(s, o\) => s \+ getOrderTotal\(o\), 0\)/)
  assert.doesNotMatch(getPreparationCounts, /Number\(o\.total\)/)
})

test('WaiterTables elapsed label uses server item time before stale client submitted time', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const getPreparationCounts = functionBody(source, 'getPreparationCounts')

  assert.match(source, /formatElapsedSince/)
  assert.match(source, /getReliableOrderItemTime/)
  assert.match(source, /earliestReliableTime/)
  assert.match(getPreparationCounts, /const pendingItemTimes = active\.flatMap/)
  assert.match(getPreparationCounts, /getReliableOrderItemTime\(i, o\)/)
  assert.match(getPreparationCounts, /createdAt: earliestReliableTime\(pendingItemTimes\) \|\| earliestReliableTime\(billableItemTimes\) \|\| earliestReliableTime\(orderTimes\)/)
  assert.doesNotMatch(getPreparationCounts, /i\.submitted_at \|\| i\.submittedAt \|\| i\.created_at/)
  assert.doesNotMatch(getPreparationCounts, /createdAt: active\.reduce\(\(earliest, o\)/)
})

test('dashboard omits order lists while bill requests preserve activity timestamps', () => {
  const source = readSource('src/pages/AdminDashboard.jsx')
  const appContext = readSource('src/store/AppContext.jsx')
  const reducer = readSource('src/store/ordersReducer.js')
  assert.doesNotMatch(source, /RecentOrderRow|recentOrderGroups|recentOrders/)
  assert.match(appContext, /_statusChangedAt: action\._statusChangedAt \|\| new Date\(\)\.toISOString\(\)/)
  assert.match(reducer, /status: 'needs_bill', updated_at: statusChangedAt/)
})

test('elapsed labels use timezone-safe instant parsing instead of browser-local timestamp math', () => {
  const files = [
    'src/pages/WaiterTables.jsx',
    'src/pages/CashierTables.jsx',
    'src/pages/CashierBill.jsx',
  ]

  for (const file of files) {
    const source = readSource(file)
    assert.match(source, /formatElapsedSince|parseInstantDate/, `${file} should use shared instant helpers`)
    assert.doesNotMatch(source, /Date\.now\(\)\s*-\s*new Date\(/, `${file} should not calculate elapsed time with browser-local parsing`)
  }
})

test('AdminDashboard defaults to today period', () => {
  const source = readSource('src/pages/AdminDashboard.jsx')
  const analytics = readSource('src/lib/dashboardAnalytics.js')
  assert.match(source, /const \[period, setPeriod\]\s*=\s*useState\('today'\)/)
  assert.doesNotMatch(source, /const \[period, setPeriod\]\s*=\s*useState\('7days'\)/)
  assert.doesNotMatch(source, /getDashboardPeriodCafeIncome|selectedPeriodCafeIncome|avgDailyCafeIncome/)
  assert.doesNotMatch(source, /icon=\{DollarSign\}/)
  assert.doesNotMatch(source, /avgOrderValue|previousAvgOrder|avgChange/)
  assert.match(analytics, /export function getDashboardPeriodCafeIncome\(orders, period, now = new Date\(\)\)/)
})

test('AdminDashboard omits the Items Today KPI card', () => {
  const source = readSource('src/pages/AdminDashboard.jsx')

  assert.doesNotMatch(source, /periodItemsSold/)
  assert.match(source, /xl:grid-cols-4/)
})

test('AdminDashboard offers a rolling Month from 4 July to the 5 August boundary', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')
  const analytics = readSource('src/lib/dashboardAnalytics.js')

  assert.match(dashboard, /\{ key: 'rollingMonth', label: l\.rollingMonth \}/)
  assert.match(dashboard, /period === 'rollingMonth'/)
  assert.match(dashboard, /formatLongDate\(rollingMonthRange\.dateFrom/)
  assert.match(dashboard, /formatLongDate\(rollingMonthRange\.dateToExclusive/)
  assert.match(analytics, /export function getRollingDashboardMonthRange/)
  assert.match(analytics, /dateFrom = addRestaurantDays\(today, -31\)/)
  assert.match(analytics, /dateToExclusive: addRestaurantDays\(today, 1\)/)
})

test('AdminDashboard does not offer a This Year period filter', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')

  assert.doesNotMatch(dashboard, /\{ key: 'year',\s+label: l\.thisYear\s+\}/)
})

test('AdminDashboard shows period-based order type performance', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')
  const analytics = readSource('src/lib/dashboardAnalytics.js')
  const card = functionBody(dashboard, 'OrderTypePerformanceCard')

  assert.match(analytics, /export function getDashboardOrderTypePerformance\(orders, lang = 'en'\)/)
  assert.match(analytics, /ORDER_TYPE_KEYS/)
  assert.match(analytics, /inferOrderType\(order\)/)
  assert.match(analytics, /getOrderRevenueTotal\(order\)/)
  assert.match(dashboard, /getDashboardOrderTypePerformance/)
  assert.match(dashboard, /const orderTypePerformance = useMemo\(\(\) =>/)
  assert.match(dashboard, /getDashboardOrderTypePerformance\(periodPaidOrders, lang\)/)
  assert.match(dashboard, /<OrderTypePerformanceCard rows=\{orderTypePerformance\} lang=\{lang\} loading=\{analyticsLoading\} \/>/)
  assert.match(card, /ORDER_TYPE_PERFORMANCE_STYLE/)
  assert.match(card, /topKey/)
  assert.match(card, /row\.orders/)
  assert.match(card, /row\.items/)
  assert.match(card, /row\.avgOrder/)
  assert.match(card, /row\.pct/)
})

test('AdminDashboard category sales use the available card height before scrolling', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')

  assert.match(dashboard, /ws-panel col-span-12 xl:col-span-4 flex min-h-0 min-w-0 flex-col/)
  assert.match(dashboard, /min-h-0 flex-1 space-y-2 overflow-y-auto pr-1/)
  assert.doesNotMatch(dashboard, /max-h-\[230px\] space-y-2 overflow-y-auto/)
})

test('AdminDashboard period filter shimmers every range-dependent statistic until its exact history range is loaded', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')

  assert.match(dashboard, /const \[historyLoading, setHistoryLoading\] = useState\(true\)/)
  assert.match(dashboard, /const \[loadedHistoryRangeKey, setLoadedHistoryRangeKey\] = useState\(''\)/)
  assert.match(dashboard, /const analyticsLoading = historyLoading \|\| loadedHistoryRangeKey !== requestedHistoryRangeKey/)
  assert.match(dashboard, /setHistoryLoading\(true\)[\s\S]*loadPaidOrdersForRange/)
  assert.match(dashboard, /setPaidHistoryOrders\(orders\)[\s\S]*setLoadedHistoryRangeKey\(requestRangeKey\)[\s\S]*setHistoryLoading\(false\)/)
  assert.match(dashboard, /\{l\.salesByCategory\} · \{currentKpiPeriodLabel\}/)
  assert.match(dashboard, /<ProductContributionCard[^>]*periodLabel=\{currentKpiPeriodLabel\}/)
  assert.ok((dashboard.match(/aria-busy=\{analyticsLoading\}/g) || []).length >= 3)
  assert.equal((dashboard.match(/loading=\{analyticsLoading\}/g) || []).length, 5)
  assert.match(dashboard, /<BusyHoursCard lang=\{lang\} \/>/)
  assert.match(dashboard, /analyticsLoading \? \([\s\S]*<ChartShimmer \/>/)
  assert.match(dashboard, /analyticsLoading \? \([\s\S]*salesByCategory\.length === 0/)
  assert.match(dashboard, /rows=\{productContribution\}/)
  assert.match(dashboard, /function ShimmerBlock/)
  assert.match(dashboard, /function ChartShimmer/)
  assert.match(dashboard, /function ListShimmer/)
})

test('AdminDashboard omits staff performance and its profile-loading work', () => {
  const dashboard = readSource('src/pages/AdminDashboard.jsx')

  assert.doesNotMatch(dashboard, /Staff Performance|Xodimlar faolligi|Активность персонала/)
  assert.doesNotMatch(dashboard, /getDashboardStaffPerformance|staffPerformance/)
  assert.doesNotMatch(dashboard, /getAllProfiles|staffProfiles/)
})

test('WaiterTables hides zero-value active orders from table cards', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const activeOrdersFilter = functionBody(source, 'getVisibleActiveOrdersForTable')

  assert.match(activeOrdersFilter, /getActiveTableOrders\(tableId, orders\)/)
  const shared = readSource('src/lib/tableGuestEntry.js')
  assert.match(functionBody(shared, 'getActiveTableOrders'), /!isPaidOrder\(order\)/)
  assert.match(functionBody(shared, 'getActiveTableOrders'), /order\?\.status !== 'cancelled'/)
  assert.match(functionBody(shared, 'hasBillableOrderItems'), /billableItems\.length === 0/)
  assert.match(functionBody(shared, 'hasBillableOrderItems'), /getOrderPaymentSummary\(order, billableItems, order\?\.service_rate_pct\)\.total > 0/)
  assert.match(functionBody(source, 'deriveStatus'), /getVisibleActiveOrdersForTable\(tableId, orders\)/)
  assert.match(functionBody(source, 'deriveStatusForTable'), /getVisibleActiveOrdersForTable\(table\.id, orders\)/)
  assert.match(functionBody(source, 'getPreparationCounts'), /getVisibleActiveOrdersForTable\(tableId, orders\)/)
  assert.match(source, /const active = getVisibleActiveOrdersForTable\(table\.id, state\.orders\)/)
})

test('WaiterTables keeps filter chips in requested status order', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /const FILTER_ORDER = \['all', 'available', 'reserved', 'waiting_kitchen', 'preparing', 'ready', 'needs_bill', 'occupied'\]/)
})

test('WaiterTables uses responsive section grids instead of one flat table grid', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5/)
  assert.match(source, /sections\.map\(\(\{ status, items \}\)/)
})

test('WaiterTables groups available tables into ordered zone sections', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /status === 'available'/)
  assert.match(source, /groupTableInfosByZone\(items, visibleZones\)/)
  assert.match(source, /availableZoneGroups\.map\(\(\{ zone: zoneItem, items: zoneItems \}\)/)
  assert.match(source, /tableCountLabel\(lang, zoneItems\.length\)/)
  assert.match(source, /const cardEdge = status === 'available' \? zone\.dot : cfg\.edge/)
})

test('CashierTables groups bills by cashier urgency', () => {
  const source = readSource('src/pages/CashierTables.jsx')
  const cashierBills = readSource('src/lib/cashierBills.js')
  const db = readSource('src/lib/db.js')
  const appContext = readSource('src/store/AppContext.jsx')

  assert.match(source, /from '\.\.\/lib\/cashierBills'/)
  assert.doesNotMatch(source, /function isCashierVisibleBill/)
  assert.match(cashierBills, /function isCashierVisibleBill/)
  assert.match(cashierBills, /!isOffPremiseBill\(order\) && order\.status !== 'needs_bill'/)
  assert.match(cashierBills, /if \(billableItems\.length === 0\) return false/)
  assert.match(cashierBills, /getOrderPaymentSummary\(order, billableItems, order\.service_rate_pct\)\.total > 0/)
  assert.doesNotMatch(source, /function isCashierReadyTakeAway/)
  assert.doesNotMatch(source, /billableItems\.every\(item => \['ready', 'served'\]/)
  assert.match(source, /const raw = state\.orders\.filter\(isCashierVisibleBill\)/)
  assert.match(source, /key: 'needs_bill'[\s\S]*key: 'active'[\s\S]*key: 'take_away'[\s\S]*key: 'delivery'/)
  assert.match(source, /filterStatus === 'active'/)
  assert.match(source, /filterStatus === 'delivery'/)
  assert.match(source, /isDeliveryOrderType/)
  assert.match(source, /function PaidTodaySummary/)
  assert.match(source, /showPaidToday/)
  // Paid today is a Cashier view (top-bar tab after the title, like Menu), kept in ?view=paid.
  assert.match(source, /const showPaidToday = searchParams\.get\('view'\) === 'paid'/)
  assert.match(source, /<WorkspaceTopBar[\s\S]*?badge=\{activeBills\.length\}[\s\S]*?tabs=\{\{[\s\S]*?key: 'paid'/)
  assert.match(source, /\{showPaidToday \? \(\s*<PaidTodaySummary/)
  assert.doesNotMatch(source, /l\.infoBar/)
  assert.match(source, /latest\.map\(order => \{[\s\S]*normalizePriceMode\(order\.price_mode\)[\s\S]*getPriceModeLabel\(priceMode, lang\)/)
  assert.match(source, /getPaidOrderPaymentMethods\(order\)[\s\S]*getOrderPaymentBreakdown\(order\)/)
  assert.match(source, /paymentMethods\.map\(config =>/)
  assert.match(source, /cashier_total: getOrderTotal\(order, getConfiguredServiceRatePct\(state\.settings, order\.price_mode\)\)/)
  assert.match(source, /order\.cashier_total \?\? getOrderTotal\(order\)/)
  assert.match(source, /getCashierBillableItems\(order\)\.length > 0/)
  assert.match(source, /recallTable/)
  assert.match(source, /canMoveBackToTable/)
  assert.match(source, /onRecall=\{canEditCashier && canRecallTable \? handleRecallTable : null\}/)
  assert.match(source, /RECALL_TABLE_FROM_CASHIER/)
  assert.match(source, /deleteErrorByOrderId/)
  assert.match(source, /deleteFailed/)
  assert.doesNotMatch(source, /filteredBills\.map\(order =>/)
  assert.match(db, /function assertUpdatedRows/)
  assert.match(db, /case 'CONFIRM_ORDER_DELIVERED':[\s\S]*if \(ordersError\) throw ordersError[\s\S]*assertUpdatedRows\(deliveredOrders[\s\S]*if \(itemsError\) throw itemsError[\s\S]*assertUpdatedRows\(servedItems/)
  // Bug fix (Jun 2026): uses neq('payment_status','paid') + null fallback so legacy orders are never skipped
  assert.match(db, /case 'MARK_TABLE_NEEDS_BILL':[\s\S]*\.neq\('payment_status', 'paid'\)[\s\S]*\.is\('payment_status', null\)[\s\S]*updateRestaurantTableStatus\(tableId, \{ status: 'needs_bill' \}/)
  assert.match(db, /case 'RECALL_TABLE_FROM_CASHIER':[\s\S]*supabase\.rpc\('recall_table_from_cashier', \{ p_table_id: tableId \}\)/)
  assert.match(appContext, /'RECALL_TABLE_FROM_CASHIER'/)
})

test('CashierTables does not show income or net profit KPIs', () => {
  const source = readSource('src/pages/CashierTables.jsx')

  assert.doesNotMatch(source, /l\.todayRevenue|l\.todayNetProfit|formatProfitKpiValue/)
  assert.doesNotMatch(source, /\.from\('menu_item_costs'\)/)
})

test('CashierTables shows full opened date and time on bill cards', () => {
  const source = readSource('src/pages/CashierTables.jsx')
  const dateTimeLabel = functionBody(source, 'dateTimeLabel')

  assert.match(source, /import \{[^}]*formatDateTime[^}]*formatTime[^}]*\} from '\.\.\/lib\/dateFormat'/)
  assert.match(dateTimeLabel, /return formatDateTime\(iso\)/)
  assert.match(source, /\{dateTimeLabel\(order\.created_at\)\}/)
  assert.doesNotMatch(source, /\{timeLabel\(order\.created_at\)\}/)
})

test('cashier bill item names render in selected language when menu data is available', () => {
  const cashierBill = readSource('src/pages/CashierBill.jsx')
  const cashierTables = readSource('src/pages/CashierTables.jsx')

  assert.match(cashierBill, /function getCashierItemName\(item, menuItem, lang\)/)
  assert.match(cashierBill, /menuItem \? getItemName\(menuItem, lang\) : item\.name/)
  assert.match(cashierBill, /const displayName = getCashierItemName\(item, mi, lang\)/)
  assert.match(cashierBill, /alt=\{displayName\}/)
  assert.match(cashierBill, /\{displayName\}<\/p>/)
  assert.match(cashierTables, /function getCashierItemName\(item, menuItem, lang\)/)
  assert.match(cashierTables, /const displayName = getCashierItemName\(item, mi, lang\)/)
  assert.match(cashierTables, /alt=\{displayName\}/)
  assert.match(cashierTables, /\{displayName\}<\/p>/)
})

test('delivery order type is wired through POS surfaces and reports', () => {
  const orderTypes = readSource('src/lib/orderTypes.js')
  const cartPanel = readSource('src/components/CartPanel.jsx')
  const appContext = readSource('src/store/AppContext.jsx')
  const reducer = readSource('src/store/ordersReducer.js')
  const db = readSource('src/lib/db.js')
  const reports = readSource('src/pages/Reports.jsx')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')
  const waiterOrder = readSource('src/pages/WaiterOrder.jsx')
  const migration = readSource('migrations/045_delivery_order_type.sql')

  assert.match(orderTypes, /delivery: \{ uz: 'Yetkazib berish', ru: 'Доставка', en: 'Delivery' \}/)
  assert.match(cartPanel, /key: 'delivery'/)
  assert.match(appContext, /orderType === 'delivery' \? 'dl' : 'ta'/)
  assert.match(reducer, /isOffPremiseOrderType\(orderType\)/)
  assert.match(db, /orderTypeLabel\(orderType, 'en'\)/)
  assert.match(reports, /key: 'order_types'/)
  assert.match(reports, /function OrderTypesTab/)
  assert.match(reports, /return ORDER_TYPE_KEYS/)
  assert.match(waiterTables, /deliveryOrder: 'Delivery Order'/)
  assert.match(waiterTables, /function handleDelivery\(\)/)
  assert.match(waiterTables, /navigate\('\/waiter\/take-away\?orderType=delivery'\)/)
  assert.match(waiterOrder, /searchParams\.get\('orderType'\)/)
  assert.match(waiterOrder, /setOrderType\(routeOrderType\)/)
  assert.match(migration, /order_type in \('dine_in', 'take_away', 'delivery'\)/)
})

test('local API routes receive server auth and telegram env from Vite', () => {
  const viteConfig = readSource('vite.config.js')
  const telegramOrderStatusApi = readSource('api/telegram/order-status.js')

  assert.match(viteConfig, /'VITE_SUPABASE_URL'/)
  assert.match(viteConfig, /'SUPABASE_URL'/)
  assert.match(viteConfig, /'SUPABASE_SERVICE_ROLE_KEY'/)
  assert.match(viteConfig, /'TELEGRAM_BOT_TOKEN'/)
  assert.match(viteConfig, /'TELEGRAM_COMPLETED_ORDERS_CHAT_ID'/)
  assert.match(viteConfig, /'TELEGRAM_SALARY_PAYMENTS_CHAT_ID'/)
  assert.match(viteConfig, /import notifyTelegramEmployee from '\.\/api\/telegram\/employee-notification\.js'/)
  assert.match(viteConfig, /server\.middlewares\.use\('\/api\/telegram\/employee-notification'/)
  assert.match(viteConfig, /import notifyTelegramOrderStatus from '\.\/api\/telegram\/order-status\.js'/)
  assert.match(viteConfig, /server\.middlewares\.use\('\/api\/telegram\/order-status'/)
  assert.match(viteConfig, /server:\s*\{[\s\S]*port: 5173,[\s\S]*strictPort: true,/)
  assert.match(telegramOrderStatusApi, /items:order_items\(name, menu_item_id, quantity, sale_unit, price, unit_price, (?:cost_price, )?price_mode, selected_options, notes, status\)/)
  assert.match(telegramOrderStatusApi, /\.from\('menu_items'\)[\s\S]*\.select\('id, name_ru, option_groups'\)/)
  assert.match(telegramOrderStatusApi, /getRussianOrderItemDisplayName\(item, menuItem\)/)
  assert.doesNotMatch(telegramOrderStatusApi, /items:order_items\([^)]*name_ru/)
})

test('WaiterTables hides disabled tables and links admins to management', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /\.filter\(table => table\.is_active !== false\)/)
  assert.match(source, /canManageTables/)
  assert.match(source, /navigate\('\/admin\/tables'\)/)
})

test('WaiterTables lets occupied tables request the bill from the card action', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /status === 'occupied'\) return \{ label: tr\(lang, 'requestBill'\)/)
  assert.match(functionBody(source, 'handleCardAction'), /if \(status === 'occupied'\) \{[\s\S]*moveTableToCashier\(table\)/)
  assert.match(functionBody(source, 'moveTableToCashier'), /state\.settings\?\.autoPrint[\s\S]*MARK_TABLE_NEEDS_BILL[\s\S]*result\?\.error[\s\S]*completeBillHandoff/)
  assert.doesNotMatch(source, /prepareBillPrintWindow|window\.open|_blank/)
})

test('WaiterTables lets waiting kitchen orders move to cashier from the card action', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /status === 'waiting_kitchen'\) return \{ label: tr\(lang, 'requestBill'\)/)
  assert.match(functionBody(source, 'handleCardAction'), /if \(status === 'waiting_kitchen'\) \{[\s\S]*moveTableToCashier\(table\)/)
})

test('WaiterTables keeps an explicit manage path for active waiting orders', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const card = functionBody(source, 'TableCard')

  assert.match(source, /manageOrder: 'Manage order'/)
  assert.match(card, /const canManageActiveOrder = \['waiting_kitchen', 'preparing'\]\.includes\(status\)/)
  assert.match(card, /onManage\?\.\(table\)/)
  assert.match(functionBody(source, 'handleManageOrder'), /navigate\(`\/waiter\/order\/\$\{table\.id\}\?panel=order`\)/)
})

test('WaiterTables shows recalled served bills as waiting for waiter edits', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const deriveStatus = functionBody(source, 'deriveStatus')

  assert.match(deriveStatus, /const hasWaitingOrder = active\.some\(o => o\.status === 'sent_to_kitchen'\)/)
  assert.match(deriveStatus, /if \(allServed && hasWaitingOrder\) return 'waiting_kitchen'/)
  assert.match(deriveStatus, /if \(hasWaitingOrder\) return 'waiting_kitchen'[\s\S]*if \(active\.some\(o => o\.status === 'needs_bill'\)\) return 'needs_bill'/)
})

test('WaiterOrder opens the cart drawer from manage-order links', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')

  assert.match(source, /useSearchParams/)
  assert.match(source, /searchParams\.get\('panel'\) === 'order'/)
  assert.match(source, /const isManageOrderPanel = shouldOpenOrderPanel/)
  assert.match(source, /const isManageOrderOnly = !isGuestTabletMode && isManageOrderPanel && cartCount === 0/)
  assert.match(source, /setCartOpen\(true\)/)
  assert.match(source, /!\{?isManageOrderOnly[\s\S]*<CartPanel/)
  assert.match(source, /isManageOrderOnly \? 'flex-1 pt-14' : 'max-h-\[48dvh\] flex-shrink-0'/)
})

test('WaiterOrder shows the current table or order type in the header', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')

  assert.match(source, /const orderTitle = isTakeAwayFlow/)
  assert.match(source, /table\?\.name \|\| table\?\.label/)
  assert.match(source, /\{orderContextLabel\}/)
  assert.match(source, /\{orderTitle\}/)
  assert.match(source, /import AnimatedSearch/)
  assert.match(source, /<AnimatedSearch/)
  assert.match(source, /onChange=\{setSearch\}/)
  assert.match(source, /max-w-\[min\(260px,38vw\)\] flex-shrink/)
  assert.match(source, /min-w-0 truncate whitespace-nowrap/)
  assert.doesNotMatch(source, /ml-auto flex-shrink-0 rounded-xl border font-black/)
})

test('table cart hides order-type controls and Regular or Tourist badges', () => {
  const waiterOrder = readSource('src/pages/WaiterOrder.jsx')
  const cartPanel = readSource('src/components/CartPanel.jsx')

  assert.match(waiterOrder, /allowOrderTypeChange=\{isTakeAwayFlow && !isGuestTabletMode\}/)
  assert.match(waiterOrder, /showOrderBadges=\{isTakeAwayFlow\}/)
  assert.match(cartPanel, /showOrderBadges = true/)
  assert.match(cartPanel, /\{showOrderBadges && \([\s\S]*orderTypeLabel\(orderType, lang\)[\s\S]*getPriceModeLabel\(normalizedPriceMode, lang\)/)
})

test('WaiterOrder ignores empty order shells when resolving table price mode', () => {
  const waiterOrder = readSource('src/pages/WaiterOrder.jsx')
  const tableGuestEntry = readSource('src/lib/tableGuestEntry.js')

  assert.match(tableGuestEntry, /export function getActiveTableOrders\(tableId, orders = \[\]\)/)
  assert.match(waiterOrder, /import \{ getActiveTableOrders \} from '\.\.\/lib\/tableGuestEntry'/)
  assert.match(waiterOrder, /const activeOrders = useMemo\([\s\S]*getActiveTableOrders\(tableId, state\.orders\)/)
  assert.match(waiterOrder, /const activeOrder = useMemo\(\(\) => \{[\s\S]*activeOrders\.length === 0[\s\S]*resolveOrderingPriceMode\(activeOrder, state\.cart\)/)
  assert.doesNotMatch(waiterOrder, /state\.orders\.filter\(o => o\.table_id === tableId && o\.payment_status !== 'paid'\)/)
})

test('AnimatedSearch provides reusable smooth expandable search controls', () => {
  const source = readSource('src/components/AnimatedSearch.jsx')
  const publicMenu = readSource('src/pages/PublicMenu.jsx')
  const waiterOrder = readSource('src/pages/WaiterOrder.jsx')

  assert.match(source, /variant = 'inline'/)
  assert.match(source, /variant === 'overlay'/)
  assert.match(source, /transition-all duration-200 ease-out/)
  assert.match(source, /scale-x-100/)
  assert.match(source, /scale-x-\[0\.08\]/)
  assert.match(source, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/)
  assert.match(source, /buttonRef\.current\?\.getBoundingClientRect\(\)/)
  assert.match(source, /position: 'fixed'/)
  assert.match(source, /floatingMaxWidth = 720/)
  assert.match(source, /width: `min\(calc\(100vw - \$\{Math\.max\(8, Math\.round\(rect\.left\)\)\}px - \$\{floatingInset\}px\), \$\{floatingMaxWidth\}px\)`/)
  assert.doesNotMatch(source, /right: `\$\{floatingInset\}px`/)
  assert.match(source, /floatingBreakpoint = null/)
  assert.match(source, /window\.innerWidth < floatingBreakpoint/)
  assert.match(publicMenu, /function MobileSearchPage/)
  assert.match(publicMenu, /setMobileSearchOpen\(true\)/)
  assert.doesNotMatch(publicMenu, /import AnimatedSearch/)
  assert.doesNotMatch(publicMenu, /className="hidden sm:flex sm:max-w-\[420px\]"/)
  assert.doesNotMatch(publicMenu, /floatingMaxWidth=\{720\}/)
  assert.doesNotMatch(publicMenu, /floatingBreakpoint=\{640\}/)
  assert.doesNotMatch(publicMenu, /variant="overlay"/)
  assert.match(waiterOrder, /<AnimatedSearch/)
})

test('WaiterOrder offers compact mobile grids while keeping tablet product grids at three columns', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')
  const productSection = functionBody(source, 'ProductSection')

  assert.match(productSection, /sm:grid-cols-2 min-\[700px\]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/)
  assert.match(source, /sm:grid-cols-2 min-\[700px\]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/)
  assert.match(productSection, /<div className="hidden h-px min-w-0 flex-1 bg-\[#C9C9C9\] sm:block" \/>/)
  assert.match(productSection, /<h2 className="max-w-\[70%\] flex-shrink-0 text-left text-\[15px\][^"]*sm:text-\[30px\]/)
  assert.match(productSection, /compactMobileGrid \? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-3'/)
  assert.match(source, /compactMobileGrid=\{!isGuestTabletMode && mobileMenuView === 'compact'\}/)
  assert.doesNotMatch(productSection, /\{items\.length\}/)
  assert.doesNotMatch(source, /grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/)
})

test('WaiterOrder animates menu item additions into the cart button', () => {
  const waiterOrderSource = readSource('src/pages/WaiterOrder.jsx')
  const productCardsSource = readSource('src/components/MenuProductCards.jsx')
  const productCard = functionBody(productCardsSource, 'ProductCard')
  const flyingCartItem = functionBody(waiterOrderSource, 'FlyingCartItem')
  const waiterOrder = functionBody(waiterOrderSource, 'WaiterOrder')

  assert.match(productCard, /data-menu-product-card/)
  assert.match(productCard, /data-menu-product-image/)
  assert.match(productCard, /function cartAnimationPayload\(event\)/)
  assert.match(productCard, /onAdd\(item, cartAnimationPayload\(e\)\)/)
  assert.match(productCard, /onIncrement\(item, cartAnimationPayload\(e\)\)/)
  assert.match(waiterOrder, /const \[cartFlyers, setCartFlyers\] = useState\(\[\]\)/)
  assert.match(waiterOrder, /const cartButtonRef = useRef\(null\)/)
  assert.match(waiterOrder, /function playCartAnimation\(item, animation\)/)
  assert.match(waiterOrderSource, /ref=\{cartButtonRef\}/)
  assert.match(waiterOrderSource, /cartFlyers\.map\(flyer =>/)
  assert.match(flyingCartItem, /const \[active, setActive\] = useState\(false\)/)
  assert.match(flyingCartItem, /requestAnimationFrame\(\(\) => setActive\(true\)\)/)
  assert.match(flyingCartItem, /translate3d\(\$\{dx\}px, \$\{dy\}px, 0\) scale\(\$\{targetScale\}\)/)
  assert.match(flyingCartItem, /transition: 'transform 720ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/)
  assert.match(flyingCartItem, /onDone\(flyer\.id\)/)
})

test('WaiterOrder lets active, recalled and requested-bill order items be quantity-adjusted', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')
  const panel = functionBody(source, 'OrderActionPanel')

  assert.match(source, /Minus/)
  assert.match(source, /Plus/)
  assert.match(source, /menuItemMap/)
  assert.match(source, /order_id: item\.order_id \|\| o\.id/)
  assert.match(panel, /const canEditRequestedBill = canEditOrder/)
  assert.match(panel, /const isRecalledWaiting = !inPreparation/)
  assert.match(panel, /function handleUpdateItemQty\(item, qty\)/)
  assert.match(panel, /type: 'UPDATE_BILL_ITEM_QTY'/)
  assert.match(panel, /recalledEditableItems/)
  assert.match(panel, /recalledEditableGroups/)
  assert.match(panel, /requestedBillEditableItems/)
  assert.match(panel, /const preparationGroups = kitchenCheckGroups/)
  assert.match(panel, /const requestedBillEditableGroups = canEditRequestedBill/)
  assert.match(panel, /const recalledEditableGroups = canEditOrder && isRecalledWaiting/)
  assert.match(panel, /preparationGroups\.map\(group/)
  assert.match(panel, /recalledEditableGroups\.map\(group/)
  assert.match(panel, /requestedBillEditableGroups\.map\(group/)
  assert.match(panel, /<OrderItemQtyRow key=\{item\.id \|\| `\$\{group\.roundId\}-\$\{item\.menu_item_id\}`\} item=\{item\} \/>/)
  assert.match(source, /max-h-\[48dvh\][^"]*overflow-y-auto/)
})

test('WaiterOrder distinguishes submitted batches from the unsent cart', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')
  const cartPanel = readSource('src/components/CartPanel.jsx')
  const panel = functionBody(source, 'OrderActionPanel')

  assert.doesNotMatch(panel, /if \(cartCount > 0\) return null/)
  assert.match(source, /const submittedItemCount = \(activeOrder\?\.items \|\| \[\]\)\.reduce/)
  assert.match(source, /const hasSubmittedItems = submittedItemCount > 0/)
  assert.match(source, /`\$\{cartCount\} new · \$\{submittedItemCount\} ordered`/)
  assert.match(source, /`\$\{submittedItemCount\} ordered`/)
  assert.match(source, /hasSubmittedItems=\{hasSubmittedItems\}/)
  assert.match(cartPanel, /hasSubmittedItems = false/)
  assert.match(cartPanel, /No new items/)
  assert.match(cartPanel, /Add items for the next order batch/)
  assert.match(panel, /roundNumber: index \+ 1/)
  assert.match(panel, /l\.roundLabel\(group\.roundNumber\)/)
})

test('WaiterOrder prints cook checks by submitted order round', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')
  const app = readSource('src/App.jsx')
  const kitchenCheckReceipt = readSource('src/pages/KitchenCheckReceipt.jsx')
  const appContext = readSource('src/store/AppContext.jsx')
  const cartPanel = readSource('src/components/CartPanel.jsx')
  const reducer = readSource('src/store/ordersReducer.js')
  const db = readSource('src/lib/db.js')
  const health = readSource('scripts/check-db-health.js')
  const migration = readSource('migrations/044_kitchen_check_round_metadata.sql')
  const panel = functionBody(source, 'OrderActionPanel')

  assert.match(source, /getKitchenCheckGroups/)
  assert.match(app, /const KitchenCheckReceipt = lazy\(\(\) => import\('\.\/pages\/KitchenCheckReceipt'\)\)/)
  assert.match(app, /path="\/kitchen-check\/:orderId"[\s\S]*?<LazyProtectedRoute page="tables"><KitchenCheckReceipt \/><\/LazyProtectedRoute>/)
  assert.match(kitchenCheckReceipt, /function handlePrintKitchenCheck\(delay = 300\)/)
  assert.match(kitchenCheckReceipt, /window\.setTimeout\(\(\) => window\.print\(\), delay\)/)
  assert.match(kitchenCheckReceipt, /const autoPrint = params\.get\('print'\) === '1'/)
  assert.match(kitchenCheckReceipt, /getKitchenCheckGroup\(order, roundId\)/)
  assert.match(kitchenCheckReceipt, /loadKitchenCheckOrder\(orderId/)
  assert.match(kitchenCheckReceipt, /printedRoundRef/)
  assert.doesNotMatch(kitchenCheckReceipt, /groups\.find\([^\n]+\) \|\| groups\[0\]/)
  assert.match(kitchenCheckReceipt, /getItemName\(menuItem, lang\)/)
  assert.match(kitchenCheckReceipt, /getOrderItemOptionLines\(item, menuItem, lang\)/)
  assert.match(kitchenCheckReceipt, /getManualOrderNotes\(item, menuItem, lang\)/)
  assert.match(kitchenCheckReceipt, /className="kitchen-check-print-area bg-white"/)
  assert.match(kitchenCheckReceipt, /padding: '14px 12px'/)
  assert.match(kitchenCheckReceipt, /gridTemplateColumns: 'max-content minmax\(0, 1fr\)'/)
  assert.match(kitchenCheckReceipt, /margin: '7px 0', borderTop: '2px solid #000'/)
  assert.doesNotMatch(kitchenCheckReceipt, /margin: '0 0 16px'/)
  assert.match(cartPanel, /_kitchenRoundId/)
  assert.match(appContext, /const submittedAt = action\._submittedAt \|\| new Date\(\)\.toISOString\(\)/)
  assert.match(appContext, /const kitchenRoundId = action\._kitchenRoundId \|\| `round-\$\{submittedAt\}-/)
  assert.match(appContext, /kitchen_round_id: kitchenRoundId/)
  assert.match(appContext, /submitted_at: submittedAt/)
  assert.match(reducer, /submitted_at: submittedAt/)
  assert.match(db, /submitted_at: null/)
  assert.doesNotMatch(functionBody(db, 'submitOrderToKitchenRpc'), /submitted_at: i\.submitted_at/)
  assert.match(db, /kitchen_round_id: i\.kitchen_round_id/)
  assert.match(migration, /add column if not exists kitchen_round_id/)
  assert.match(migration, /add column if not exists submitted_at/)
  assert.match(migration, /disable trigger guard_paid_order_items/)
  assert.match(migration, /enable trigger guard_paid_order_items/)
  assert.match(migration, /create or replace function public\.submit_order_to_kitchen/)
  assert.match(health, /kitchen_round_id, submitted_at/)
  assert.match(source, /order_number: item\.order_number \|\| o\.order_number/)
  assert.match(source, /waiter_name: item\.waiter_name \|\| o\.waiter_name/)
  assert.match(panel, /const kitchenCheckGroups = getKitchenCheckGroups\(order\)/)
  assert.match(source, /function handlePrintKitchenCheck\(group\)/)
  assert.match(source, /navigate\(`\/kitchen-check\/\$\{encodeURIComponent\(sourceOrderId\)\}\?\$\{params\.toString\(\)\}`\)/)
  assert.match(panel, /onClick=\{\(\) => onPrintKitchenCheck\(group\)\}/)
  assert.match(panel, /const preparationGroups = kitchenCheckGroups[\s\S]*?\.map\(\(group, index\)/)
  assert.match(panel, /key=\{group\.roundId\}/)
  assert.doesNotMatch(panel, /buildKitchenCheckHtml\(\{ group: order/)
  assert.doesNotMatch(panel, /window\.open/)
})

test('cancelled kitchen items stay excluded from billing and operational totals', () => {
  const analytics = readSource('src/lib/analytics.js')
  const cashierBill = readSource('src/pages/CashierBill.jsx')
  const ordersReducer = readSource('src/store/ordersReducer.js')
  const db = readSource('src/lib/db.js')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')
  const migration = readSource('migrations/023_order_item_cancel_status.sql')

  assert.match(analytics, /function isCancelledOrderItem/)
  assert.match(analytics, /billableItems = sourceItems\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(analytics, /if \(isCancelledOrderItem\(item\)\) return/)
  assert.match(cashierBill, /billableItems = allItems\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(cashierBill, /getGroupedOrderItems\(billableItems\)/)
  assert.match(ordersReducer, /status === 'cancelled'[\s\S]*o\.items\.filter\(i => !matchesItem\(i\)\)/)
  assert.match(ordersReducer, /flatMap\(o =>/)
  assert.match(ordersReducer, /shouldRemove/)
  assert.match(ordersReducer, /getOrderPaymentSummary\(nextOrder, nextItems/)
  assert.match(db, /status === 'cancelled'[\s\S]*\.from\('order_items'\)\.delete\(\)/)
  assert.match(db, /order_item_cancellations/)
  assert.match(db, /paymentFields\.total <= 0/)
  assert.match(db, /payment_status: 'cancelled'/)
  assert.match(waiterTables, /\.filter\(i => i\.status !== 'cancelled'\)/)
  assert.match(migration, /drop constraint if exists order_items_status_check/)
  assert.match(migration, /'cancelled'/)
})

test('completed order details do not show kitchen-cancelled items', () => {
  const reports = readSource('src/pages/Reports.jsx')

  assert.match(reports, /isCancelledOrderItem/)
  assert.match(reports, /\(fetchedItems \|\| getOrderItems\(order\)\)\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(reports, /Ordered Items'} \(\{items\.length\}\)/)
})

test('AdminTables protects table history and manages zones', () => {
  const source = readSource('src/pages/AdminTables.jsx')
  const appContext = readSource('src/store/AppContext.jsx')
  const db = readSource('src/lib/db.js')

  assert.match(source, /This table has order history\. You can disable it instead\./)
  assert.match(source, /Do not delete a table while it has active orders\./)
  assert.match(source, /ADD_TABLE_ZONE/)
  assert.match(source, /zone_id/)
  assert.match(source, /is_active/)
  assert.match(source, /loadTableOrderHistoryIds\(\)/)
  assert.match(source, /const canHardDelete = historicalTableIds !== null && !activeOrders && !hasHistory/)
  assert.match(source, /disabled=\{!canHardDelete\}/)
  assert.match(db, /case 'DELETE_TABLE':[\s\S]*\.from\('orders'\)[\s\S]*\.eq\('table_id', action\.payload\)[\s\S]*\.limit\(1\)/)
  assert.match(db, /Disable it instead of deleting it/)
  assert.match(appContext, /'DELETE_TABLE'/)
})

test('AdminTables removes activity badges and supports persisted drag ordering', () => {
  const source = readSource('src/pages/AdminTables.jsx')
  const db = readSource('src/lib/db.js')

  assert.match(source, /DndContext/)
  assert.match(source, /SortableContext/)
  assert.match(source, /useSortable/)
  assert.match(source, /TouchSensor/)
  assert.match(source, /type: 'REORDER_TABLES'/)
  assert.doesNotMatch(source, /ActivityTimeline/)
  assert.doesNotMatch(source, /compactTimelineLabels/)
  assert.match(db, /case 'REORDER_TABLES':/)
  assert.match(db, /from\('restaurant_tables'\)[\s\S]*sort_order: Number\(update\.sort_order\)/)
})

test('table management migration and health check include required columns', () => {
  const migration = readSource('migrations/019_table_management.sql')
  const health = readSource('scripts/check-db-health.js')

  assert.match(migration, /create table if not exists public\.table_zones/)
  assert.match(migration, /add column if not exists zone_id/)
  assert.match(migration, /add column if not exists capacity/)
  assert.match(migration, /add column if not exists is_active/)
  assert.match(health, /restaurant_tables', 'id, name, status, zone_id, zone_name, capacity, sort_order, is_active, reserved_for_name, reserved_for_phone, reserved_at, reserved_until, reservation_notes, created_at, updated_at'/)
  assert.match(health, /table_zones', 'id, name, sort_order, is_active, created_at, updated_at'/)
})

test('table reservation migration and UI are wired', () => {
  const migration = readSource('migrations/020_table_reservations.sql')
  const adminTables = readSource('src/pages/AdminTables.jsx')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')

  assert.match(migration, /status in \('available', 'reserved', 'occupied', 'needs_bill'\)/)
  assert.match(migration, /reserved_for_name/)
  assert.match(migration, /reserved_for_phone/)
  assert.match(migration, /reserved_at/)
  assert.match(adminTables, /Guest name is required for reservations/)
  assert.match(waiterTables, /getWaiterTableStatus/)
  assert.match(waiterTables, /seatReserved/)
})

test('AdminTables localizes visible management labels', () => {
  const source = readSource('src/pages/AdminTables.jsx')

  assert.match(source, /const L = \{/)
  assert.match(source, /title: 'Tables'/)
  assert.match(source, /title: 'Столы'/)
  assert.match(source, /title: 'Stollar'/)
  assert.match(source, /<AppShell title=\{l\.title\}>/)
  assert.match(source, /label=\{l\.tableName\}/)
  assert.match(source, /label=\{l\.zoneSection\}/)
  assert.match(source, /label=\{l\.capacity\}/)
  assert.doesNotMatch(source, />Add table</)
  assert.doesNotMatch(source, />Zones</)
})
