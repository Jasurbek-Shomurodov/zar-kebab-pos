// Accounting, Salaries and Employees share one top-bar title and tab row,
// like Menu's Menu Items / Categories tabs.
const LABELS = {
  uz: { title: 'Buxgalteriya', overview: 'Umumiy', salaries: 'Maoshlar', employees: 'Xodimlar' },
  ru: { title: 'Бухгалтерия', overview: 'Обзор', salaries: 'Зарплаты', employees: 'Сотрудники' },
  en: { title: 'Accounting', overview: 'Overview', salaries: 'Salaries', employees: 'Employees' },
}

export const ACCOUNTING_TAB_PATHS = {
  overview: '/admin/accounting',
  salaries: '/admin/accounting/salaries',
  employees: '/admin/accounting/employees',
}

export function accountingTitle(lang) {
  return (LABELS[lang] || LABELS.en).title
}

export function buildAccountingTabs(lang, value, navigate) {
  const labels = LABELS[lang] || LABELS.en
  return {
    label: labels.title,
    value,
    items: Object.keys(ACCOUNTING_TAB_PATHS).map(key => ({ key, label: labels[key] })),
    onChange: key => { if (key !== value) navigate(ACCOUNTING_TAB_PATHS[key]) },
  }
}
