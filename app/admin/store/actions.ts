"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { STORE_FILTH_AUDIENCES, STORE_FULFILLMENT_TYPES, STORE_PRODUCT_STATUSES, STORE_PRODUCT_TYPES } from "@/lib/store";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  shortDescription: z.string().trim().min(2).max(300),
  description: z.string().trim().min(2).max(10000),
  productType: z.enum(STORE_PRODUCT_TYPES),
  priceAmount: z.coerce.number().min(0).max(9999999999.99),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  moneyEnabled: z.boolean(),
  filthEnabled: z.boolean(),
  filthPrice: z.number().int().positive().nullable(),
  filthAudience: z.enum(STORE_FILTH_AUDIENCES).nullable(),
  inventoryUnlimited: z.boolean(),
  inventoryQuantity: z.number().int().min(0).nullable(),
  showRemainingQuantity: z.boolean(),
  fulfillmentType: z.enum(STORE_FULFILLMENT_TYPES),
  fulfillmentReference: z.string().trim().max(200),
  imagePath: z.string().trim().max(500).refine((value) => !value || /^store-product-media\/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$/.test(value), "Use a valid Store image."),
  status: z.enum(STORE_PRODUCT_STATUSES),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
});

function values(formData: FormData, imagePath?: string | null) {
  const moneyEnabled = formData.get("money_enabled") === "on";
  const filthEnabled = formData.get("filth_enabled") === "on";
  const inventoryUnlimited = formData.get("inventory_unlimited") === "on";
  const product = productSchema.parse({
    name: formData.get("name"), slug: formData.get("slug"), shortDescription: formData.get("short_description"), description: formData.get("description"), productType: formData.get("product_type"), priceAmount: moneyEnabled ? formData.get("price_amount") : 0, currency: moneyEnabled ? formData.get("currency") : "USD", moneyEnabled, filthEnabled, filthPrice: filthEnabled ? Number(formData.get("filth_price")) : null, filthAudience: filthEnabled ? formData.get("filth_audience") : null, inventoryUnlimited, inventoryQuantity: inventoryUnlimited ? null : Number(formData.get("inventory_quantity")), showRemainingQuantity: !inventoryUnlimited && formData.get("show_remaining_quantity") === "on", fulfillmentType: formData.get("fulfillment_type"), fulfillmentReference: formData.get("fulfillment_reference"), imagePath: imagePath ?? formData.get("image_path") ?? "", status: formData.get("status"), sortOrder: formData.get("sort_order"),
  });
  if (product.status === "active" && !product.moneyEnabled && !product.filthEnabled) throw new Error("An active Store product needs at least one acquisition method.");
  return product;
}

async function prepareImage(state: Awaited<ReturnType<typeof requireAdmin>>, formData: FormData, existingPath: string | null) {
  if (!state) throw new Error("Not authorized");
  const remove = formData.get("remove_image") === "on";
  const file = formData.get("product_image");
  if (!(file instanceof File) || file.size === 0) return remove ? null : existingPath;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Product images must be PNG, JPEG or WebP files under 5 MB.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `store-product-media/${randomUUID()}.${extension}`;
  const { error } = await state.supabase.storage.from("store-product-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("The product image could not be uploaded.");
  return path;
}

async function removeImage(state: Awaited<ReturnType<typeof requireAdmin>>, path: string | null, replacement: string | null) {
  if (state && path && path !== replacement) await state.supabase.storage.from("store-product-media").remove([path]);
}

function databaseValues(product: z.infer<typeof productSchema>) {
  return { name: product.name, slug: product.slug, short_description: product.shortDescription, description: product.description, product_type: product.productType, price_amount: product.priceAmount, currency: product.currency, money_enabled: product.moneyEnabled, filth_enabled: product.filthEnabled, filth_price: product.filthPrice, filth_audience: product.filthAudience, inventory_unlimited: product.inventoryUnlimited, inventory_quantity: product.inventoryQuantity, show_remaining_quantity: product.showRemainingQuantity, fulfillment_type: product.fulfillmentType, fulfillment_reference: product.fulfillmentReference || null, image_path: product.imagePath || null, status: product.status, sort_order: product.sortOrder };
}

export async function createStoreProduct(formData: FormData) {
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const imagePath = await prepareImage(state, formData, null);
  const { data, error } = await state.supabase.from("store_products").insert(databaseValues(values(formData, imagePath))).select("id").single();
  if (error || !data) throw new Error(error?.code === "23505" ? "That Store slug is already in use." : "The Store product could not be created.");
  revalidatePath("/store"); revalidatePath("/admin/store"); revalidatePath("/admin/store/products");
  redirect(`/admin/store/products/${data.id}`);
}

export async function updateStoreProduct(productId: string, formData: FormData) {
  const id = z.uuid().parse(productId);
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { data: current } = await state.supabase.from("store_products").select("image_path").eq("id", id).maybeSingle();
  const imagePath = await prepareImage(state, formData, current?.image_path ?? null);
  const { error } = await state.supabase.from("store_products").update(databaseValues(values(formData, imagePath))).eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "That Store slug is already in use." : "The Store product could not be updated.");
  await removeImage(state, current?.image_path ?? null, imagePath);
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
