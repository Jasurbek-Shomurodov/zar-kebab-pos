export const EMPLOYEE_JOB_FUNCTIONS = [
  { value: 'director', en: 'Director', ru: 'Директор', uz: 'Direktor' },
  { value: 'smm_manager', en: 'SMM manager', ru: 'SMM-менеджер', uz: 'SMM menejer' },
  { value: 'runner', en: 'Runner', ru: 'Раннер', uz: 'Ranner' },
  { value: 'waiter', en: 'Waiter', ru: 'Официант', uz: 'Ofitsiant' },
  { value: 'manager', en: 'Manager', ru: 'Менеджер', uz: 'Menejer' },
  { value: 'cashier', en: 'Cashier', ru: 'Кассир', uz: 'Kassir' },
  { value: 'accountant', en: 'Accountant', ru: 'Бухгалтер', uz: 'Buxgalter' },
  { value: 'cook', en: 'Cook', ru: 'Повар', uz: 'Oshpaz' },
  { value: 'washer', en: 'Dishwasher', ru: 'Мойщик посуды', uz: 'Idish yuvuvchi' },
  { value: 'cleaner', en: 'Cleaner', ru: 'Уборщик', uz: 'Farrosh' },
  { value: 'hostess', en: 'Hostess', ru: 'Хостес', uz: 'Xostes' },
  { value: 'chef_cook', en: 'Head chef', ru: 'Шеф-повар', uz: 'Bosh oshpaz' },
]

export function employeeJobFunctionLabel(value, lang = 'en') {
  const job = EMPLOYEE_JOB_FUNCTIONS.find(item => item.value === value)
  return job ? job[lang] || job.en : ''
}
