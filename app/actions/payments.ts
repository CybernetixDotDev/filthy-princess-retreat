"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export type PaymentState={success?:boolean;error?:string};
export async function submitQuotePayment(_:PaymentState,formData:FormData):Promise<PaymentState>{const token=z.string().min(40).parse(formData.get("token"));const tx=String(formData.get("tx_hash")??"");const supabase=await createClient();const {error}=await supabase.rpc("submit_quote_payment",{raw_token:token,p_tx_hash:tx||null});return error?{error:"This payment quote has expired or is no longer available."}:{success:true};}
