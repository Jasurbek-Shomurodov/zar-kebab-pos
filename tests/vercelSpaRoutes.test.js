// Guards the Vercel routing that every app screen depends on.
//
// On 2026-11-22 "cleanUrls": true was added to vercel.json for the prerendered
// SEO pages. With it, the SPA catch-all rewrite to /index.html stopped
// resolving, so every client route without its own file (/menu, /admin/*,
// /auth/callback, the receipt print window, ...) returned Vercel's 404 page in
// production while / still worked. These tests derive every route from
// src/App.jsx and check it still reaches the app shell or a prerendered page.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const prerenderSource = fs.readFileSync(path.join(root, 'scripts/prerender-public-seo.mjs'), 'utf8')

// Minimal path-to-regexp for the source syntax vercel.json uses:
// literals, :name, :name*, and raw regex groups such as ((?!api/).*).
function sourceToRegExp(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '(') {
      let depth = 0
      let j = i
      for (; j < source.length; j++) {
        if (source[j] === '\\') { j++; continue }
        if (source[j] === '(') depth++
        if (source[j] === ')' && --depth === 0) break
      }
      out += source.slice(i, j + 1)
      i = j + 1
    } else if (ch === ':') {
      const name = /^:(\w+)([*+?]?)/.exec(source.slice(i))
      out += name[2] === '*' ? '(.*)' : name[2] === '+' ? '(.+)' : name[2] === '?' ? '([^/]*)' : '([^/]+)'
      i += name[0].length
    } else {
      out += ch.replace(/[.+?^${}|[\]\\]/g, '\\$&')
      i++
    }
  }
  return new RegExp(`^${out}$`)
}

// Rewrites that apply on every host (none of ours are host-scoped, but stay safe).
const rewrites = vercel.rewrites.filter(rule => !rule.has)

function resolveRewrite(pathname) {
  return rewrites.find(rule => sourceToRegExp(rule.source).test(pathname))
}

function concretePath(routePath) {
  return routePath
    .replace(/:(\w+)/g, (_, name) => `sample-${name}`)
    .replace(/\/\*$/, '/sample/deep')
}

const appRoutes = [...new Set(
  [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]),
)].filter(routePath => routePath !== '*')

const prerenderedSections = new Set(
  [...prerenderSource.matchAll(/route:\s*'\/([\w-]+)'/g)].map(match => match[1]),
)

test('vercel.json never enables URL options that broke the SPA fallback', () => {
  // cleanUrls made /index.html rewrites 404 for every app route in production.
  assert.equal(vercel.cleanUrls, undefined, 'cleanUrls must stay unset: it 404s every app route')
  // trailingSlash rewrites every app URL the same way; keep it off too.
  assert.equal(vercel.trailingSlash, undefined, 'trailingSlash must stay unset')
})

test('the SPA catch-all rewrite exists, is last, and spares only api and the proxy', () => {
  const last = vercel.rewrites.at(-1)
  assert.equal(last.destination, '/index.html', 'the last rewrite must be the SPA fallback')
  assert.equal(last.has, undefined, 'the SPA fallback must apply on every host')
  const fallback = sourceToRegExp(last.source)
  assert.ok(fallback.test('/admin/accounting'))
  assert.ok(fallback.test('/'))
  assert.ok(!fallback.test('/api/telegram/webhook'))
  assert.ok(!fallback.test('/sb/rest/v1/orders'))
})

test('every client route in App.jsx reaches the app shell or its prerendered page', () => {
  assert.ok(appRoutes.length > 40, `expected the full route table, parsed ${appRoutes.length}`)
  for (const required of ['/admin', '/auth/callback', '/menu', '/receipt/:orderId', '/waiter/tables', '/telegram']) {
    assert.ok(appRoutes.includes(required), `route table parse missed ${required}`)
  }
  for (const routePath of appRoutes) {
    const pathname = concretePath(routePath)
    const rule = resolveRewrite(pathname)
    assert.ok(rule, `${routePath} (${pathname}) matches no rewrite and would 404 in production`)
    const section = /^\/([\w-]+)\.html$/.exec(rule.destination)?.[1]
    assert.ok(
      rule.destination === '/index.html' || (section && prerenderedSections.has(section)),
      `${routePath} rewrites to ${rule.destination}, which the build does not produce`,
    )
  }
})

test('no redirect hijacks app routes on the production hosts', () => {
  for (const rule of vercel.redirects || []) {
    assert.ok(rule.has?.length, `redirect ${rule.source} applies on every host and could swallow app routes`)
    for (const condition of rule.has) {
      assert.ok(!['admin.zarkebab.uz', 'www.zarkebab.uz', 'zarkebab.uz'].includes(condition.value),
        `redirect ${rule.source} targets production host ${condition.value}`)
    }
  }
})
