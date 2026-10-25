-- Corrects the starting row seeded by 260. That seed assumed the column
-- default (10,000,000 UZS) applied from the start, but the target in effect
-- before the 25 October 2026 change was 8,000,000 UZS. Only the seeded
-- starting row is touched, and only while it still holds the assumed default.

begin;
set local lock_timeout = '5s';

update public.business_break_even_target_history h
set amount_uzs = 8000000
where h.amount_uzs = 10000000
  and h.changed_by is null
  and h.effective_from = (select min(effective_from) from public.business_break_even_target_history);

commit;
