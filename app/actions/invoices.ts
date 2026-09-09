"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { quoteEthForUsd } from "@/lib/alchemy-pricing";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsd } from "@/lib/pricing";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export type InvoicePaymentState = {
  success?: boolean;
  error?: string;
  submittedAt?: string;
  holdExpiresAt?: string | null;
};
export type PublicInvoiceCreationState = { error?: string };

async function createInvoiceSnapshot(input: { totalPrice: number; publicQuoteSlug: string; supabase: Awaited<ReturnType<typeof createClient>> }) {
  const walletAddress = process.env.PAYMENT_WALLET_ADDRESS?.trim();
  if (!walletAddress) throw new Error("Payment is not currently available. Please try again later.");
  const totalUsd = normalizeUsd(String(input.totalPrice));
  const ethConversion = await quoteEthForUsd(Number(totalUsd));
  const { data, error } = await input.supabase.rpc("create_public_invoice", {
    p_public_quote_slug: input.publicQuoteSlug,
    p_amount_usd: Number(totalUsd),
    p_eth_price_usd: Number(ethConversion.ethPriceUsd),
    p_amount_eth: Number(ethConversion.ethAmount),
    p_wallet_address: walletAddress,
    p_invoice_reference: `FP-INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    p_public_slug: randomUUID(),
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]?.public_slug) throw new Error("The invoice could not be created.");
  return data[0].public_slug;
}

export async function createInvoiceForQuote(formData: FormData) {
  const quoteId = z.uuid().parse(formData.get("quote_id"));
  const supabase = await createClient();

  const { data: quote, error: quoteError } = await supabase
    .from("retreat_quotes")
    .select("id, enquiry_id, retreat_type_name, retreat_format, start_date, end_date, guest_count, total_price, public_slug")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError) throw new Error(quoteError.message);
  if (!quote) throw new Error("Quote not found.");

  const { data: existingInvoice } = await supabase
    .from("retreat_invoices")
    .select("public_slug")
    .eq("quote_id", quote.id)
    .maybeSingle();

  if (existingInvoice?.public_slug) {
    redirect(`/invoice/${existingInvoice.public_slug}`);
  }

  const walletAddress = process.env.PAYMENT_WALLET_ADDRESS?.trim();
  if (!walletAddress) throw new Error("The payment wallet is not configured.");
  const totalUsd = normalizeUsd(String(quote.total_price ?? 0));
  const ethConversion = await quoteEthForUsd(Number(totalUsd));
  const { data: insertedInvoice, error: insertError } = await supabase.from("retreat_invoices").insert({
    quote_id: quote.id, enquiry_id: quote.enquiry_id, invoice_reference: `FP-INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    amount_usd: Number(totalUsd), eth_price_usd: Number(ethConversion.ethPriceUsd), amount_eth: Number(ethConversion.ethAmount),
    wallet_address: walletAddress, public_slug: randomUUID(), status: "awaiting_payment", retry_allowed_at: null, retry_allowed_by: null,
  }).select("public_slug").single();
  if (insertError) {
    const { data: retryInvoice } = await supabase.from("retreat_invoices").select("public_slug").eq("quote_id", quote.id).maybeSingle();
    if (retryInvoice?.public_slug) redirect(`/invoice/${retryInvoice.public_slug}`);
    throw new Error(insertError.message);
  }
  redirect(`/invoice/${insertedInvoice.public_slug}`);
}

export async function createInvoiceForPublicQuote(_: PublicInvoiceCreationState, formData: FormData): Promise<PublicInvoiceCreationState> {
  const quoteSlug = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).parse(formData.get("quote_slug"));
  const supabase = await createClient();
  const { data: quote, error: quoteError } = await supabase.rpc("get_public_quote_by_slug", { p_public_slug: quoteSlug });
  if (quoteError || !quote?.[0]) return { error: "This quote is no longer available." };
  const existing = await supabase.rpc("get_public_invoice_by_quote_slug", { p_public_quote_slug: quoteSlug });
  if (!existing.error && existing.data?.[0]?.public_slug) redirect(`/invoice/${existing.data[0].public_slug}`);
  try {
    const publicSlug = await createInvoiceSnapshot({ totalPrice: Number(quote[0].total_price), publicQuoteSlug: quoteSlug, supabase });
    redirect(`/invoice/${publicSlug}`);
  } catch {
    return { error: "We couldn't prepare the invoice right now. Please try again." };
  }
}

export async function submitInvoicePayment(_: InvoicePaymentState, formData: FormData): Promise<InvoicePaymentState> {
  const publicSlug = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).parse(formData.get("public_slug"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_invoice_payment", { p_public_slug: publicSlug });

  if (error) {
    if (/no longer available|held|booked|blocked|not configured|event/i.test(error.message)) {
      return { error: "Your requested dates are no longer available to hold. Please contact Cally so she can review the invoice." };
    }
    if (/cancelled/i.test(error.message)) return { error: "This invoice is cancelled and cannot accept payment." };
    if (/rejected/i.test(error.message)) return { error: "This payment submission was rejected. Please contact Cally before trying again." };
    return { error: "We couldn't record your payment submission. Please try again or contact Cally." };
  }

  const result = data?.[0];
  if (!result) return { error: "We couldn't record your payment submission. Please try again or contact Cally." };
  revalidatePath(`/invoice/${publicSlug}`);
  revalidatePath(`/invoice/${publicSlug}/pay`);
  return { success: true, submittedAt: result.submitted_at, holdExpiresAt: result.hold_expires_at };
}

async function reviewInvoicePayment(formData: FormData, decision: "verify" | "reject") {
  const invoiceId = z.uuid().parse(formData.get("invoice_id"));
  const reviewNote = z.string().trim().max(500).parse(String(formData.get("review_note") ?? "")) || null;
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc(decision === "verify" ? "verify_invoice_payment" : "reject_invoice_payment", {
    p_invoice_id: invoiceId,
    p_review_note: reviewNote,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enquiries/${formData.get("enquiry_id")}`);
}

export async function verifyInvoicePayment(formData: FormData) {
  return reviewInvoicePayment(formData, "verify");
}

export async function rejectInvoicePayment(formData: FormData) {
  return reviewInvoicePayment(formData, "reject");
}

export async function allowInvoicePaymentRetry(formData: FormData) {
  const invoiceId = z.uuid().parse(formData.get("invoice_id"));
  const enquiryId = z.uuid().parse(formData.get("enquiry_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("allow_invoice_payment_retry", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath(`/invoice/${formData.get("public_slug")}`);
  revalidatePath(`/invoice/${formData.get("public_slug")}/pay`);
}

export async function confirmVerifiedRetreatBooking(formData: FormData) {
  const invoiceId = z.uuid().parse(formData.get("invoice_id"));
  const enquiryId = z.uuid().parse(formData.get("enquiry_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("confirm_verified_retreat_booking", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/availability");
}
