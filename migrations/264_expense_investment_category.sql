-- Allow money spent on investments to be tracked as its own Accounting category.

alter table if exists public.expenses
  drop constraint if exists expenses_category_check;

alter table if exists public.expenses
  add constraint expenses_category_check
  check (category in (
    'salary_cook',
    'salary_manager',
    'salary_waiter',
    'salary_other',
    'salary_one_time',
    'products_bazaar',
    'charcoal',
    'equipment',
    'utilities',
    'tax',
    'rent',
    'delivery',
    'marketing',
    'repair',
    'investment',
    'other',
    'investor_support',
    'other_income'
  ));
