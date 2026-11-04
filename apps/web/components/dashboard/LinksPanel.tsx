"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatUsd } from "@/lib/site";

type LinkRow = { code: string; sub_id: string | null; offer_slug: string; offer_title: string; clicks: number; conversions: number; earned_cents: number };
type Conversion = { id: string; offer_title: string; commission_cents: number; status: string; matures_at: string; created_at: string };

export function LinksPanel() {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([api<LinkRow[]>("/api/links"), api<Conversion[]>("/api/conversions")]);
      setLinks(l);
      setConversions(c);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <>
      <div className="spread">
        <h2 style={{ fontSize: "1.6rem", margin: 0 }}>Your links</h2>
        <Link href="/offers" className="btn small">Find an offer</Link>
      </div>
      {error && <div className="alert error" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      {links && links.length === 0 && (
        <p className="muted" style={{ marginTop: 16 }}>No links yet. Open any offer and choose “Get my affiliate link”.</p>
      )}
      {links && links.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <caption className="sr-only">Your affiliate links and their results</caption>
            <thead>
              <tr><th scope="col">Offer</th><th scope="col">Link</th><th scope="col" className="num">Clicks</th><th scope="col" className="num">Sales</th><th scope="col" className="num">Earned</th></tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.code}>
                  <th scope="row"><Link href={`/offers/${l.offer_slug}`}>{l.offer_title}</Link>{l.sub_id && <div className="muted" style={{ fontSize: ".85rem" }}>sub: {l.sub_id}</div>}</th>
                  <td><span className="code">{origin}/go/{l.code}</span></td>
                  <td className="num">{l.clicks}</td>
                  <td className="num">{l.conversions}</td>
                  <td className="num">{formatUsd(l.earned_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: "1.6rem", marginTop: 40 }}>Recent sales</h2>
      {conversions.length === 0 ? (
        <p className="muted">Sales appear here as soon as an advertiser confirms them.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Recent conversions</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Offer</th><th scope="col">Status</th><th scope="col" className="num">Commission</th></tr></thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td>{c.offer_title}</td>
                  <td>
                    {c.status === "pending" ? `Pending until ${new Date(c.matures_at).toLocaleDateString()}` : c.status === "approved" ? "Available" : "Rejected"}
                  </td>
                  <td className="num">{formatUsd(c.commission_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
