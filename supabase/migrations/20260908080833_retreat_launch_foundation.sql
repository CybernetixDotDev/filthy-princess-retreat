create extension if not exists pgcrypto with schema extensions;

create type public.retreat_format as enum ('solo', 'couples', 'private_group', 'join_a_group');
create type public.availability_state as enum ('available', 'blocked');
create type public.event_status as enum ('draft', 'published', 'full', 'cancelled', 'completed');
create type public.enquiry_status as enum ('new', 'contacted', 'qualified', 'quoted', 'awaiting_payment', 'confirmed', 'completed', 'declined', 'cancelled');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'expired', 'cancelled');
create type public.payment_status as enum ('unpaid', 'deposit_received', 'paid', 'refunded');
create type public.booking_status as enum ('confirmed', 'completed', 'cancelled');

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.retreat_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  positioning text not null,
  allowed_formats public.retreat_format[] not null,
  is_published boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_products_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint retreat_products_formats_present check (cardinality(allowed_formats) > 0)
);

create table public.retreat_availability (
  id uuid primary key default gen_random_uuid(),
  retreat_product_id uuid not null references public.retreat_products(id) on delete cascade,
  retreat_format public.retreat_format not null,
  start_date date not null,
  end_date date not null,
  state public.availability_state not null default 'available',
  capacity smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_availability_dates_valid check (end_date >= start_date),
  constraint retreat_availability_capacity_valid check (capacity is null or capacity > 0)
);

create table public.retreat_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  retreat_product_id uuid not null references public.retreat_products(id) on delete restrict,
  retreat_format public.retreat_format not null default 'join_a_group',
  start_date date not null,
  end_date date not null,
  capacity smallint not null,
  available_places smallint not null,
  status public.event_status not null default 'draft',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_events_join_group_only check (retreat_format = 'join_a_group'),
  constraint retreat_events_dates_valid check (end_date >= start_date),
  constraint retreat_events_capacity_valid check (capacity > 0 and available_places between 0 and capacity)
);

create table public.retreat_enquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  country text not null,
  retreat_product_id uuid not null references public.retreat_products(id) on delete restrict,
  retreat_type_name text not null,
  retreat_format public.retreat_format not null,
  guest_count smallint not null,
  requested_start_date date,
  requested_end_date date,
  alternative_date date,
  retreat_event_id uuid references public.retreat_events(id) on delete set null,
  message text,
  referral_code text,
  referral_source text,
  status public.enquiry_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_enquiries_guest_count_valid check (guest_count between 1 and 50),
  constraint retreat_enquiries_email_sensible check (position('@' in email) > 1),
  constraint retreat_enquiries_requested_date_present check (requested_start_date is not null or retreat_event_id is not null),
  constraint retreat_enquiries_dates_valid check (requested_end_date is null or requested_start_date is not null and requested_end_date >= requested_start_date),
  constraint retreat_enquiries_message_length check (message is null or char_length(message) <= 2000),
  constraint retreat_enquiries_referral_length check (referral_code is null or char_length(referral_code) <= 100)
);

create table public.retreat_quotes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  enquiry_id uuid not null references public.retreat_enquiries(id) on delete restrict,
  retreat_product_id uuid not null references public.retreat_products(id) on delete restrict,
  retreat_type_name text not null,
  retreat_format public.retreat_format not null,
  start_date date not null,
  end_date date,
  duration_days smallint,
  guest_count smallint not null,
  total_price numeric(12,2) not null,
  deposit_required numeric(12,2) not null,
  currency text not null,
  expiry_date date not null,
  notes text,
  payment_instructions text not null,
  payment_token_hash text not null unique,
  status public.quote_status not null default 'sent',
  payment_status public.payment_status not null default 'unpaid',
  payment_received_at timestamptz,
  created_at timestamptz not null default now(),
  constraint retreat_quotes_dates_valid check (end_date is null or end_date >= start_date),
  constraint retreat_quotes_duration_valid check (duration_days is null or duration_days > 0),
  constraint retreat_quotes_guest_count_valid check (guest_count between 1 and 50),
  constraint retreat_quotes_amounts_valid check (total_price >= 0 and deposit_required >= 0 and deposit_required <= total_price),
  constraint retreat_quotes_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.retreat_bookings (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.retreat_enquiries(id) on delete restrict,
  retreat_product_id uuid not null references public.retreat_products(id) on delete restrict,
  retreat_type_name text not null,
  retreat_format public.retreat_format not null,
  start_date date not null,
  end_date date,
  guest_count smallint not null,
  retreat_event_id uuid references public.retreat_events(id) on delete set null,
  quote_id uuid not null unique references public.retreat_quotes(id) on delete restrict,
  booking_status public.booking_status not null default 'confirmed',
  payment_status public.payment_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retreat_bookings_dates_valid check (end_date is null or end_date >= start_date),
  constraint retreat_bookings_guest_count_valid check (guest_count between 1 and 50)
);

