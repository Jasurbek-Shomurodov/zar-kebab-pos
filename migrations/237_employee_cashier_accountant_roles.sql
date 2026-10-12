-- Display-only cashier and accountant roles; account permissions and payroll are unchanged.
alter table public.employee_salary_profiles
  drop constraint if exists employee_salary_profiles_job_function_check;

alter table public.employee_salary_profiles
  add constraint employee_salary_profiles_job_function_check
  check (job_function in ('waiter', 'manager', 'cook', 'washer', 'cleaner', 'hostess', 'chef_cook', 'director', 'smm_manager', 'runner', 'cashier', 'accountant'));

notify pgrst, 'reload schema';
