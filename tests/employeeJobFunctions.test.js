import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../src/lib/employeeJobFunctions.js'

test('job functions match database values and have labels in all supported languages', () => {
  const migration = readFileSync(new URL('../migrations/237_employee_cashier_accountant_roles.sql', import.meta.url), 'utf8')
  assert.equal(EMPLOYEE_JOB_FUNCTIONS.length, 12)
  assert.equal(new Set(EMPLOYEE_JOB_FUNCTIONS.map(job => job.value)).size, 12)
  for (const job of EMPLOYEE_JOB_FUNCTIONS) {
    assert.ok(migration.includes("'" + job.value + "'"))
    for (const lang of ['en', 'ru', 'uz']) assert.ok(employeeJobFunctionLabel(job.value, lang))
  }
  assert.equal(employeeJobFunctionLabel(null), '')
  assert.equal(employeeJobFunctionLabel('owner'), '')
  assert.equal(employeeJobFunctionLabel('cook', 'unknown'), 'Cook')
})

test('role migration preserves existing employees and accepts only display roles', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  try {
    await db.exec('CREATE TABLE employee_salary_profiles (id integer PRIMARY KEY);')
    await db.exec(readFileSync(new URL('../migrations/194_employee_job_function.sql', import.meta.url), 'utf8'))
    await db.exec("INSERT INTO employee_salary_profiles VALUES (1, 'cook'), (2, NULL)")
    await db.exec(readFileSync(new URL('../migrations/206_employee_display_roles.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../migrations/237_employee_cashier_accountant_roles.sql', import.meta.url), 'utf8'))
    assert.deepEqual((await db.query('SELECT * FROM employee_salary_profiles ORDER BY id')).rows, [
      { id: 1, job_function: 'cook' }, { id: 2, job_function: null },
    ])
    for (const job of EMPLOYEE_JOB_FUNCTIONS) {
      await db.query('UPDATE employee_salary_profiles SET job_function = $1 WHERE id = 2', [job.value])
    }
    await assert.rejects(db.query("UPDATE employee_salary_profiles SET job_function = 'owner' WHERE id = 2"), /check constraint/)
  } finally {
    await db.close()
  }
})
