"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function acknowledgeAdult() {
  (await cookies()).set("fp_adult_acknowledged", "yes", {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/retreat");
}
