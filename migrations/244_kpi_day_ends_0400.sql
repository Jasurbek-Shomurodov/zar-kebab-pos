-- KPI shifts end at 04:00 Tashkent instead of midnight.
--
-- A bill paid at 01:30 belongs to the previous evening's shift. From business
-- date 2026-10-14 the KPI day D runs from D + max(start_time, 04:00) to
-- D+1 04:00. The cutover date itself keeps its old start (D + start_time) so
-- the 00:00-04:00 hour after the last midnight-based day is never dropped.
-- Earlier dates, finalized results and sent notices are untouched. Reports,
-- cafe income and order deletion days stay on the calendar date.
begin;
set local lock_timeout = '5s';

create or replace function public.kpi_business_date(p_at timestamptz)
returns date language sql stable set search_path = public as $$
  select case
    when (p_at at time zone 'Asia/Tashkent')::time < time '04:00'
     and (p_at at time zone 'Asia/Tashkent')::date - 1 >= date '2026-10-14'
      then (p_at at time zone 'Asia/Tashkent')::date - 1
    else (p_at at time zone 'Asia/Tashkent')::date
  end;
$$;
revoke all on function public.kpi_business_date(timestamptz) from public, anon;
grant execute on function public.kpi_business_date(timestamptz) to authenticated, service_role;

create or replace function public.employee_kpi_sales_base(
  p_business_date date, p_sales_basis text, p_opener uuid, p_start_time time
) returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(coalesce(o.subtotal, 0)::bigint + coalesce(o.service_fee, 0)::bigint), 0)::bigint
  from public.orders o
  where coalesce(o.order_type, 'dine_in') = 'dine_in'
    and o.payment_status = 'paid' and coalesce(o.status, '') <> 'cancelled'
    and o.paid_at >= (p_business_date + case
      when p_business_date > date '2026-10-14' then greatest(coalesce(p_start_time, time '00:00'), time '04:00')
      else coalesce(p_start_time, time '00:00')
    end) at time zone 'Asia/Tashkent'
    and o.paid_at < ((p_business_date + 1) + case
      when p_business_date >= date '2026-10-14' then time '04:00' else time '00:00'
    end) at time zone 'Asia/Tashkent'
    and (p_business_date < date '2026-09-16' or p_sales_basis = 'restaurant' or o.opened_by = p_opener);
$$;
revoke all on function public.employee_kpi_sales_base(date,text,uuid,time) from public, anon, authenticated;
grant execute on function public.employee_kpi_sales_base(date,text,uuid,time) to service_role;

create or replace function public.queue_employee_order_kpi_notification()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  business_date date;
  recipient record;
  rate integer;
  base bigint;
  daily_base bigint;
  daily_rate integer;
begin
  if new.payment_status is distinct from 'paid' or old.payment_status='paid'
     or new.paid_at is null or new.opened_by is null or new.status='cancelled' then return new; end if;
  business_date := public.kpi_business_date(new.paid_at);
  for recipient in
    select s.id, r.rate_bps, r.is_enabled, r.sales_basis, r.start_time, l.chat_id
    from employee_salary_profiles s
    left join lateral (select * from employee_kpi_rules k where k.salary_profile_id=s.id
      and k.effective_from<=business_date order by effective_from desc,created_at desc,id desc limit 1) r on true
    join employee_salary_telegram_links l on l.salary_profile_id=s.id
    where coalesce(r.order_opener_profile_id,s.profile_id)=new.opened_by
      and l.notifications_enabled and nullif(btrim(l.chat_id),'') is not null
      and s.joined_at<=business_date and (s.ended_at is null or s.ended_at>=business_date)
      and (s.deleted_at is null or (s.deleted_at at time zone 'Asia/Tashkent')::date>business_date)
  loop
    daily_rate := case when recipient.is_enabled then recipient.rate_bps else 0 end;
    rate := case when coalesce(new.order_type,'dine_in')='dine_in' then daily_rate else 0 end;
    daily_base := public.employee_kpi_sales_base(business_date, recipient.sales_basis, new.opened_by, recipient.start_time);
    base := coalesce(new.subtotal,0)::bigint+coalesce(new.service_fee,0)::bigint;
    insert into employee_order_kpi_notifications(order_id,salary_profile_id,chat_id,snapshot)
    values(new.id,recipient.id,recipient.chat_id,jsonb_build_object(
      'order_number',new.order_number,'total',new.total,'rate_bps',rate,
      'cut',round(base::numeric*rate/10000),'paid_at',new.paid_at,
      'start_time',coalesce(recipient.start_time, time '00:00'),
      'daily_cut',round(daily_base::numeric*daily_rate/10000)))
    on conflict(order_id,salary_profile_id) do nothing;
  end loop;
  begin
    perform public.invoke_employee_order_kpi_notifications();
  exception when others then
    raise warning 'Employee order notification queued; immediate dispatch failed';
  end;
  return new;
