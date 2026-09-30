import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildPayFastFields, getPayFastConfig } from "@/lib/payfast";

const referenceSchema = z.string().regex(/^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

export default async function PayFastCheckoutPage({ params, searchParams }: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { reference } = await params;
  const { attempt } = await searchParams;
  const parsedReference = referenceSchema.safeParse(reference);
  const parsedAttempt = z.uuid().safeParse(attempt);
  if (!parsedReference.success || !parsedAttempt.success) notFound();
  let config;
  try { config = getPayFastConfig(); } catch { notFound(); }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_payfast_store_payment_attempt", { p_order_reference: reference, p_attempt_id: parsedAttempt.data });
  const payment = data?.[0];
  if (error || !payment) notFound();
  const fields = buildPayFastFields({ config, orderReference: payment.order_reference, attemptReference: payment.provider_reference, amount: Number(payment.amount) });
  return <main className="store-order-page"><section className="store-order-summary">
    <p className="eyebrow">Secure payment</p><h1>Continue to PayFast</h1>
    <p>Your order remains pending until PayFast notification verification is implemented.</p>
    <form action={config.processUrl} method="post">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button className="primary-link" type="submit">Continue to PayFast Sandbox</button>
    </form>
  </section></main>;
}