create index retreat_availability_lookup_idx on public.retreat_availability(retreat_product_id, retreat_format, state, start_date, end_date);
create index retreat_events_lookup_idx on public.retreat_events(retreat_product_id, status, start_date);
create index retreat_enquiries_created_idx on public.retreat_enquiries(created_at desc);
create index retreat_enquiries_status_created_idx on public.retreat_enquiries(status, created_at desc);
create index retreat_enquiries_product_idx on public.retreat_enquiries(retreat_product_id);
create index retreat_enquiries_event_idx on public.retreat_enquiries(retreat_event_id);
create index retreat_quotes_enquiry_idx on public.retreat_quotes(enquiry_id);
create index retreat_quotes_product_idx on public.retreat_quotes(retreat_product_id);
create index retreat_bookings_product_idx on public.retreat_bookings(retreat_product_id);
create index retreat_bookings_event_idx on public.retreat_bookings(retreat_event_id);

create schema if not exists retreat_private;
revoke all on schema retreat_private from public, anon, authenticated;

create function retreat_private.is_retreat_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.admin_users
      where user_id = (select auth.uid())
    );
$$;
revoke all on function retreat_private.is_retreat_admin() from public, anon, authenticated;
grant usage on schema retreat_private to authenticated;
grant execute on function retreat_private.is_retreat_admin() to authenticated;

