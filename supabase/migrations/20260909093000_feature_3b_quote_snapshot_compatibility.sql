-- Feature 3B compatibility: keep the quote snapshot minimal without reactivating legacy payment/expiry lifecycle fields.
-- These are old quote lifecycle fields and are not required for the current enquiry -> pricing -> quote snapshot flow.
alter table public.retreat_quotes
  alter column expiry_date drop not null,
  alter column payment_instructions drop not null,
  alter column payment_token_hash drop not null;
