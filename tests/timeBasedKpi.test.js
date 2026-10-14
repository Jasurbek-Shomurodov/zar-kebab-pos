import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { normalizeKpiStartTime, formatKpiStartTime, removeKpiRulePreservingHistory } from '../src/lib/dailyKpi.js'
import { buildEmployeeOrderKpiMessage } from '../api/telegram/_lib/employeeOrderKpiNotifications.js'
import { buildKpiRuleGroupMessage } from '../api/telegram/_lib/paymentMessages.js'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`

test('KPI start time accepts minute precision and formats Tashkent consistently', () => {
  assert.equal(normalizeKpiStartTime(), '00:00')
  assert.equal(normalizeKpiStartTime(null), '00:00')
  for (const value of ['00:00','14:00','23:59','14:00:00']) assert.equal(normalizeKpiStartTime(value), value.slice(0,5))
  for (const value of ['', '24:00','14:60','-1:00','2:00','14:00:01','14:00Z','bad']) assert.equal(normalizeKpiStartTime(value), '')
  assert.equal(formatKpiStartTime('14:00:00','en'),'From 14:00 (Tashkent)')
  assert.equal(formatKpiStartTime('14:00','ru'),'С 14:00 (Ташкент)')
  assert.equal(formatKpiStartTime('14:00','uz'),'14:00 dan (Toshkent)')
})

test('KPI removal preserves the workday start in a disabled successor', async () => {
  let saved
  const client = { from() { return { upsert(row) { saved=row; return {select(){return {single:async()=>({data:{id:'disabled'}})}}} } } } }
  const result = await removeKpiRulePreservingHistory({client,rule:{id:'old',salary_profile_id:'employee',effective_from:'2026-09-20',rate_bps:200,sales_basis:'restaurant',start_time:'14:00:00'},effectiveFrom:'2026-09-21'})
  assert.equal(result.action,'disabled')
  assert.equal(saved.start_time,'14:00:00')
  assert.equal(saved.is_enabled,false)
})

test('start time is editable, saved, checked for changes and displayed from snapshots', () => {
  const read = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
  const page = read('src/pages/Employees.jsx')
  const settings = read('src/lib/employeeSettings.js')
  const picker = read('src/components/TimePicker24.jsx')
  assert.match(page,/<TimePicker24 value=\{kpiForm\.start_time\}/)
  assert.match(picker,/const HOURS = Array.from\(\{ length: 24 \}/)
  assert.match(picker,/const MINUTES = Array.from\(\{ length: 60 \}/)
  assert.match(picker,/type="text" readOnly value=\{value\}/)
  assert.match(picker,/onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(picker,/visible && \(/)
  assert.match(picker,/role="dialog"/)
  assert.match(picker,/event.key === 'Escape'/)
  assert.match(picker,/removeEventListener\('pointerdown', outside\)/)
  assert.ok(picker.includes('onChange(`${event.target.value}:${value.slice(3, 5)}`)'))
  assert.ok(picker.includes('onChange(`${value.slice(0, 2)}:${event.target.value}`)'))
  assert.doesNotMatch(picker,/type="time"/)
  assert.match(settings,/start_time: normalizeKpiStartTime\(form\.start_time\)/)
  assert.match(settings,/normalizeKpiStartTime\(existing\.start_time\) !== payload\.start_time/)
  assert.match(settings,/start_time: normalizeKpiStartTime\(rule\?\.start_time\)/)
  assert.match(settings,/if \(!normalizeKpiStartTime\(form\.start_time\)\) return \{ code: 'start_required' \}/)
  assert.match(read('src/pages/Employees.jsx'),/formatKpiStartTime\(rule.start_time, lang\)/)
  assert.match(read('src/pages/EmployeeSalaryHistory.jsx'),/formatKpiStartTime\(entry.kpiResult.start_time_snapshot, lang\)/)
  assert.match(read('api/telegram/employee-notification.js'),/previous_start_time, new_start_time/)
})

for (const openingCutoff of [false, true]) test(`time-based KPI production SQL keeps payroll and live estimates aligned (opening cutoff: ${openingCutoff})`, async t => {
  const db = new PGlite(); t.after(()=>db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema extensions; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function current_staff_can_access(text) returns boolean language sql as $$select true$$;
    create function current_staff_can_write(text) returns boolean language sql as $$select true$$;
    create function current_staff_has_role(text[]) returns boolean language sql as $$select true$$;
    create or replace function pg_catalog.now() returns timestamptz language sql stable as
      $$select current_setting('test.now')::timestamptz$$;
    create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
      $$select current_setting('test.now')::timestamptz$$;
    select set_config('test.now','2026-09-20T12:00:00Z',false);
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
    create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
    create table profiles(id uuid primary key,full_name text);
    create table employee_salary_profiles(id uuid primary key,profile_id uuid,employee_name text,joined_at date,ended_at date,deleted_at timestamptz,payment_method text);
    create table employee_salary_absences(salary_profile_id uuid,absence_date date);
    create table employee_salary_bonuses(id uuid primary key,salary_profile_id uuid,bonus_date date,amount integer,payment_method text,note text,created_by uuid,created_by_name text);
    create table employee_salary_group_notification_deliveries(event_type text,event_id uuid,salary_profile_id uuid,status text,error_message text,attempted_at timestamptz,employee_status text,employee_error_message text,employee_attempted_at timestamptz,team_status text,team_error_message text,team_attempted_at timestamptz,unique(event_type,event_id));
    create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
    create table orders(id text primary key,order_number integer default 1,opened_by uuid,created_at timestamptz,paid_at timestamptz,payment_status text default 'unpaid',status text default 'completed',order_type text default 'dine_in',subtotal integer,service_fee integer default 0,total integer default 1,loyalty_discount_amount integer default 0);
  `)
  for (const file of ['129_daily_kpi_bonuses.sql','169_salary_bonus_accrual.sql','170_kpi_rule_group_notifications.sql','196_configurable_kpi_sales_basis.sql','200_repair_daily_kpi_creator_guard.sql','197_employee_order_kpi_notifications.sql','198_employee_order_kpi_running_total.sql','202_current_day_order_deletion.sql']) await db.exec(sql(file))
  // Install the production effective-date guard without unrelated meal/recipe schema.
  const financial = sql('147_financial_report_history_snapshots.sql')
  const start = financial.indexOf('create or replace function public.protect_kpi_rule_finalized_period()')
  const end = financial.indexOf('for each row execute function public.protect_kpi_rule_finalized_period();',start)
  await db.exec(financial.slice(start,end+'for each row execute function public.protect_kpi_rule_finalized_period();'.length))
  for (let n=1;n<=7;n++) {
    await db.query('insert into profiles values($1,$2)',[id(100+n),`Account ${n}`])
    await db.query("insert into employee_salary_profiles values($1,$2,$3,'2026-01-01',null,null,'cash')",[id(n),n===3?null:id(100+n),`Employee ${n}`])
    await db.query('insert into employee_salary_telegram_links values($1,$2,true)',[id(n),`chat-${n}`])
    await db.query("insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis) values($1,'2026-09-16',$2,$3)",[id(n),n===1?300:n===2?200:100,n===1?'employee_opened_orders':'restaurant'])
  }
  const order = async (key,opener,amount,paidAt,extra={}) => {
    const row={id:key,opened_by:opener==null?null:id(100+opener),subtotal:amount,paid_at:paidAt,created_at:openingCutoff?paidAt:'2026-09-01T00:00:00Z',...extra}
    const keys=Object.keys(row)
    await db.query(`insert into orders(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row))
    if (extra.payment_status !== 'unpaid') await db.query("update orders set payment_status='paid' where id=$1",[key])
  }
  const finalize = async date => (await db.query('select * from generate_daily_kpi_bonuses($1)',[date])).rows
  const resultsByEmployee = rows => new Map(rows.map(r=>[r.salary_profile_id,r]))
  const notice = async key => (await db.query('select snapshot from employee_order_kpi_notifications where order_id=$1 order by salary_profile_id',[key])).rows[0]?.snapshot
  await order('old-finalized',1,100000,'2026-09-18T10:00:00+05:00')
  await order('old-catchup',1,10000,'2026-09-19T10:00:00+05:00')
  const historical = await finalize('2026-09-18')
  const oldBonuses = (await db.query("select * from employee_salary_bonuses where bonus_date='2026-09-18' order by id")).rows
  const oldNotice = await notice('old-finalized')
  await db.exec(sql('203_kpi_workday_start_time.sql'))
  if (openingCutoff) await db.exec(sql('213_kpi_order_opening_cutoff.sql'))
  await t.test('migration preserves finalized awards, notices and default full-day rules',async()=>{
    assert.deepEqual((await finalize('2026-09-18')).map(({start_time_snapshot,...r})=>r),historical)
    assert.deepEqual((await db.query("select * from employee_salary_bonuses where bonus_date='2026-09-18' order by id")).rows,oldBonuses)
    assert.deepEqual(await notice('old-finalized'),oldNotice)
    assert.equal(resultsByEmployee(await finalize('2026-09-19')).get(id(1)).bonus_amount,300)
    assert.ok((await db.query('select start_time from employee_kpi_rules')).rows.every(r=>r.start_time==='00:00:00'))
    await assert.rejects(db.query("update employee_kpi_rules set start_time='14:00' where salary_profile_id=$1",[id(1)]),/finalized/)
    await assert.rejects(db.query("insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,start_time) values($1,'2026-09-17',100,'14:00')",[id(1)]),/finalized/)
  })
  for (let n=1;n<=7;n++) {
    await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,order_opener_profile_id,start_time,is_enabled,created_by)
      values($1,'2026-09-20',$2,$3,$4,$5,$6,$7)`,[id(n),n===1?300:n===2?200:100,[1,6].includes(n)?'employee_opened_orders':'restaurant',n===6?id(101):null,n===3?'00:00':'14:00',n!==7,id(101)])
  }
  await db.exec(`insert into employee_salary_absences values('${id(4)}','2026-09-20'); update employee_salary_profiles set ended_at='2026-09-19' where id='${id(5)}'`)
  await t.test('time-only edits queue immutable before/after events, no-ops stay silent and invalid times fail',async()=>{
    const count=async()=>Number((await db.query('select count(*) from employee_kpi_rule_change_events')).rows[0].count)
    const before=await count()
    await db.query("update employee_kpi_rules set start_time='15:30' where salary_profile_id=$1 and effective_from='2026-09-20'",[id(2)])
    assert.equal(await count(),before+1)
    const event=(await db.query("select * from employee_kpi_rule_change_events where new_start_time='15:30'")).rows[0]
    assert.equal(event.previous_start_time,'14:00:00')
    assert.equal(event.new_start_time,'15:30:00')
    const text=buildKpiRuleGroupMessage(event,'ru')
    assert.match(text,/С 14:00 \(Ташкент\) → С 15:30 \(Ташкент\)/)
    await db.query("update employee_kpi_rules set start_time='15:30' where salary_profile_id=$1 and effective_from='2026-09-20'",[id(2)])
    assert.equal(await count(),before+1)
    await db.query("update employee_kpi_rules set start_time='14:00' where salary_profile_id=$1 and effective_from='2026-09-20'",[id(2)])
    assert.equal((await db.query('select new_start_time from employee_kpi_rule_change_events where id=$1',[event.id])).rows[0].new_start_time,'15:30:00')
    for (const invalid of ['24:00','14:00:01','25:00']) await assert.rejects(db.query("update employee_kpi_rules set start_time=$1 where salary_profile_id=$2 and effective_from='2026-09-20'",[invalid,id(2)]))
    await assert.rejects(db.query("update employee_kpi_rules set start_time=null where salary_profile_id=$1 and effective_from='2026-09-20'",[id(2)]),/null/)
  })
  if (openingCutoff) {
    await order('arrived-before-shift',1,100000,'2026-09-20T14:10:00+05:00',{created_at:'2026-09-20T13:50:00+05:00'})
    assert.equal((await notice('arrived-before-shift')).cut,0)
    assert.equal((await notice('arrived-before-shift')).daily_cut,0)
    await order('opened-yesterday',1,9000000,'2026-09-20T14:10:00+05:00',{created_at:'2026-09-19T15:00:00+05:00'})
    await order('unknown-opening',1,9000000,'2026-09-20T14:10:00+05:00',{created_at:null})
    assert.equal((await notice('opened-yesterday')).cut,0)
    assert.equal((await notice('unknown-opening')).cut,0)
  }
  await order('midnight',1,30000,'2026-09-19T19:00:00Z')
  await order('before',1,100000,'2026-09-20T08:59:59.999Z')
  assert.equal((await notice('before')).cut,0)
  assert.equal((await notice('before')).daily_cut,0)
  await order('boundary',1,100000,'2026-09-20T09:00:00Z',{service_fee:10000,loyalty_discount_amount:50000})
  assert.equal((await notice('boundary')).cut,3300)
  assert.equal((await notice('boundary')).daily_cut,3300)
  assert.match(buildEmployeeOrderKpiMessage(await notice('boundary')),/с 14:00, Ташкент/)
  await order('other',2,200000,'2026-09-20T09:01:00Z',{service_fee:30000})
  assert.equal((await notice('other')).daily_cut,6800)
  await order('unattributed',null,50000,'2026-09-20T15:00:00+05:00')
  await order('last',1,17,'2026-09-20T18:59:59.999Z')
  for (const [key,extra] of Object.entries({unpaid:{payment_status:'unpaid'},cancelled:{status:'cancelled'},takeaway:{order_type:'takeaway'},delivery:{order_type:'delivery'},game:{order_type:'game_club'}})) await order(key,1,9000000,'2026-09-20T16:00:00+05:00',extra)
  await order('tomorrow',1,9000000,'2026-09-20T19:00:00Z')
  await order('delete-today',1,1000000,'2026-09-20T16:00:00+05:00')
  await db.exec("delete from orders where id='delete-today'")
  await order('absent-check',4,0,'2026-09-20T16:00:00+05:00')
  await order('ended-check',5,0,'2026-09-20T16:00:00+05:00')
  await order('disabled-check',7,0,'2026-09-20T16:00:00+05:00')
  await order('manager-check',2,0,'2026-09-20T17:00:00+05:00')
  await t.test('start is inclusive, midnight is exclusive, the configured cutoff is enforced and ineligible orders are excluded',async()=>{
    const base=async(start,basis='restaurant',opener=null)=>(await db.query("select employee_kpi_sales_base('2026-09-20',$1,$2,$3) as amount",[basis,opener,start])).rows[0].amount
    assert.equal(await base('14:00'),390017)
    assert.equal(await base('00:00'),openingCutoff?620017:520017)
    assert.equal(await base('23:59'),17)
    assert.equal(await base('14:00','employee_opened_orders',id(101)),110017)
    assert.equal((await notice('last')).daily_cut,3301) // aggregate rounded once
    assert.equal((await notice('manager-check')).daily_cut,7800)
    const absent=(await db.query("select snapshot from employee_order_kpi_notifications where salary_profile_id=$1",[id(4)])).rows
    assert.equal(absent.length,1)
    assert.equal(absent[0].snapshot.cut,0)
    assert.equal(absent[0].snapshot.daily_cut,0)
    assert.equal(await notice('ended-check'),undefined)
    assert.equal((await notice('disabled-check')).daily_cut,0)
    assert.equal((await db.query("select status from employee_order_kpi_notifications where order_id='delete-today' order by salary_profile_id")).rows[0].status,'cancelled')
  })
  await db.query("select set_config('test.now','2026-09-21T12:00:00Z',false)")
  const finalized=await finalize('2026-09-20')
  const results=resultsByEmployee(finalized)
  assert.equal(results.get(id(1)).bonus_amount,3301)
  assert.equal(results.get(id(2)).bonus_amount,7800)
  assert.equal(results.get(id(3)).bonus_amount,openingCutoff?6200:5200)
  assert.equal(results.get(id(4)).status,'skipped_absent')
  assert.equal(results.get(id(5)).status,'skipped_ineligible')
  assert.equal(results.get(id(6)).bonus_amount,1100)
  assert.equal(results.has(id(7)),false)
  assert.equal(results.get(id(2)).start_time_snapshot,'14:00:00')
  const bonus=(await db.query('select * from employee_salary_bonuses where id=$1',[results.get(id(2)).bonus_id])).rows[0]
  assert.equal(bonus.source_metadata.start_time,'14:00:00')
  assert.equal(bonus.source_metadata.time_zone,'Asia/Tashkent')
  assert.equal(bonus.source_metadata.sales_base_amount,390017)
  assert.equal((await db.query("select sales_base_amount from employee_daily_kpi_runs where business_date='2026-09-20'")).rows[0].sales_base_amount,openingCutoff?620017:520017)
  assert.deepEqual(await finalize('2026-09-20'),finalized)
  await assert.rejects(db.query("delete from orders where id='boundary'"),/Only orders from today/)
  await assert.rejects(db.query("update employee_kpi_rules set start_time='00:00' where id=$1",[results.get(id(2)).rule_id]),/finalized/)
  await db.query("insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,start_time) values($1,'2026-09-21',200,'restaurant','16:00')",[id(2)])
  assert.deepEqual(await finalize('2026-09-20'),finalized)
  await t.test('a future start-time change applies only from its effective date and an empty window earns zero',async()=>{
    await order('next-before',2,1000000,'2026-09-21T15:59:59.999+05:00')
    assert.equal((await notice('next-before')).cut,0)
    assert.equal((await notice('next-before')).daily_cut,0)
    await order('next-boundary',2,200000,'2026-09-21T16:00:00+05:00')
    assert.equal((await notice('next-boundary')).daily_cut,4000)
    await db.query("select set_config('test.now','2026-09-22T12:00:00Z',false)")
    const next=resultsByEmployee(await finalize('2026-09-21'))
    assert.equal(next.get(id(2)).bonus_amount,4000)
    assert.equal(next.get(id(2)).start_time_snapshot,'16:00:00')
    assert.deepEqual(await finalize('2026-09-20'),finalized)
    await order('early-only',2,1000000,'2026-09-22T13:00:00+05:00')
    await db.query("select set_config('test.now','2026-09-23T12:00:00Z',false)")
    const empty=resultsByEmployee(await finalize('2026-09-22'))
    assert.equal(empty.get(id(2)).bonus_amount,0)
    assert.equal(empty.get(id(2)).status,'skipped_no_sales')
    assert.equal(empty.get(id(2)).bonus_id,null)
  })
  await t.test('financial helper is not exposed to public or authenticated callers',async()=>{
    for (const role of ['anon','authenticated']) {
      const permissions=(await db.query("select has_function_privilege($1,'employee_kpi_sales_base(date,text,uuid,time)','execute') as allowed",[role])).rows[0]
      assert.equal(permissions.allowed,false)
    }
  })
})
