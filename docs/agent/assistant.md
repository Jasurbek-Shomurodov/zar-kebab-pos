# AI Assistant

Read this guide for the `/admin/assistant` chat page, its data tools, Excel exports, and model providers. It is built on the shared `hoggish-assistant` library (latest GitHub release tag, refreshed before every build by `scripts/update-hoggish-assistant.cjs`), also used by Game Club Finance.

## Entry points

- Page: `src/pages/AdminAssistant.jsx` (library `useAssistantChat` + `AssistantMarkdown`; route in `src/App.jsx`, drawer in `src/components/UnifiedSidebar.jsx`). The header shows the answering model (`chat.model`) and the free quota; the footer adds context-window use (`chat.context`). The question box is an auto-growing textarea.
- Endpoint: `api/assistant/index.js` — `GET` quota, `POST` streamed answer (NDJSON). One Vercel function on purpose: the Hobby plan allows 12 (`tests/telegramSalaryMessages.test.js` counts them).
- Handler: `api/assistant/_lib/assistant.js` (`createZarAssistant`: authorize, provider, tools, quota store; dependencies injectable for tests). `api/assistant/_lib/node.js` bridges Node `(req, res)` to the library's Web handler.
- Tools: `api/assistant/_lib/tools.js`; data: `api/assistant/_lib/loaders.js`; shared, browser-safe: `src/lib/assistant/`
- Migration: `migrations/251_ai_assistant.sql` (its usage table/RPC match the library's `sql/assistant_model_usage.sql`)
- Tests: `tests/assistant.test.js`

## Access and data

- `assistant` is a Team page feature; owners with a null list get it. `251` extends `profiles_feature_access_valid`; `tests/permissions.test.js` keeps it equal to `FEATURE_KEYS`.
- `authorize` takes the bearer token, builds a Supabase client acting as the caller (anon key + their token), checks `auth.getUser()` and an active profile with `assistant`. Every tool reads through that client, so RLS and RPC checks apply. The service role is used only for the quota store.
- Datasets follow the caller's other features (`allowedDatasets`): Accounting gives `summary`, `daily`, `categories`, `expenses`; Financial analysis adds `monthly`; Reports gives `dish_sales`. Payroll ledgers, recipes and per-product costs are never offered.
- Datasets reuse page loaders and math (`loadReportsAccountingBundle`, `getAccountingPageSummaryFromOrderSummary`, `loadAccountingMonthlyCashflow`, `buildDailySpending`, `getDishSalesAnalysis`). Never add assistant-only money math.
- Periods resolve against the Tashkent date: at most 366 days, or 92 for order-based `daily` and `dish_sales`.
- Tools are read-only (no `needsConfirmation`). The browser keeps the chat. The language travels in the `x-assistant-lang` header, not chat context, so switching it never refetches the quota or resets the chat.

## Providers

- `providerFromEnv`: `ASSISTANT_PROVIDER=gemini` with Zar Kebab's own `GEMINI_API_KEY` (free chain, own quota), or `anthropic` with `ANTHROPIC_API_KEY`. Keys live in Vercel env and `.env.local` only.
- The library walks the free Gemini chain on 429/404/5xx. There is no per-model timeout, so a model that accepts a request but never responds stalls the answer until `maxDuration` (120 s in `vercel.json`).
