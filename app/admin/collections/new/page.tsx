import { createCollectible } from "@/app/admin/collections/actions";
import { AdminCollectibleForm } from "@/components/admin-collectible-form";

export default function NewCollectiblePage() {
  return <><div className="admin-title"><div><p className="eyebrow">Collections</p><h1>New collectible</h1></div></div><section className="admin-panel"><AdminCollectibleForm action={createCollectible} /></section></>;
}