create function public.submit_retreat_enquiry(
  p_full_name text,
  p_email text,
  p_phone text,
  p_country text,
  p_retreat_product_id uuid,
  p_retreat_format public.retreat_format,
  p_guest_count smallint,
  p_selected_date date,
  p_alternative_date date,
  p_event_id uuid,
  p_message text,
  p_referral_code text,
  p_referral_source text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_product public.retreat_products%rowtype;
  selected_event public.retreat_events%rowtype;
  new_enquiry_id uuid;
  requested_start date;
  requested_end date;
begin
  if char_length(trim(p_full_name)) not between 2 and 200
    or char_length(trim(p_phone)) not between 3 and 100
    or char_length(trim(p_country)) not between 2 and 100
    or char_length(trim(p_email)) > 320
    or position('@' in trim(p_email)) <= 1
    or p_guest_count not between 1 and 50
    or (p_message is not null and char_length(p_message) > 2000)
    or (p_referral_code is not null and p_referral_code !~ '^[A-Za-z0-9_-]{1,100}$')
    or (p_referral_source is not null and p_referral_source <> 'url') then
    raise exception 'Invalid enquiry details';
  end if;

  select * into selected_product
  from public.retreat_products
  where id = p_retreat_product_id
    and is_published
    and p_retreat_format = any(allowed_formats);

  if selected_product.id is null then
    raise exception 'Retreat selection is unavailable';
  end if;

  if p_event_id is not null then
    if p_retreat_format <> 'join_a_group' then
      raise exception 'Group events require the Join a Group format';
    end if;

    select * into selected_event
    from public.retreat_events
    where id = p_event_id
      and retreat_product_id = p_retreat_product_id
      and retreat_format = 'join_a_group'
      and status = 'published'
      and start_date >= current_date
      and available_places >= p_guest_count;

    if selected_event.id is null then
      raise exception 'Group event is unavailable';
    end if;
    requested_start := selected_event.start_date;
    requested_end := selected_event.end_date;
  else
    if p_retreat_format = 'join_a_group' or p_selected_date is null or p_selected_date < current_date then
      raise exception 'An available date or group event is required';
    end if;

    if not exists (
      select 1
      from public.retreat_availability a
      where a.retreat_product_id = p_retreat_product_id
        and a.retreat_format = p_retreat_format
        and a.state = 'available'
        and a.start_date <= p_selected_date
        and a.end_date >= p_selected_date
        and (a.capacity is null or a.capacity >= p_guest_count)
    ) or exists (
      select 1
      from public.retreat_availability a
      where a.retreat_product_id = p_retreat_product_id
        and a.retreat_format = p_retreat_format
        and a.state = 'blocked'
        and a.start_date <= p_selected_date
        and a.end_date >= p_selected_date
    ) then
      raise exception 'Selected date is unavailable';
    end if;
    requested_start := p_selected_date;
    requested_end := null;
  end if;

  insert into public.retreat_enquiries (
    full_name, email, phone, country, retreat_product_id, retreat_type_name,
    retreat_format, guest_count, requested_start_date, requested_end_date,
    alternative_date, retreat_event_id, message, referral_code, referral_source
  ) values (
    trim(p_full_name), lower(trim(p_email)), trim(p_phone), trim(p_country),
    selected_product.id, selected_product.name, p_retreat_format, p_guest_count,
    requested_start, requested_end, p_alternative_date, p_event_id,
    nullif(trim(p_message), ''), p_referral_code, p_referral_source
  )
  returning id into new_enquiry_id;

  return new_enquiry_id;
end;
$$;
revoke all on function public.submit_retreat_enquiry(text, text, text, text, uuid, public.retreat_format, smallint, date, date, uuid, text, text, text) from public;
grant execute on function public.submit_retreat_enquiry(text, text, text, text, uuid, public.retreat_format, smallint, date, date, uuid, text, text, text) to anon, authenticated;

create function public.get_retreat_quote_by_token(raw_token text)
returns table (
  reference text,
  retreat_type_name text,
  retreat_format public.retreat_format,
  start_date date,
  end_date date,
  guest_name text,
  guest_count smallint,
  total_price numeric,
  deposit_required numeric,
  currency text,
  expiry_date date,
  notes text,
  payment_instructions text,
  quote_status public.quote_status,
  payment_status public.payment_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.reference, q.retreat_type_name, q.retreat_format, q.start_date,
    q.end_date, e.full_name, q.guest_count, q.total_price,
    q.deposit_required, q.currency, q.expiry_date, q.notes,
    q.payment_instructions, q.status, q.payment_status
  from public.retreat_quotes q
  join public.retreat_enquiries e on e.id = q.enquiry_id
  where q.payment_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and q.status in ('sent', 'accepted')
    and (q.expiry_date >= current_date or q.payment_status <> 'unpaid');
$$;
revoke all on function public.get_retreat_quote_by_token(text) from public;
grant execute on function public.get_retreat_quote_by_token(text) to anon, authenticated;

create function public.confirm_retreat_booking(target_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_quote public.retreat_quotes%rowtype;
  selected_enquiry public.retreat_enquiries%rowtype;
  selected_event public.retreat_events%rowtype;
  new_booking_id uuid;
begin
  if not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;

  select * into selected_quote from public.retreat_quotes where id = target_quote_id for update;
  if selected_quote.id is null then raise exception 'Quote not found'; end if;
  if selected_quote.payment_status not in ('deposit_received', 'paid') then
    raise exception 'Payment must be verified before confirmation';
  end if;
  select * into selected_enquiry from public.retreat_enquiries where id = selected_quote.enquiry_id for update;

  if selected_enquiry.retreat_event_id is not null then
    select * into selected_event
    from public.retreat_events
    where id = selected_enquiry.retreat_event_id
    for update;
    if selected_event.id is null
      or selected_event.available_places < selected_quote.guest_count
      or selected_event.status <> 'published'
      or selected_event.start_date <> selected_quote.start_date
      or selected_event.end_date <> selected_quote.end_date then
      raise exception 'Group event no longer has enough places or the quote dates do not match';
    end if;
  end if;

  insert into public.retreat_bookings (
    enquiry_id, retreat_product_id, retreat_type_name, retreat_format,
    start_date, end_date, guest_count, retreat_event_id, quote_id, payment_status
  ) values (
    selected_enquiry.id, selected_quote.retreat_product_id, selected_quote.retreat_type_name,
    selected_quote.retreat_format, selected_quote.start_date, selected_quote.end_date,
    selected_quote.guest_count, selected_enquiry.retreat_event_id, selected_quote.id,
    selected_quote.payment_status
  )
  on conflict (enquiry_id) do nothing
  returning id into new_booking_id;

  if new_booking_id is not null and selected_event.id is not null then
    update public.retreat_events
    set available_places = available_places - selected_quote.guest_count,
        status = case when available_places - selected_quote.guest_count <= 0 then 'full'::public.event_status else status end
    where id = selected_event.id;
  end if;

  update public.retreat_enquiries set status = 'confirmed' where id = selected_enquiry.id;
  if new_booking_id is null then
    select id into new_booking_id from public.retreat_bookings where enquiry_id = selected_enquiry.id;
  end if;
  return new_booking_id;
end;
$$;
revoke all on function public.confirm_retreat_booking(uuid) from public, anon;
grant execute on function public.confirm_retreat_booking(uuid) to authenticated;

create function public.update_retreat_booking(
  target_booking_id uuid,
  target_booking_status public.booking_status,
  target_payment_status public.payment_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_booking public.retreat_bookings%rowtype;
  selected_event public.retreat_events%rowtype;
begin
  if not (select retreat_private.is_retreat_admin()) then
    raise exception 'Not authorized';
  end if;

  select * into selected_booking
  from public.retreat_bookings
  where id = target_booking_id
  for update;
  if selected_booking.id is null then raise exception 'Booking not found'; end if;

  if selected_booking.retreat_event_id is not null
    and selected_booking.booking_status <> target_booking_status then
    select * into selected_event
    from public.retreat_events
    where id = selected_booking.retreat_event_id
    for update;

    if target_booking_status = 'cancelled' and selected_booking.booking_status <> 'cancelled' then
      update public.retreat_events
      set available_places = least(capacity, available_places + selected_booking.guest_count),
          status = case
            when status = 'full' and end_date >= current_date then 'published'::public.event_status
            else status
          end
      where id = selected_event.id;
    elsif selected_booking.booking_status = 'cancelled' and target_booking_status <> 'cancelled' then
      if selected_event.status not in ('published', 'full')
        or selected_event.available_places < selected_booking.guest_count then
        raise exception 'Group event no longer has enough places';
      end if;
      update public.retreat_events
      set available_places = available_places - selected_booking.guest_count,
          status = case
            when available_places - selected_booking.guest_count <= 0 then 'full'::public.event_status
            else status
          end
      where id = selected_event.id;
    end if;
  end if;

  update public.retreat_bookings
  set booking_status = target_booking_status,
      payment_status = target_payment_status
  where id = selected_booking.id;

  update public.retreat_quotes
  set payment_status = target_payment_status,
      payment_received_at = case
        when target_payment_status in ('deposit_received', 'paid') then coalesce(payment_received_at, now())
        else payment_received_at
      end
  where id = selected_booking.quote_id;

  update public.retreat_enquiries
  set status = case target_booking_status
    when 'confirmed' then 'confirmed'::public.enquiry_status
    when 'completed' then 'completed'::public.enquiry_status
    when 'cancelled' then 'cancelled'::public.enquiry_status
  end
  where id = selected_booking.enquiry_id;
end;
$$;
revoke all on function public.update_retreat_booking(uuid, public.booking_status, public.payment_status) from public, anon, authenticated;
grant execute on function public.update_retreat_booking(uuid, public.booking_status, public.payment_status) to authenticated;

create function public.retreat_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.retreat_set_updated_at() from public, anon, authenticated;

create function public.protect_quote_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(new.enquiry_id, new.retreat_product_id, new.retreat_type_name, new.retreat_format,
      new.start_date, new.end_date, new.duration_days, new.guest_count, new.total_price,
      new.deposit_required, new.currency, new.expiry_date, new.notes, new.payment_instructions,
      new.payment_token_hash, new.created_at)
    is distinct from
    row(old.enquiry_id, old.retreat_product_id, old.retreat_type_name, old.retreat_format,
      old.start_date, old.end_date, old.duration_days, old.guest_count, old.total_price,
      old.deposit_required, old.currency, old.expiry_date, old.notes, old.payment_instructions,
      old.payment_token_hash, old.created_at) then
    raise exception 'Quote commercial snapshots are immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quote_snapshot() from public, anon, authenticated;

create trigger retreat_products_updated_at before update on public.retreat_products for each row execute function public.retreat_set_updated_at();
create trigger retreat_availability_updated_at before update on public.retreat_availability for each row execute function public.retreat_set_updated_at();
create trigger retreat_events_updated_at before update on public.retreat_events for each row execute function public.retreat_set_updated_at();
create trigger retreat_enquiries_updated_at before update on public.retreat_enquiries for each row execute function public.retreat_set_updated_at();
create trigger retreat_bookings_updated_at before update on public.retreat_bookings for each row execute function public.retreat_set_updated_at();
create trigger retreat_quotes_protect_snapshot before update on public.retreat_quotes for each row execute function public.protect_quote_snapshot();

alter table public.admin_users enable row level security;
alter table public.retreat_products enable row level security;
alter table public.retreat_availability enable row level security;
alter table public.retreat_events enable row level security;
alter table public.retreat_enquiries enable row level security;
alter table public.retreat_quotes enable row level security;
alter table public.retreat_bookings enable row level security;

revoke all on public.admin_users, public.retreat_products, public.retreat_availability,
  public.retreat_events, public.retreat_enquiries, public.retreat_quotes,
  public.retreat_bookings from anon, authenticated;
grant select on public.retreat_products, public.retreat_availability, public.retreat_events to anon, authenticated;
grant select on public.admin_users to authenticated;
grant select, insert, update, delete on public.retreat_products, public.retreat_availability, public.retreat_events to authenticated;
grant select, update on public.retreat_enquiries to authenticated;
grant select, insert, update on public.retreat_quotes, public.retreat_bookings to authenticated;

create policy "published products are public" on public.retreat_products for select to anon, authenticated using (is_published);
create policy "admins read all products" on public.retreat_products for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins insert products" on public.retreat_products for insert to authenticated with check ((select retreat_private.is_retreat_admin()));
create policy "admins update products" on public.retreat_products for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "admins delete products" on public.retreat_products for delete to authenticated using ((select retreat_private.is_retreat_admin()));

create policy "availability is public" on public.retreat_availability for select to anon, authenticated using (true);
create policy "admins insert availability" on public.retreat_availability for insert to authenticated with check ((select retreat_private.is_retreat_admin()));
create policy "admins update availability" on public.retreat_availability for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "admins delete availability" on public.retreat_availability for delete to authenticated using ((select retreat_private.is_retreat_admin()));

create policy "published events are public" on public.retreat_events for select to anon, authenticated using (status in ('published', 'full', 'completed'));
create policy "admins read all events" on public.retreat_events for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins insert events" on public.retreat_events for insert to authenticated with check ((select retreat_private.is_retreat_admin()));
create policy "admins update events" on public.retreat_events for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));
create policy "admins delete events" on public.retreat_events for delete to authenticated using ((select retreat_private.is_retreat_admin()));

create policy "admins read enquiries" on public.retreat_enquiries for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins update enquiries" on public.retreat_enquiries for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));

create policy "admins read admin membership" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

create policy "admins read quotes" on public.retreat_quotes for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins insert quotes" on public.retreat_quotes for insert to authenticated with check ((select retreat_private.is_retreat_admin()));
create policy "admins update quotes" on public.retreat_quotes for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));

create policy "admins read bookings" on public.retreat_bookings for select to authenticated using ((select retreat_private.is_retreat_admin()));
create policy "admins insert bookings" on public.retreat_bookings for insert to authenticated with check ((select retreat_private.is_retreat_admin()));
create policy "admins update bookings" on public.retreat_bookings for update to authenticated using ((select retreat_private.is_retreat_admin())) with check ((select retreat_private.is_retreat_admin()));

insert into public.retreat_products (slug, name, positioning, allowed_formats, sort_order) values
  ('sexual-awakening-self-discovery', 'Sexual Awakening & Self Discovery', 'The guest or guests are at the centre of the retreat. Cally guides a private, intimate journey of self-discovery and exploration.', array['solo', 'couples', 'private_group', 'join_a_group']::public.retreat_format[], 1),
  ('just-plain-filthy', 'Just Plain Filthy', 'Playful, adventurous, experiential and collaboratively created. The Hostess is at the centre, shaping the retreat conversationally with the guest.', array['solo', 'couples', 'private_group', 'join_a_group']::public.retreat_format[], 2);
