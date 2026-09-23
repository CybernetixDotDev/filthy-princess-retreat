// Canonical destinations for new customer UI. A destination does not grant access.
// Retreat is reserved for later adoption; this does not create that route.
export const customerDestinations = {
  home: "/",
  retreat: "/retreat",
  innerSanctum: "/inner-sanctum",
  store: "/store",
  filth: "/filth",
  contribute: "/contribute",
  account: "/you",
  signIn: "/signin",
  signUp: "/signin?mode=signup",
} as const;
