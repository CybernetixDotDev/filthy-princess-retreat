drop trigger if exists retreat_quote_adopts_enquiry_hold on public.retreat_quotes;

create trigger retreat_quote_adopts_enquiry_hold
  after insert on public.retreat_quotes
  for each row execute function retreat_private.adopt_enquiry_hold_on_quote_insert();