end;
$$;
revoke all on function public.queue_employee_order_kpi_notification() from public,anon,authenticated;

create or replace function public.generate_daily_kpi_bonuses(
  p_business_date date
)
returns setof public.employee_daily_kpi_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_date date := public.kpi_business_date(now()) - 1;
  v_sales_base bigint := 0;
  v_employee_base bigint := 0;
  -- Fixed policy boundary: delayed deployment/catch-up must not move it.
  v_personal_sales boolean;
  v_opener_id uuid;
  v_result_id uuid;
  v_bonus_id uuid;
  v_bonus_amount_bigint bigint;
  v_payment_method text;
  v_status text;
  v_skip_reason text;
  v_configured_count integer := 0;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_rule record;
begin
  if p_business_date is null then
    raise exception 'business date is required';
  end if;
  if p_business_date > v_completed_date then
    raise exception 'KPI bonuses can be generated only for a completed KPI day (ends 04:00 Tashkent)';
  end if;

  perform pg_advisory_xact_lock(hashtext('daily-kpi:' || p_business_date::text));

  if exists (
    select 1
    from public.employee_daily_kpi_runs run
    where run.business_date = p_business_date
  ) then
    return query
      select result.*
      from public.employee_daily_kpi_results result
      where result.business_date = p_business_date
      order by result.employee_name_snapshot, result.salary_profile_id;
    return;
  end if;

  -- Run totals remain restaurant-wide, including the full day.
  v_sales_base := public.employee_kpi_sales_base(p_business_date, 'restaurant', null, time '00:00');

  for v_rule in
    select distinct on (rule.salary_profile_id)
      rule.id,
      rule.salary_profile_id,
      rule.rate_bps,
      rule.is_enabled,
      rule.sales_basis,
      rule.start_time,
      -- STABLE helper calls share this rule query's sales snapshot.
      public.employee_kpi_sales_base(p_business_date, rule.sales_basis,
        coalesce(rule.order_opener_profile_id, salary_profile.profile_id), rule.start_time) as employee_sales_base,
      rule.order_opener_profile_id,
      salary_profile.employee_name,
      salary_profile.profile_id,
      salary_profile.joined_at,
      salary_profile.ended_at,
      salary_profile.deleted_at,
      salary_profile.payment_method
    from public.employee_kpi_rules rule
    join public.employee_salary_profiles salary_profile
      on salary_profile.id = rule.salary_profile_id
    where rule.effective_from <= p_business_date
    order by
      rule.salary_profile_id,
      rule.effective_from desc,
      rule.created_at desc,
      rule.id desc
  loop
    -- A disabled effective row means this employee has no applicable KPI for
    -- the date. Do not create an endless daily stream of disabled audit rows.
    if not v_rule.is_enabled then
      continue;
    end if;

    -- Match durable account IDs only. Unlinked employees and unattributed
    -- orders must never borrow another employee's sales through a name match.
    v_personal_sales := p_business_date >= date '2026-09-16'
      and v_rule.sales_basis = 'employee_opened_orders';
    v_opener_id := coalesce(v_rule.order_opener_profile_id, v_rule.profile_id);
    v_employee_base := v_rule.employee_sales_base;

    v_configured_count := v_configured_count + 1;
    v_result_id := gen_random_uuid();
    v_bonus_id := null;
    v_bonus_amount_bigint := 0;
    v_payment_method := case
      when v_rule.payment_method in ('cash', 'card', 'terminal')
        then v_rule.payment_method
      else 'cash'
    end;
    v_status := 'generated';
    v_skip_reason := '';

    if (
         v_rule.deleted_at is not null
         and (timezone('Asia/Tashkent', v_rule.deleted_at))::date <= p_business_date
       )
       or v_rule.joined_at > p_business_date
       or (v_rule.ended_at is not null and v_rule.ended_at < p_business_date) then
      v_status := 'skipped_ineligible';
      v_skip_reason := 'Employee was outside the eligible employment period';
    elsif v_employee_base <= 0 then
      v_status := 'skipped_no_sales';
      v_skip_reason := 'No paid dine-in subtotal or service fee was recorded';
    else
      v_bonus_amount_bigint := round(
        v_employee_base::numeric * v_rule.rate_bps::numeric / 10000
      )::bigint;
      if v_bonus_amount_bigint <= 0 then
        v_status := 'skipped_no_sales';
        v_skip_reason := 'The calculated KPI bonus rounded to zero';
        v_bonus_amount_bigint := 0;
      elsif v_bonus_amount_bigint > 2147483647 then
        raise exception 'Calculated KPI bonus exceeds the supported amount for salary profile %',
          v_rule.salary_profile_id;
      end if;
    end if;

    if v_status = 'generated' then
      v_bonus_id := gen_random_uuid();
      insert into public.employee_salary_bonuses (
        id,
        salary_profile_id,
        bonus_date,
        amount,
        payment_method,
        note,
        created_by,
        created_by_name,
        source_type,
        source_metadata
      ) values (
        v_bonus_id,
        v_rule.salary_profile_id,
        p_business_date,
        v_bonus_amount_bigint::integer,
        v_payment_method,
        format(
          'Автоматический ежедневный KPI: %s%% от dine-in продаж с сервисом (%s)',
          trim(to_char(v_rule.rate_bps::numeric / 100, 'FM999990.00')),
          p_business_date::text
        ),
        null,
        'Автоматический KPI',
        'daily_kpi',
        jsonb_build_object(
          'result_id', v_result_id,
          'rule_id', v_rule.id,
          'business_date', p_business_date,
          'sales_base_amount', v_employee_base,
          'start_time', v_rule.start_time,
          'time_zone', 'Asia/Tashkent',
          'rate_bps', v_rule.rate_bps,
          'sales_basis', case when v_personal_sales then 'employee_opened_orders' else 'restaurant' end,
          'opened_by', case when v_personal_sales then v_opener_id else null end
        )
      );
      v_generated_count := v_generated_count + 1;
    else
      v_skipped_count := v_skipped_count + 1;
    end if;

    insert into public.employee_daily_kpi_results (
      id,
      business_date,
      salary_profile_id,
      rule_id,
      employee_name_snapshot,
      start_time_snapshot,
      sales_base_amount,
      rate_bps,
      bonus_amount,
      payment_method,
      status,
      skip_reason,
      bonus_id
    ) values (
      v_result_id,
      p_business_date,
      v_rule.salary_profile_id,
      v_rule.id,
      coalesce(v_rule.employee_name, ''),
      v_rule.start_time,
      v_employee_base,
      v_rule.rate_bps,
      v_bonus_amount_bigint::integer,
      v_payment_method,
      v_status,
      v_skip_reason,
      v_bonus_id
    );
  end loop;

  insert into public.employee_daily_kpi_runs (
    business_date,
    sales_base_amount,
    configured_rule_count,
    generated_count,
    skipped_count
  ) values (
    p_business_date,
    v_sales_base,
    v_configured_count,
    v_generated_count,
    v_skipped_count
  );

  return query
    select result.*
    from public.employee_daily_kpi_results result
    where result.business_date = p_business_date
    order by result.employee_name_snapshot, result.salary_profile_id;
