-- Purchase sheet for Ingredients: every Daily Bazaar purchase line of an
-- added (catalog-managed) ingredient in a date range, so the page can show a
-- spreadsheet with ingredients down the side and Tashkent purchase dates
-- across the top, and open the lines behind any cell.
--
-- Read-only. Same access and ingredient scope as get_ingredient_movement
-- (186/188/275): Ingredients access, at most 366 days, managed ingredients
-- only, g/kg, ml/l and pcs/piece normalized so a cell matches the movement
-- totals. Purchase snapshots (names, prices, buyers) are returned as saved.

begin;

create or replace function public.get_ingredient_purchase_sheet(p_date_from date, p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if public.current_staff_can_access('ingredients') is not true then
    raise exception 'Ingredients access required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 365 then
    raise exception 'Choose a date range of at most 366 days';
  end if;
  with lines as (
    select c.product_key as identity, c.product_name as name, c.category,
      case i.unit when 'g' then 'kg' when 'ml' then 'l' when 'pcs' then 'piece' else i.unit end as unit,
      i.quantity * case when i.unit in ('g', 'ml') then 0.001 else 1 end as quantity,
      i.unit as entered_unit, i.quantity as entered_quantity,
      i.line_total::bigint as paid, i.normal_line_total::bigint as normal_paid,
      i.notes as item_notes, p.id as purchase_id, p.purchase_date as date,
      p.payment_method, p.buyer_name, p.notes as purchase_notes, p.created_at,
      i.sort_order
    from public.bazaar_purchase_items i
    join public.bazaar_purchases p on p.id = i.purchase_id
    join public.bazaar_product_catalog c on c.product_key = i.product_key and c.is_catalog_managed is true
    where p.purchase_date between p_date_from and p_date_to
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(l) - 'sort_order' order by l.date, l.created_at, l.sort_order) from lines l), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_ingredient_purchase_sheet(date, date) from public, anon;
grant execute on function public.get_ingredient_purchase_sheet(date, date) to authenticated;

notify pgrst, 'reload schema';

commit;
