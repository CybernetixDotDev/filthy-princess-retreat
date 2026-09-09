create or replace function public.get_private_arrival_availability(p_product_id uuid,p_format public.retreat_format,p_guest_count smallint,p_nights smallint,p_month_start date,p_month_end date)
returns table (arrival_date date) language sql security definer set search_path = '' as $$
  select d::date from generate_series(greatest(p_month_start,current_date)::timestamp,p_month_end::timestamp,interval '1 day') d
  where p_format <> 'join_a_group'
    and p_nights between 1 and 31
    and not exists (select 1 from generate_series(d::date,(d::date + (p_nights-1)),interval '1 day') stay where
      not exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id=p_product_id) and (a.retreat_format is null or a.retreat_format=p_format) and a.state='available' and a.start_date<=stay::date and a.end_date>=stay::date and (a.capacity is null or a.capacity>=p_guest_count))
      or exists (select 1 from public.retreat_availability a where (a.retreat_product_id is null or a.retreat_product_id=p_product_id) and (a.retreat_format is null or a.retreat_format=p_format) and a.state='blocked' and a.start_date<=stay::date and a.end_date>=stay::date)
      or exists (select 1 from public.retreat_bookings b where b.retreat_event_id is null and b.booking_status in ('confirmed','completed') and b.start_date<=stay::date and coalesce(b.end_date,b.start_date)>=stay::date)
      or exists (select 1 from public.retreat_holds h where h.retreat_event_id is null and h.status='active' and h.expires_at>now() and h.start_date<=stay::date and coalesce(h.end_date,h.start_date)>=stay::date)
      or exists (select 1 from public.retreat_events e where e.status='published' and e.start_date<=stay::date and e.end_date>=stay::date)
    ) order by d;
$$;
grant execute on function public.get_private_arrival_availability(uuid,public.retreat_format,smallint,smallint,date,date) to anon, authenticated;
