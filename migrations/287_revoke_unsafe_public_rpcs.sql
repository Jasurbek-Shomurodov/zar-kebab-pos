-- Close three SECURITY DEFINER functions that anyone could call.
--
-- Migrations 039/040 only revoked execute "from public". Supabase grants
-- anon and authenticated directly, so the public site key could still run
-- cleanup_test_operations / cleanup_preserve_real_operations (they delete
-- orders, including paid history, and disable the paid-items guard) and
-- settle_loyalty_wallet_payment (027; sets any card's balance and has no
-- staff check). The app no longer calls the loyalty function, and the
-- cleanup script uses the service role, so only service_role keeps access.

begin;
set local lock_timeout = '5s';

revoke all on function public.cleanup_test_operations(timestamptz, text[], boolean)
  from public, anon, authenticated;
revoke all on function public.cleanup_preserve_real_operations(timestamptz, text[], boolean)
  from public, anon, authenticated;
revoke all on function public.settle_loyalty_wallet_payment(jsonb)
  from public, anon, authenticated;

grant execute on function public.cleanup_test_operations(timestamptz, text[], boolean) to service_role;
grant execute on function public.cleanup_preserve_real_operations(timestamptz, text[], boolean) to service_role;
grant execute on function public.settle_loyalty_wallet_payment(jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
