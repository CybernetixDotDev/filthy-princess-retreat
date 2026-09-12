-- Refine only the public copy for the existing canonical membership product.
update public.store_products
set
  short_description = 'Come inside. Stay forever.',
  description = E'Lifetime access to the Inner Sanctum.\n\nA private part of the Filthy Princess world created for members who want to come closer.\n\nInside you may find interactive stories, Filthy Princess experiences, games, private content, tasks and challenges from Cally, selected personal interactions, gifts, surprises, special events and invitations into experiences that never appear on the public site.\n\nSome benefits will be digital.\n\nSome will be personal.\n\nSome may become very real.\n\nWhat appears inside the Inner Sanctum will change over time.\n\nMy intention is simple: if you become one of my members, I want your membership to mean something.\n\nOne payment.\n\nYou''re in.',
  updated_at = now()
where slug = 'inner-sanctum-lifetime';
