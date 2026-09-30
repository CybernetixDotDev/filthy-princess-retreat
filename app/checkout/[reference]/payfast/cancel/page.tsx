import Link from "next/link";

export default async function PayFastCancelPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <main className="store-order-page"><section className="store-order-summary"><p className="eyebrow">Payment cancelled</p><h1>Your order is still pending.</h1><p>No payment or entitlement was recorded. You can retry PayFast from the order status page.</p><Link className="primary-link" href={`/checkout/${encodeURIComponent(reference)}`}>Return to order</Link></section></main>;
}