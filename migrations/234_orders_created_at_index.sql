-- The Dashboard's ten-day income chart asks for the first order's date
-- (`order by created_at asc limit 1`). orders had only partial created_at
-- indexes (legacy unpaid rows), so that lookup read and sorted the whole table
-- with the RLS check per row: about 2.3 s. A plain index makes it an index-order
-- scan that stops at the first visible row, and also serves other date-ordered
-- order reads.
--
-- Building the index briefly blocks writes to orders; apply outside service
-- hours. It is idempotent.

create index if not exists idx_orders_created_at on public.orders (created_at);

analyze public.orders;
