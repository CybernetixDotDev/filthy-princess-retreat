"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { STORE_FULFILLMENT_TYPES, STORE_PRODUCT_STATUSES, STORE_PRODUCT_TYPES } from "@/lib/store";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  shortDescription: z.string().trim().min(2).max(300),
  description: z.string().trim().min(2).max(10000),
  productType: z.enum(STORE_PRODUCT_TYPES),
  priceAmount: z.coerce.number().min(0).max(9999999999.99),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  fulfillmentType: z.enum(STORE_FULFILLMENT_TYPES),
  fulfillmentReference: z.string().trim().max(200),
  imagePath: z.string().trim().max(500).refine((value) => !value || /^\/assets\/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$/.test(value), "Use a valid /assets image path."),
  status: z.enum(STORE_PRODUCT_STATUSES),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
});

function values(formData: FormData) {
  return productSchema.parse({
    name: formData.get("name"), slug: formData.get("slug"), shortDescription: formData.get("short_description"), description: formData.get("description"), productType: formData.get("product_type"), priceAmount: formData.get("price_amount"), currency: formData.get("currency"), fulfillmentType: formData.get("fulfillment_type"), fulfillmentReference: formData.get("fulfillment_reference"), imagePath: formData.get("image_path"), status: formData.get("status"), sortOrder: formData.get("sort_order"),
  });
}

function databaseValues(product: z.infer<typeof productSchema>) {
  return { name: product.name, slug: product.slug, short_description: product.shortDescription, description: product.description, product_type: product.productType, price_amount: product.priceAmount, currency: product.currency, fulfillment_type: product.fulfillmentType, fulfillment_reference: product.fulfillmentReference || null, image_path: product.imagePath || null, status: product.status, sort_order: product.sortOrder };
}

export async function createStoreProduct(formData: FormData) {
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { data, error } = await state.supabase.from("store_products").insert(databaseValues(values(formData))).select("id").single();
  if (error || !data) throw new Error(error?.code === "23505" ? "That Store slug is already in use." : "The Store product could not be created.");
  revalidatePath("/store"); revalidatePath("/admin/store"); revalidatePath("/admin/store/products");
  redirect(`/admin/store/products/${data.id}`);
}

export async function updateStoreProduct(productId: string, formData: FormData) {
  const id = z.uuid().parse(productId);
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.from("store_products").update(databaseValues(values(formData))).eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "That Store slug is already in use." : "The Store product could not be updated.");
  revalidatePath("/store"); revalidatePath("/admin/store"); revalidatePath("/admin/store/products"); revalidatePath(`/admin/store/products/${id}`);
}

export async function archiveStoreProduct(formData: FormData) {
  const id = z.uuid().parse(formData.get("product_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.from("store_products").update({ status: "archived" }).eq("id", id);
  if (error) throw new Error("The Store product could not be archived.");
  revalidatePath("/store"); revalidatePath("/admin/store"); revalidatePath("/admin/store/products"); revalidatePath(`/admin/store/products/${id}`);
}
