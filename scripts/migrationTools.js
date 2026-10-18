import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { migrationStatus, migrationHealthIssues as sharedMigrationHealthIssues } from '../src/lib/migrationHealth.js'

export { migrationStatus }

export const migrationDirectory = new URL('../migrations/', import.meta.url)
export function migrationFiles(directory = migrationDirectory) {
  const names = readdirSync(directory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()
  const legacyDuplicates = new Set(['073_business_settings_monthly_rent.sql', '073_feature_access_pos_policies.sql', '108_add_breakfast_menu.sql', '108_employee_salary_payment_notification_deliveries.sql', '157_dashboard_monthly_income_snapshots.sql', '157_salary_payment_employee_chat_tracking.sql'])
  const prefixes = new Map()
  for (const name of names) {
    const prefix = name.slice(0, 3)
    if (prefixes.has(prefix) && !(legacyDuplicates.has(name) && legacyDuplicates.has(prefixes.get(prefix)))) throw new Error(`Duplicate migration number: ${prefix}`)
    prefixes.set(prefix, name)
  }
  return names.map(filename => {
    const sql = readFileSync(new URL(filename, directory), 'utf8')
    return { filename, sql, sha256: createHash('sha256').update(sql).digest('hex') }
  })
}

// Split SQL at top-level semicolons, preserving function bodies, comments and quoted strings.
export function sqlStatements(sql) {
  const result = []
  let start = 0, i = 0
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end + 1; continue }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2 }
        else if (sql.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      if (depth) throw new Error('Unterminated SQL comment')
      continue
    }
    const dollar = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0]
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length)
      if (end < 0) throw new Error('Unterminated SQL body')
      i = end + dollar.length; continue
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]
      let closed = false
      while (i < sql.length) {
        if (sql[i] === quote) {
          i++
          if (sql[i] === quote) { i++; continue }
          closed = true; break
        }
        if (sql[i] === '\\' && quote === "'") i++
        i++
      }
      if (!closed) throw new Error('Unterminated SQL string')
      continue
    }
    if (sql[i] === ';') { result.push(sql.slice(start, i + 1)); start = i + 1 }
    i++
  }
  if (sql.slice(start).trim()) result.push(sql.slice(start))
  return result
}
const command = sql => sql.replace(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g, '').trim()
export function migrationBody(sql) {
  const statements = sqlStatements(sql).filter(s => command(s))
  if (/^begin\s*;$/i.test(command(statements[0] || ''))) {
    if (!/^commit\s*;$/i.test(command(statements.at(-1) || ''))) throw new Error('Migration must end with COMMIT')
    statements.shift(); statements.pop()
  }
  if (statements.some(s => /^(begin|commit|rollback|start\s+transaction|end|savepoint|release|prepare\s+transaction)\b/i.test(command(s)))) {
    throw new Error('Internal transaction control is not supported')
  }
  return statements.join('\n')
}

export function trackedMigrationSql(migration) {
  const { filename, sha256, sql } = migration
  if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(filename) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid migration identity')
  const body = migrationBody(sql)
  // SQL Editor export and API execution have identical locking, receipt and rollback semantics.
  if (body.includes('$apply_migration$') || body.includes('$migration_body$')) throw new Error('Reserved migration delimiter')
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(198183199);
${filename === '199_migration_tracking.sql' ? body : ''}
do $apply_migration$
declare previous_hash text;
begin
  select sha256 into previous_hash from public.app_schema_migrations where filename = '${filename}';
  if previous_hash is not null then
    if previous_hash <> '${sha256}' then raise exception 'Migration checksum mismatch: ${filename}'; end if;
    return;
  end if;
  ${filename === '199_migration_tracking.sql' ? '' : `execute $migration_body$${body}$migration_body$;`}
  insert into public.app_schema_migrations(filename, sha256) values ('${filename}', '${sha256}');
end;
$apply_migration$;
commit;
`
}

// Migrations that rewrite live function bodies in place instead of restating them.
// Mirror each rewrite so earlier definitions still fingerprint like the live ones.
const inPlaceFunctionRewrites = [
  {
    filename: '214_custom_ingredient_categories.sql',
    names: ['save_bazaar_ingredient'],
    apply: body => body.includes('is_valid_bazaar_category') ? body : body
      .replace("lower(btrim(coalesce(payload ->> 'category', '')))", "public.normalize_bazaar_category(payload ->> 'category')")
      .replace(/ingredient_category not in \([^)]*\)/g, 'not public.is_valid_bazaar_category(ingredient_category)'),
  },
  {
    filename: '239_bazaar_ingredient_pieces_per_unit.sql',
    names: ['save_bazaar_ingredient'],
    apply: body => body.includes('pieces_per_unit') ? body : body
      .replace('product_key, product_name, category, unit, normal_unit_price,', 'product_key, product_name, category, unit, normal_unit_price, pieces_per_unit,')
      .replace('ingredient_price::integer, true,', "ingredient_price::integer, public.bazaar_ingredient_pieces_per_unit(ingredient_unit, payload ->> 'pieces_per_unit'), true,")
      .replace('normal_unit_price = excluded.normal_unit_price,', 'normal_unit_price = excluded.normal_unit_price,\n      pieces_per_unit = excluded.pieces_per_unit,'),
  },
  // Same substitution as the migration's regexp_replace over pg_get_functiondef.
  { filename: '246_stale_write_errors_not_serialization_failure.sql', apply: body => body.replace(/errcode\s*=\s*'40001'/g, "errcode = 'PT409'") },
]

export function recentFunctionFingerprints(files = migrationFiles()) {
  const latest = new Map()
  for (const file of files) {
    for (const match of file.sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([^]*?\bas\s+(\$\w*\$)([^]*?)\2/gi)) {
      latest.set(match[1], { name: match[1], filename: file.filename, body: match[3] })
    }
    for (const match of file.sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
      if (latest.get(match[1])?.filename !== file.filename) latest.delete(match[1])
    }
  }
  const present = new Set(files.map(file => file.filename))
  const rewrites = inPlaceFunctionRewrites.filter(rewrite => present.has(rewrite.filename))
  return [...latest.values()]
    .filter(f => Number(f.filename.slice(0, 3)) >= 180)
    .map(({ name, filename, body }) => {
      for (const rewrite of rewrites) if (filename < rewrite.filename && (!rewrite.names || rewrite.names.includes(name))) body = rewrite.apply(body)
      return { name, filename, md5: createHash('md5').update(body).digest('hex') }
    })
}

export function migrationHealthIssues(catalog, expected = recentFunctionFingerprints()) {
  return sharedMigrationHealthIssues(catalog, expected)
}
