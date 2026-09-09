export function siteUrl(path: string) {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

export function buildQuoteReadyMessage(guestName: string, quoteUrl: string) {
  return `Hi ${guestName} 💋\n\nI've put your Filthy Princess retreat quote together.\n\nYou can have a look here:\n${quoteUrl}\n\nIf it feels right, you can continue from there whenever you're ready.\n\nCally x`;
}

export function buildInvoiceReadyMessage(guestName: string, invoiceUrl: string) {
  return `Hi ${guestName} 💋\n\nYour payment details are ready.\n\nYou can view your invoice and payment instructions here:\n${invoiceUrl}\n\nEverything you need is on that page.\n\nCally x`;
}

export function buildBookingConfirmedMessage(guestName: string, bookingUrl: string) {
  return `Hi ${guestName} 💋\n\nYour Filthy Princess retreat is officially confirmed.\n\nI've created your private confirmation page here:\n${bookingUrl}\n\nYou'll also find a few little things there I'd love you to fill in before you arrive.\n\nCally x`;
}
