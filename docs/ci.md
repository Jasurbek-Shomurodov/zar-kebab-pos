# CI checks and the coverage floor

`.github/workflows/checks.yml` runs on every push and pull request: `npm ci`,
`npm audit --omit=dev --audit-level=high`, `npm run test:coverage`,
`npm run docs:check` and `npm run build`. Actions are pinned by commit SHA.

`npm run test:coverage` runs the whole `node --test` suite under Node's built-in
coverage (the PGlite migration tests need no system package) and writes
`coverage/lcov.info`. `scripts/check-coverage-floor.mjs` then compares it with
`scripts/coverage-floor.json`: the job fails when line, branch or function
coverage drops below the recorded floor, or when a file under `src`, `api`,
`bots`, `mcp`, `migrations` or `scripts` that no test runs is missing from the
`untested` list. The floor only rises: when the script reports that coverage is
above the floor or that a listed file is now tested, raise the numbers or shorten
the list in the same change as the new tests.

A high or critical audit finding in a shipped dependency also fails the job. Fix
it by updating the dependency, not by relaxing the audit.
