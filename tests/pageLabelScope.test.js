import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Pages keep their translations in a local `l` inside the default export.
// A helper component that reads `l.x` without receiving `l` throws
// "l is not defined" on render and blanks the whole page (Employees, 254).
const pagesDir = new URL('../src/pages/', import.meta.url)

function helperComponents(source) {
  const starts = [...source.matchAll(/^function ([A-Z]\w*)\s*\(/gm)]
  return starts.map((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length
    const body = source.slice(match.index, end)
    const params = body.slice(0, body.indexOf(') {') + 1)
    return { name: match[1], params, body }
  })
}

test('page helper components only read labels they receive', () => {
  const offenders = []
  for (const file of fs.readdirSync(pagesDir).filter(name => name.endsWith('.jsx'))) {
    const source = fs.readFileSync(new URL(file, pagesDir), 'utf8')
    for (const { name, params, body } of helperComponents(source)) {
      if (!/(?<![\w.$])l\.\w/.test(body)) continue
      const receivesL = /[{,(]\s*l\s*[,}=)]/.test(params)
      const declaresL = /\b(?:const|let|var)\s+l\s*=/.test(body)
      if (!receivesL && !declaresL) offenders.push(`${file}: ${name}`)
    }
  }
  assert.deepEqual(offenders, [])
})
