-- A closed (paid) order counts for the Tashkent day it was paid, regardless of
-- when it was opened or whether the opener was marked absent that day.
-- Finalized results, notices and historical snapshots are untouched.
begin;

create or replace function public.employee_kpi_sales_base(
  p_business_date date, p_sales_basis text, p_opener uuid, p_start_time time
) returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(coalesce(o.subtotal, 0)::bigint + coalesce(o.service_fee, 0)::bigint), 0)::bigint
  from public.orders o
  where coalesce(o.order_type, 'dine_in') = 'dine_in'
    and o.payment_status = 'paid' and coalesce(o.status, '') <> 'cancelled'
    and o.paid_at >= (p_business_date + coalesce(p_start_time, time '00:00')) at time zone 'Asia/Tashkent'
    and o.paid_at < (p_business_date + 1)::timestamp at time zone 'Asia/Tashkent'
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
  business_date := (new.paid_at at time zone 'Asia/Tashkent')::date;
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
  v_completed_date date := (timezone('Asia/Tashkent', now()))::date - 1;
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
    raise exception 'KPI bonuses can be generated only for a completed Tashkent date';
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

notify pgrst, 'reload schema';
commit;
