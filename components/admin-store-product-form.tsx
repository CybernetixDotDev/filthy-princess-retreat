import { SubmitButton } from "@/components/submit-button";
import type { StoreProductRow } from "@/lib/database.types";
import { STORE_FULFILLMENT_TYPES, STORE_PRODUCT_STATUSES, STORE_PRODUCT_TYPES, storeLabel } from "@/lib/store";

export function AdminStoreProductForm({ action, product }: { action: (formData: FormData) => void | Promise<void>; product?: StoreProductRow }) {
  return <form action={action} className="form-grid store-product-form">
    <label>Name<input name="name" defaultValue={product?.name} required maxLength={200} /></label>
    <label>Slug<input name="slug" defaultValue={product?.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
    <label className="full-span">Short description<input name="short_description" defaultValue={product?.short_description} required maxLength={300} /></label>
    <label className="full-span">Description<textarea name="description" defaultValue={product?.description} required rows={10} maxLength={10000} /></label>
    <label>Product type<select name="product_type" defaultValue={product?.product_type ?? "membership"}>{STORE_PRODUCT_TYPES.map((type) => <option key={type} value={type}>{storeLabel(type)}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={product?.status ?? "draft"}>{STORE_PRODUCT_STATUSES.map((status) => <option key={status} value={status}>{storeLabel(status)}</option>)}</select></label>
    <label>Price amount<input name="price_amount" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={product?.price_amount ?? 0} required /></label>
    <label>Currency<input name="currency" defaultValue={product?.currency ?? "USD"} pattern="[A-Z]{3}" maxLength={3} required /></label>
    <label>Fulfillment type<select name="fulfillment_type" defaultValue={product?.fulfillment_type ?? "manual"}>{STORE_FULFILLMENT_TYPES.map((type) => <option key={type} value={type}>{storeLabel(type)}</option>)}</select></label>
    <label>Fulfillment reference<input name="fulfillment_reference" defaultValue={product?.fulfillment_reference ?? ""} maxLength={200} /></label>
    <label className="full-span">Image path<input name="image_path" defaultValue={product?.image_path ?? ""} placeholder="/assets/example.png" /></label>
    <label>Sort order<input name="sort_order" type="number" min="-10000" max="10000" defaultValue={product?.sort_order ?? 0} required /></label>
    <div className="full-span"><SubmitButton>{product ? "Save product" : "Create product"}</SubmitButton></div>
  </form>;
}
