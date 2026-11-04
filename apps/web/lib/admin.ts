import { serverApi } from "./api";

/** Fetches an admin endpoint with the visitor's session; throws so the error page shows. */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await serverApi<T>(`/api/admin${path}`, { auth: true });
  if (!res.data) throw new Error(`Admin API ${path} failed (${res.status})`);
  return res.data;
}

export function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
