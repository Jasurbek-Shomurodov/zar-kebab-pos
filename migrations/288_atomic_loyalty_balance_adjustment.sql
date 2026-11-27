-- Atomic manual loyalty balance adjustment.
--
-- AdminLoyalty used to compute the new balance in the browser, update
-- loyalty_cards, then insert the history row in a second request. Two owners
-- (or a cashier payment) touching the same card could overwrite each other,
-- and a failed history insert left a balance change with no record.
-- This RPC locks the card, checks the balance the owner saw, and writes the
-- card and its manual_adjustment row in one transaction.
-- Apply before deploying the AdminLoyalty change that calls it.

begin;
set local lock_timeout = '5s';

create or replace function public.adjust_loyalty_card_balance(
  p_card_id uuid,
  p_expected_balance integer,
  p_amount integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.loyalty_cards%rowtype;
  v_after integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null
    or not public.current_staff_has_role(array['owner'])
    or not public.current_staff_can_write('loyalty') then
    raise exception 'Only an owner with Loyalty access can adjust balances' using errcode = '42501';
  end if;
  if p_card_id is null or p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select * into v_card from public.loyalty_cards where id = p_card_id for update;
  if not found then
    raise exception 'card_not_found' using errcode = 'P0002';
  end if;
  if v_card.balance <> coalesce(p_expected_balance, -1) then
    -- PT409, never 40001: PostgREST would retry a serialization failure forever (246).
    raise exception 'balance_changed' using errcode = 'PT409';
  end if;

  v_after := v_card.balance + p_amount;
  if v_after < 0 then
    raise exception 'negative_balance' using errcode = '22023';
  end if;

  update public.loyalty_cards
     set balance = v_after,
         total_earned = total_earned + greatest(p_amount, 0),
         total_redeemed = total_redeemed + greatest(-p_amount, 0),
         updated_at = now()
   where id = v_card.id
  returning * into v_card;

  insert into public.loyalty_transactions (
    loyalty_card_id, type, amount, balance_before, balance_after, reason,
    created_by, card_type_at_transaction, card_number_at_transaction,
    customer_name_at_transaction, created_at
  ) values (
    v_card.id, 'manual_adjustment', p_amount, v_after - p_amount, v_after, v_reason,
    auth.uid(), v_card.cashback_type, v_card.card_number,
    coalesce(v_card.customer_name, ''), now()
  );

  return to_jsonb(v_card);
end;
$$;

revoke all on function public.adjust_loyalty_card_balance(uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.adjust_loyalty_card_balance(uuid, integer, integer, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
