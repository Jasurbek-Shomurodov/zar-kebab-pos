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

const fontExcludes = 'node_modules/notosans-fontface/fonts/{*.eot,*.svg,*.woff,*.woff2,NotoSans-{Thin,ExtraLight,Light,Medium,Black}*.ttf,NotoSans-{SemiBold,Bold,ExtraBold}Italic.ttf}'
const shippedFonts = 'node_modules/notosans-fontface/fonts/NotoSans-{Regular,Italic,SemiBold,Bold,ExtraBold}.ttf'

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return entry.name.endsWith('.js') ? [entryPath] : []
  })
}

test('image-rendering functions ship only the Noto Sans TTFs fontconfig reads', () => {
  // `new URL('.../notosans-fontface/fonts/', import.meta.url)` makes Vercel trace the whole
  // 52 MB folder; the SVGs only use five upright/italic TTFs, so the rest are excluded per function.
  const fontUsers = [
    'api/telegram/webhook.js',
    'api/telegram/employee-notification.js',
    'api/telegram/daily-salary.js',
    'api/google-reviews/run.js',
  ]
  for (const name of fontUsers) {
    assert.equal(
      vercelConfig.functions?.[name]?.excludeFiles,
      fontExcludes,
      name,
    )
    const includes = vercelConfig.functions[name].includeFiles
    if (includes) assert.ok(includes.includes(shippedFonts), name)
  }
})

test('function SVGs use only the Noto Sans weights the deployment ships', () => {
  // Regular 400 (also italic), SemiBold 600, Bold 700, ExtraBold 800. A new weight needs its
  // TTF added to fontExcludes/shippedFonts in vercel.json, or fontconfig substitutes a neighbour.
  const shippedWeights = new Set(['400', 'normal', '600', '700', 'bold', '800'])
  for (const file of sourceFiles(join(root, 'api'))) {
    const source = readFileSync(file, 'utf8')
    for (const [, weight] of source.matchAll(/font-weight[=:]\s*["']?([\w$]+)/g)) {
      assert.ok(shippedWeights.has(weight), `${file} uses font-weight ${weight}`)
    }
  }
})
