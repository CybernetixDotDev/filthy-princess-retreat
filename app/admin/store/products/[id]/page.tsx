import { notFound } from "next/navigation";
import { updateStoreProduct } from "@/app/admin/store/actions";
import { AdminStoreProductForm } from "@/components/admin-store-product-form";
import { requireAdmin } from "@/lib/auth";

export default async function EditStoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const state = await requireAdmin(); if (!state) return null;
  const { data: product } = await state.supabase.from("store_products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();
  const action = updateStoreProduct.bind(null, product.id);
  return <><div className="admin-title"><div><p className="eyebrow">Store product</p><h1>{product.name}</h1></div></div><section className="admin-panel"><AdminStoreProductForm action={action} product={product} /></section></>;
}