end;
$$;

revoke all on function public.generate_daily_kpi_bonuses(date)
  from public, anon, authenticated;
grant execute on function public.generate_daily_kpi_bonuses(date) to service_role;

create or replace function public.get_pending_daily_kpi_dates(
  p_limit integer default 31
)
returns table (business_date date)
language sql
security definer
stable
set search_path = public
as $$
  with bounds as (
    select
      coalesce(
        (select min(rule.effective_from) from public.employee_kpi_rules rule),
        completed.completed_date
      ) as first_date,
      completed.completed_date
    from (select public.kpi_business_date(now()) - 1 as completed_date) completed
  ), missing as (
    select day::date as business_date
    from bounds
    cross join lateral generate_series(bounds.first_date, bounds.completed_date, interval '1 day') day
    left join public.employee_daily_kpi_runs run
      on run.business_date = day::date
    where run.business_date is null
  )
  select missing.business_date
  from missing, bounds
  order by
    case when missing.business_date = bounds.completed_date then 0 else 1 end,
    missing.business_date
  limit greatest(1, least(coalesce(p_limit, 31), 366));
$$;

revoke all on function public.get_pending_daily_kpi_dates(integer) from public, anon, authenticated;
grant execute on function public.get_pending_daily_kpi_dates(integer) to service_role;

