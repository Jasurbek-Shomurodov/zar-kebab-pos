// Generates src/styles/dark-theme.css: the staff workspace dark palette.
//
// Pages colour themselves with hard-coded Tailwind classes (bg-white,
// text-[#1F2937], border-gray-200, ...). Rather than rewrite every page, this
// script scans src/ for those classes and remaps the neutral surfaces, text and
// hairlines (plus pale tinted backgrounds) under html[data-theme="dark"]. Brand
// orange and status colours keep their values. The output is gitignored: the
// Vite plugin below regenerates it on dev start, on every src/ edit, and before
// each build. `npm run theme:dark` writes it by hand.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import twColors from 'tailwindcss/colors.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DARK_THEME_CSS = path.join(ROOT, 'src/styles/dark-theme.css')

// The personal-finance (Hoggish) dark palette: green-tinted near-black
// surfaces and hairlines. Zar Kebab orange stays the accent, as in light mode.
const DARK = {
  shell: '#101412',
  card: '#181e1b',
  muted: '#151b17',
  hover: '#222a25',
  strong: '#2b352f',
  heavy: '#48554c',
  text: '#edf3ef',
  textMuted: '#a1afa5',
  textSubtle: '#839087',
  textFaint: '#5d6a61',
  border: '#303b33',
  borderStrong: '#3d4a41',
}

// The workspace's light semantic inks (--ws-positive/negative/caution) take
// personal-finance's dark values, so money in/out stays readable on dark.
const SEMANTIC_TEXT = {
  '#1d7a52': '#4cc38a',
  '#c4262c': '#f0a096',
  '#9a5a00': '#dfb883',
}

// Pale status surfaces sit close enough to grey that the neutral test would
// flatten them; keep their hue so invalid fields and accents still stand out.
const SEMANTIC_BG = {
  '#fdf3f3': '#3a1c1a',
  '#fef2f2': '#2e1917',
  '#fff1e8': '#33241a',
}

// Status hairlines are dark enough to vanish on a dark surface; lift them.
const SEMANTIC_BORDER = {
  '#c4262c': '#e0645c',
}

// Tailwind variants we can express as plain pseudo-classes.
const VARIANTS = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  'focus-within': ':focus-within',
  active: ':active',
  disabled: ':disabled',
  enabled: ':enabled',
  'group-hover': null, // needs the .group ancestor; handled below
}

const PROPS = {
  bg: { kind: 'bg', css: 'background-color' },
  text: { kind: 'text', css: 'color' },
  placeholder: { kind: 'text', css: 'color', suffix: '::placeholder' },
  fill: { kind: 'text', css: 'fill' },
  stroke: { kind: 'text', css: 'stroke' },
  border: { kind: 'border', css: 'border-color' },
  divide: { kind: 'border', css: 'border-color', suffix: ' > :not([hidden]) ~ :not([hidden])' },
  ring: { kind: 'border', css: '--tw-ring-color' },
  outline: { kind: 'border', css: 'outline-color' },
}

