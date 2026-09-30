import Link from "next/link";

export default async function PayFastReturnPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <main className="store-order-page"><section className="store-order-summary"><p className="eyebrow">Payment return</p><h1>Payment is awaiting verification.</h1><p>Returning from PayFast does not confirm payment. Check the order status for verified updates.</p><Link className="primary-link" href={`/checkout/${encodeURIComponent(reference)}`}>View order status</Link></section></main>;
}