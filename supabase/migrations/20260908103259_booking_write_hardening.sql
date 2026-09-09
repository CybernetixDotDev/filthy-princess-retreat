-- Booking creation and status changes must use the collision/capacity-safe RPCs.
revoke insert, update on public.retreat_bookings from authenticated;
drop policy if exists "admins insert bookings" on public.retreat_bookings;
drop policy if exists "admins update bookings" on public.retreat_bookings;