const CLASS_RE = /(?<![\w\-[])((?:[a-z-]+:)*)(!?)(bg|text|placeholder|fill|stroke|border|divide|ring|outline)-([a-z]+-\d{2,3}|white|black|\[#[0-9a-fA-F]{3,8}\])(?:\/(\d{1,3}|\[[\d.]+\]))?(?![\w\-\]])/g

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}

function resolveColor(token) {
  if (token === 'white') return [255, 255, 255]
  if (token === 'black') return [0, 0, 0]
  if (token.startsWith('[#')) return hexToRgb(token.slice(1, -1))
  const [name, shade] = token.split('-')
  const value = twColors[name]?.[shade]
  return typeof value === 'string' && value.startsWith('#') ? hexToRgb(value) : null
}

const clamp = n => Math.max(0, Math.min(255, Math.round(n)))
const hex = rgb => `#${rgb.map(c => clamp(c).toString(16).padStart(2, '0')).join('')}`

/** A pale tint keeps its hue but sits on a dark base. */
function darkTint(rgb, base, strength = 2.2) {
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3
  const b = hexToRgb(base)
  return hex(rgb.map((c, i) => b[i] + (c - mean) * strength))
}

function mix(rgb, target, weight) {
  const t = hexToRgb(target)
  return hex(rgb.map((c, i) => c * weight + t[i] * (1 - weight)))
}

/** The dark replacement for a colour, or null when it already reads on dark. */
function remap(kind, rgb, interactive = false) {
  const avg = (rgb[0] + rgb[1] + rgb[2]) / 765
  const neutral = Math.max(...rgb) - Math.min(...rgb) <= 24
  if (kind === 'bg') {
    if (SEMANTIC_BG[hex(rgb)]) return SEMANTIC_BG[hex(rgb)]
    if (neutral) {
      // Light-mode hovers darken a white surface; on dark they lift it instead.
      if (interactive && avg >= 0.87) return DARK.hover
      if (hex(rgb) === '#f6f5f3') return DARK.shell
      if (avg >= 0.985) return DARK.card
      if (avg >= 0.92) return DARK.muted
      if (avg >= 0.87) return DARK.hover
      if (avg >= 0.7) return DARK.strong
      if (avg >= 0.5) return DARK.heavy
      return null
    }
    return avg >= 0.85 ? darkTint(rgb, DARK.card, 1.4) : null
  }
  if (kind === 'text') {
    if (SEMANTIC_TEXT[hex(rgb)]) return SEMANTIC_TEXT[hex(rgb)]
    if (neutral) {
      if (avg < 0.3) return DARK.text
      if (avg < 0.55) return DARK.textMuted
      if (avg < 0.75) return DARK.textSubtle
      if (avg < 0.9) return DARK.textFaint
      return null
    }
    return avg < 0.3 ? mix(rgb, DARK.text, 0.35) : null
  }
  if (SEMANTIC_BORDER[hex(rgb)]) return SEMANTIC_BORDER[hex(rgb)]
  if (neutral) {
    if (avg > 0.85) return DARK.border
    if (avg > 0.7) return DARK.borderStrong
    return null
  }
  return avg > 0.8 ? darkTint(rgb, DARK.border, 1.6) : null
}

function withAlpha(color, alphaToken, original) {
  const rgb = hexToRgb(color)
  if (!alphaToken) return color === original ? `rgb(${rgb.join(' ')})` : color
  const alpha = alphaToken.startsWith('[') ? Number(alphaToken.slice(1, -1)) : Number(alphaToken) / 100
  return `rgb(${rgb.join(' ')} / ${alpha})`
}

const escapeClass = cls => cls.replace(/[^a-zA-Z0-9_-]/g, '\\$&')

export function buildDarkThemeCss() {
  const classes = new Map()
  for (const file of walk(path.join(ROOT, 'src'))) {
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(CLASS_RE)) classes.set(match[0], match)
  }

  const base = []
  const variant = []
  for (const cls of [...classes.keys()].sort()) {
    const [, prefixText, important, propName, colorToken, alphaToken] = classes.get(cls)
    const prop = PROPS[propName]
    const rgb = resolveColor(colorToken)
    if (!rgb) continue
    const variants = prefixText ? prefixText.slice(0, -1).split(':') : []
    if (variants.some(v => !(v in VARIANTS))) continue
    // A forced translucent white/black is a photo overlay, not a light surface.
    if (important && alphaToken && (colorToken === 'white' || colorToken === 'black')) continue

    const mapped = remap(prop.kind, rgb, variants.some(v => v === 'hover' || v === 'active' || v === 'group-hover'))
    // Variant colours are re-emitted even when unchanged so they still beat a
    // remapped base colour on the same element (e.g. bg-white + hover:bg-orange).
    if (!mapped && variants.length === 0) continue
    const value = withAlpha(mapped || hex(rgb), alphaToken, hex(rgb))

    let selector = `.${escapeClass(cls)}`
    let ancestor = ''
    for (const v of variants) {
      if (v === 'group-hover') ancestor = '.group:hover '
      else selector += VARIANTS[v]
    }
    const rule = `  html[data-theme="dark"] ${ancestor}${selector}${prop.suffix || ''} { ${prop.css}: ${value}${important ? ' !important' : ''}; }`
    ;(variants.length ? variant : base).push(rule)
  }

  return `/* Generated by scripts/build-dark-theme.mjs on dev start, src/ edits and builds — do not edit. */
@media screen {
  html[data-theme="dark"] {
    color-scheme: dark;
    --ws-background: ${DARK.shell};
    --ws-foreground: ${DARK.text};
    --ws-card: ${DARK.card};
    --ws-muted: ${DARK.muted};
    --ws-muted-foreground: ${DARK.textMuted};
    --ws-border: ${DARK.border};
    --ws-input: ${DARK.borderStrong};
    --ws-hover: ${DARK.hover};
    --ws-accent: #33241a;
    --ws-positive: #4cc38a;
    --ws-negative: #f0a096;
    --ws-caution: #dfb883;
    --ws-shadow-card: 0 1px 2px rgb(0 0 0 / 30%);
  }
  html[data-theme="dark"] body { background-color: ${DARK.shell}; color: ${DARK.text}; }

${base.join('\n')}

${variant.join('\n')}
}
`
}

/** Rewrites the stylesheet only when the scanned classes changed it. */
export function writeDarkThemeCss() {
  const next = buildDarkThemeCss()
  let previous = ''
  try { previous = fs.readFileSync(DARK_THEME_CSS, 'utf8') } catch { /* first run */ }
  if (previous !== next) fs.writeFileSync(DARK_THEME_CSS, next)
  return previous !== next
}

export function darkThemePlugin() {
  return {
    name: 'zar-dark-theme',
    buildStart() { writeDarkThemeCss() },
    configureServer(server) {
      writeDarkThemeCss()
      server.watcher.on('change', file => {
        if (file.startsWith(path.join(ROOT, 'src')) && /\.(jsx?|tsx?)$/.test(file)) writeDarkThemeCss()
      })
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeDarkThemeCss()
  console.log(`Wrote ${path.relative(ROOT, DARK_THEME_CSS)}`)
}
