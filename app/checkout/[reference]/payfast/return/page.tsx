import { redirect } from "next/navigation";

export default async function PayFastReturnPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  redirect(`/checkout/${encodeURIComponent(reference)}?payfast=return`);
}