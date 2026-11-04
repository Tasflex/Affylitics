"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";

export function GetLinkButton({ slug }: { slug: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function getLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string }>("/api/links", { offer_slug: slug });
      setUrl(res.url);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("sign in")) setNeedsLogin(true);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (needsLogin) {
    return (
      <p>
        <Link href={`/login?next=/offers/${slug}`} className="btn">Sign in to get your link</Link>{" "}
        <Link href="/signup" className="btn ghost">Create an account</Link>
      </p>
    );
  }

  return (
    <div className="stack">
      {!url && <button type="button" className="btn" onClick={getLink} disabled={busy}>{busy ? "Creating link…" : "Get my affiliate link"}</button>}
      {url && (
        <div className="card">
          <label htmlFor="aff-link" style={{ fontWeight: 700 }}>Your link</label>
          <div className="row" style={{ marginTop: 8 }}>
            <input id="aff-link" className="input" readOnly value={url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              Copy
            </button>
          </div>
          <p role="status" className="muted" style={{ marginTop: 8 }}>{copied ? "Copied to clipboard." : ""}</p>
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
    </div>
  );
}
