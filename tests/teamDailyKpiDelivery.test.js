import test from 'node:test'
import assert from 'node:assert/strict'
import { deliverTeamDailyKpi, prepareTeamDailyKpi, retractTeamDailyKpiItem } from '../api/telegram/_lib/teamDailyKpiDelivery.js'
import { buildTeamDailyKpiImageSvg } from '../api/telegram/_lib/employeePayrollImages.js'

const date = '2026-09-05'
const awards = [ ['Malika', 46651], ['Zilola', 46651], ['Дурдона', 139953] ]
function fakeDb() {
 const tables = { daily_team_kpi_image_deliveries: [], employee_daily_kpi_runs: [{ business_date: date }], employee_salary_bonuses: awards.map(([employee_name, amount], i) => ({ id: String(i), bonus_date: date, source_type: 'daily_kpi', salary_profile: { employee_name }, amount })) }
 return { tables, from(table) {
   let filters = [], op = '', payload
   const query = {
     select() { return query }, eq(k,v) { filters.push(r => r[k] === v); return query }, order() { return query },
     insert(p) { op='insert'; payload=p; return query }, update(p) { op='update'; payload=p; return query },
     async execute(single) {
       if(op==='insert') {
         if(tables[table].some(r => r.business_date === payload.business_date)) return { error: {code:'23505'} }
         const row = {...payload,updated_at:'initial'};tables[table].push(row);return {data:structuredClone(row)}
       }
       const rows=tables[table].filter(r=>filters.every(f=>f(r)))
       if(op==='update') rows.forEach(r=>Object.assign(r,payload))
       return { data: structuredClone(single ? rows[0] || null : rows) }
     }, single(){return query.execute(true)}, maybeSingle(){return query.execute(true)}, range(){return query.execute(false)}, then(resolve,reject){return query.execute(false).then(resolve,reject)},
   }; return query
 } }
}
async function withTelegram(fn) {
 const previous = global.fetch; const token = process.env.TELEGRAM_BOT_TOKEN
 process.env.TELEGRAM_BOT_TOKEN = 'test-token';let calls=0
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>({ok:true,result:{message_id:123}})}}
 try { await fn(()=>calls) } finally { global.fetch=previous;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token }
}
test('one date image includes all awards and their exact total',()=>{
 const svg=buildTeamDailyKpiImageSvg(date,awards.map(([employee_name,amount])=>({employee_name,amount})))
 for(const [name] of awards)assert.ok(svg.includes(name))
 assert.match(svg,/233\s255/)
 assert.doesNotMatch(svg,/Остаток|Зарплата|sales_base/)
})
test('concurrent per-employee retries send one full-day image',async()=>withTelegram(async count=>{
 const db=fakeDb()
 await Promise.all([deliverTeamDailyKpi(db,date,'team'),deliverTeamDailyKpi(db,date,'team')])
 assert.equal(count(),1)
 assert.equal(db.tables.daily_team_kpi_image_deliveries[0].items.length,3)
 assert.equal((await deliverTeamDailyKpi(db,date,'team')).status,'sent')
 assert.equal(count(),1)
}))
test('unknown send outcome stays held and is never automatically resent',async()=>withTelegram(async()=>{
 const db=fakeDb();let calls=0;global.fetch=async()=>{calls++;throw Error('timeout')}
 await assert.rejects(deliverTeamDailyKpi(db,date,'team'),/timeout/)
 assert.equal((await deliverTeamDailyKpi(db,date,'team')).status,'pending')
 assert.equal(calls,1)
}))
test('deleting one award edits the shared image and retains other employees',async()=>withTelegram(async count=>{
 const db=fakeDb();await deliverTeamDailyKpi(db,date,'team')
 await retractTeamDailyKpiItem(db,date,'0')
 assert.equal(count(),2)
 assert.deepEqual(db.tables.daily_team_kpi_image_deliveries[0].items.map(i=>i.employee_name),['Zilola','Дурдона'])
 await retractTeamDailyKpiItem(db,date,'0');assert.equal(count(),2)
}))
test('legacy delivered dates are held without duplicate broadcast',async()=>withTelegram(async count=>{
 const db=fakeDb();db.tables.daily_team_kpi_image_deliveries.push({business_date:date,status:'legacy',items:[]})
 assert.equal((await deliverTeamDailyKpi(db,date,'team')).status,'pending');assert.equal(count(),0)
}))
test('a prepared image claims the date for an album send and records its message id',async()=>withTelegram(async count=>{
 const db=fakeDb()
 const prepared=await prepareTeamDailyKpi(db,date,'team')
 assert.ok(prepared.photo);assert.equal(count(),0)
 assert.equal((await prepareTeamDailyKpi(db,date,'team')).result.status,'pending')
 assert.equal((await prepared.finish(456)).status,'sent')
 assert.equal(db.tables.daily_team_kpi_image_deliveries[0].telegram_message_id,'456')
 assert.equal((await deliverTeamDailyKpi(db,date,'team')).status,'sent');assert.equal(count(),0)
}))