-- A bill paid after midnight also belongs to the previous KPI shift: once that
-- shift is finalized, deleting the bill would leave a bonus for a deleted sale.
create or replace function public.guard_current_day_order_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_date date := (coalesce(old.paid_at, old.created_at) at time zone 'Asia/Tashkent')::date;
  v_kpi_date date := case when old.paid_at is not null then public.kpi_business_date(old.paid_at) end;
  v_today date;
begin
  -- Serialize with generate_daily_kpi_bonuses. A deletion begun before the
  -- shift ends must commit before that shift's finalizer takes its snapshot.
  perform pg_advisory_xact_lock(hashtext('daily-kpi:' || v_business_date::text));
  if v_kpi_date is distinct from v_business_date and v_kpi_date is not null then
    perform pg_advisory_xact_lock(hashtext('daily-kpi:' || v_kpi_date::text));
  end if;
  v_today := (clock_timestamp() at time zone 'Asia/Tashkent')::date;
  if v_business_date < v_today
     and old.paid_at is null
     and coalesce(old.payment_status, '') not in ('paid', 'cancelled')
     and coalesce(old.status, '') not in ('paid', 'completed', 'cancelled')
     and public.current_staff_role() = 'owner' then
    return old;
  end if;
  if v_business_date is distinct from v_today
      or exists (select 1 from public.employee_daily_kpi_runs r where r.business_date = v_business_date)
      or exists (select 1 from public.employee_daily_kpi_runs r where r.business_date = v_kpi_date) then
    raise exception 'Only orders from today (Asia/Tashkent) can be deleted; owners may also delete older unpaid orders'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_current_day_order_deletion() from public, anon, authenticated;

commit;

-- The nightly report finalizes the previous KPI shift, so it must run after
-- 04:00 Tashkent: 23:05 UTC = 04:05 Asia/Tashkent.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'zar-kebab-daily-reports'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
  perform cron.schedule(
    'zar-kebab-daily-reports',
    '5 23 * * *',
    'select public.invoke_zar_kebab_daily_reports();'
  );
end;
$$;

notify pgrst, 'reload schema';
