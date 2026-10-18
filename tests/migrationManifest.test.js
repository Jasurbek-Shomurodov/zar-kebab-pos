import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMigrationManifestSource, manifestPath } from '../scripts/build-migration-manifest.js'

// The Settings health button compares the live database with this manifest; a stale copy would hide pending migrations.
test('committed migration manifest matches migrations/ (run npm run migrations:manifest)', () => {
  assert.equal(readFileSync(manifestPath, 'utf8'), buildMigrationManifestSource())
})

test('build regenerates the migration manifest before bundling', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.scripts.prebuild, /build-migration-manifest\.js/)
})
