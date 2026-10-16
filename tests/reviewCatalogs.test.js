import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// The /cr, /qa and /dr skills run from these catalogs; keep them well formed so
// a run never skips, double-counts or mis-ranks a case.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skills = ['cr', 'qa', 'dr']
const catalogPath = skill => path.join(root, '.claude/skills', skill, 'references/cases.md')
const skillPath = skill => path.join(root, '.claude/skills', skill, 'SKILL.md')

const PIPE = '\u0000'
const splitRow = line =>
  line
    .replace(/\\\|/g, PIPE)
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim().replaceAll(PIPE, '|'))

const caseRows = text =>
  text
    .split('\n')
    .filter(line => /^\| [A-Z0-9]+-\d{3} \|/.test(line))
    .map(splitRow)

const areaCodes = skillText => {
  const match = skillText.match(/area code \(([^)]+)\)/)
  assert.ok(match, 'the skill description names area codes')
  return match[1].split(',').map(area => area.trim())
}

for (const skill of skills) {
  const catalog = fs.readFileSync(catalogPath(skill), 'utf8')
  const skillText = fs.readFileSync(skillPath(skill), 'utf8')
  const rows = caseRows(catalog)

  test(`/${skill} catalog has cases with five filled columns and S0/S1/S2 severities`, () => {
    assert.ok(rows.length > 20, `${skill} catalog covers the app broadly`)
    for (const cells of rows) {
      assert.equal(cells.length, 5, `${cells[0]} has ID, Sev, Case, Check and Expect`)
      for (const cell of cells) assert.ok(cell.length > 0, `${cells[0]} has no empty cell`)
      assert.match(cells[1], /^S[012]$/, `${cells[0]} severity`)
    }
  })

  test(`/${skill} catalog keeps every case ID unique`, () => {
    const ids = rows.map(cells => cells[0])
    assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), [])
  })

  test(`/${skill} catalog uses the shared table header and a run log`, () => {
    const headers = catalog.split('\n').filter(line => line.startsWith('| ID |'))
    assert.ok(headers.length > 0)
    for (const header of headers) assert.equal(header, '| ID | Sev | Case | Check | Expect |')
    assert.match(catalog, /## Run log[\s\S]*\| Date \| Commit \| Scope \| Findings \(S0\/S1\/S2\) \| Checks run \| Not run \|/)
  })

  test(`/${skill} skill names exactly the areas the catalog has`, () => {
    const named = areaCodes(skillText)
    const present = [...new Set(rows.map(cells => cells[0].split('-')[0]))]
    for (const area of named) assert.ok(present.includes(area), `area ${area} has cases`)
    for (const area of present) assert.ok(named.includes(area), `area ${area} is named in the skill`)
    assert.match(skillText, /argument-hint: .*area code \(/)
  })

  test(`/${skill} skill points at the catalog and the shared contract`, () => {
    assert.match(skillText, /references\/cases\.md/)
    assert.match(skillText, /review-core/)
    assert.match(skillText, /AGENTS\.md/)
  })
}
