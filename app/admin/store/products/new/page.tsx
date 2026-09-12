import { createStoreProduct } from "@/app/admin/store/actions";
import { AdminStoreProductForm } from "@/components/admin-store-product-form";

export default function NewStoreProductPage() {
  return <><div className="admin-title"><div><p className="eyebrow">Store product</p><h1>New product</h1></div></div><section className="admin-panel"><AdminStoreProductForm action={createStoreProduct} /></section></>;
}
