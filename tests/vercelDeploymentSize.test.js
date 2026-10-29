import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const vercelConfig = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))

function directorySize(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = join(directory, entry.name)
    return total + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size)
  }, 0)
}

test('public stays small because Vite copies all of it into every deployment', () => {
  const size = directorySize(join(root, 'public'))
  assert.ok(size <= 5 * 1024 * 1024, `public/ is ${(size / 1024 / 1024).toFixed(1)} MB; keep marketing art in deliverables/`)
})

test('image-rendering functions ship only the Noto Sans TTFs fontconfig reads', () => {
  // `new URL('.../notosans-fontface/fonts/', import.meta.url)` makes Vercel trace the whole
  // 52 MB folder; only its TTFs are used, so the other formats are excluded per function.
  const fontUsers = [
    'api/telegram/webhook.js',
    'api/telegram/employee-notification.js',
    'api/telegram/daily-salary.js',
    'api/google-reviews/run.js',
  ]
  for (const name of fontUsers) {
    assert.equal(
      vercelConfig.functions?.[name]?.excludeFiles,
      'node_modules/notosans-fontface/fonts/*.{eot,svg,woff,woff2}',
      name,
    )
  }
})
