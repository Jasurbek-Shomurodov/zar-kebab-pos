-- Stale-data rejections must not use SQLSTATE 40001 (serialization_failure).
--
-- PostgREST runs every RPC through hasql-transaction, which transparently
-- re-runs a transaction that fails with 40001 until it succeeds. Our RPCs used
-- 40001 for deterministic "Order item changed or unavailable. Refresh the bill."
-- style rejections, so one stale bill edit made PostgREST re-run the function
-- forever (~100 failures/s per stuck request, Postgres CPU at 100%, the client
-- never received a response).
--
-- PT409 is PostgREST's custom-status code: it returns HTTP 409 Conflict once
-- and is never retried. Function bodies are rewritten in place so nothing else
-- in these large definitions changes.
begin;
set local lock_timeout = '5s';

do $$
declare
  fn record;
  def text;
  patched text;
begin
  for fn in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_bill_item_quantity',
        'settle_orders_payment',
        'settle_orders_payment_strict',
        'split_paid_order_payment',
        'change_paid_order_payment_method_owner'
      )
  loop
    def := pg_get_functiondef(fn.oid);
    patched := regexp_replace(def, 'errcode\s*=\s*''40001''', 'errcode = ''PT409''', 'g');
    if patched <> def then
      execute patched;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ 'errcode\s*=\s*''40001'''
  ) then
    raise exception 'A public function still raises SQLSTATE 40001';
  end if;
end;
$$;

commit;
