import { redirect } from "next/navigation";
import { cache } from "react";
import { serverApi, type Me } from "./api";

/** The signed-in user, or a redirect to sign-in. Cached per request. */
export const requireMe = cache(async (next = "/dashboard"): Promise<Me> => {
  const { data, status } = await serverApi<Me>("/api/me", { auth: true });
  if (!data) {
    if (status === 401) redirect(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("The account service is unavailable. Please try again shortly.");
  }
  return data;
});
