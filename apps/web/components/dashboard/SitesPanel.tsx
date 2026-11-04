"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@/lib/client";

type Site = { id: string; url: string; host: string; token: string; verified_at: string | null; last_checked_at: string | null; last_error: string | null };

const metaTag = (token: string) => `<meta name="netaffil-verification" content="${token}" />`;

const PLATFORMS = [
  { name: "WordPress", steps: "Install a header-code plugin such as WPCode (Insert Headers and Footers), open Code Snippets → Header & Footer, paste the tag into the Header box and save. Rank Math and Yoast users can also use the plugin's custom head-code setting." },
  { name: "Blogger", steps: "Theme → ⋮ → Edit HTML, paste the tag just after <head>, then Save." },
  { name: "Wix", steps: "Settings → Custom Code → Add Custom Code, paste the tag, choose “All pages” and “Head”, then Apply." },
  { name: "Shopify", steps: "Online Store → Themes → ⋯ → Edit code → theme.liquid, paste the tag just before </head>, then Save." },
  { name: "Squarespace", steps: "Settings → Advanced → Code Injection, paste the tag into Header, then Save." },
  { name: "Any other site", steps: "Paste the tag inside the <head> section of your home page's HTML and publish the change." },
];

export function SitesPanel() {
  const id = useId();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => setSites(await api<Site[]>("/api/sites")), []);
  useEffect(() => void load().catch((e) => setMsg({ kind: "error", text: e.message })), [load]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy("add");
    setMsg(null);
    try {
      await api("/api/sites", { url: new FormData(form).get("url") });
      form.reset();
      await load();
      setMsg({ kind: "success", text: "Website added. Copy the tag below into your site, then press Verify." });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function verify(site: Site) {
    setBusy(site.id);
    setMsg(null);
    try {
      const res = await api<{ verified: boolean; error: string | null }>(`/api/sites/${site.id}/verify`, {});
      setMsg(res.verified
        ? { kind: "success", text: `${site.host} is verified.` }
        : { kind: "error", text: `Not verified yet: ${res.error}` });
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(site: Site) {
    if (!window.confirm(`Remove ${site.host}?`)) return;
    try {
      await api(`/api/sites/${site.id}`, undefined, "DELETE");
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="stack">
      <div aria-live="polite">{msg && <div className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div>}</div>

      <form onSubmit={add} className="card row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 240, margin: 0 }}>
          <label htmlFor={`${id}-url`}>Website address</label>
          <input id={`${id}-url`} name="url" className="input" placeholder="https://yourblog.com" inputMode="url" required maxLength={300} />
        </div>
        <button type="submit" className="btn" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add website"}</button>
      </form>

      {sites?.length === 0 && <p className="muted">No websites yet. Add the site where you promote offers to get a verified badge.</p>}

      {sites?.map((s) => (
        <section key={s.id} className="card" aria-labelledby={`site-${s.id}`}>
          <div className="spread">
            <h2 id={`site-${s.id}`} style={{ fontSize: "1.25rem", fontFamily: "var(--font-sans)", fontWeight: 750, margin: 0 }}>{s.host}</h2>
            {s.verified_at ? <span className="pill green">✓ Verified</span> : <span className="pill orange">Not verified</span>}
          </div>
          <p className="muted" style={{ margin: "4px 0 16px", fontSize: ".9rem" }}>
            {s.verified_at ? `Verified on ${new Date(s.verified_at).toLocaleDateString()}. Keep the tag on your site.` : s.url}
          </p>

          {!s.verified_at && (
            <>
              <p style={{ fontWeight: 700, margin: "0 0 6px" }}>1. Add this tag to your site&apos;s &lt;head&gt;</p>
              <div className="row" style={{ alignItems: "stretch" }}>
                <code className="code" style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>{metaTag(s.token)}</code>
                <button type="button" className="btn small secondary" onClick={async () => { await navigator.clipboard.writeText(metaTag(s.token)); setCopied(s.id); }}>
                  {copied === s.id ? "Copied" : "Copy tag"}
                </button>
              </div>
              <details style={{ margin: "12px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to add it on WordPress, Blogger, Wix, Shopify and others</summary>
                <dl style={{ margin: "10px 0 0" }}>
                  {PLATFORMS.map((p) => (
                    <div key={p.name} style={{ marginBottom: 10 }}>
                      <dt style={{ fontWeight: 700 }}>{p.name}</dt>
                      <dd style={{ margin: 0 }} className="muted">{p.steps}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              <p style={{ fontWeight: 700, margin: "12px 0 6px" }}>2. Check it</p>
              {s.last_error && <p className="hint" style={{ color: "var(--danger)" }}>Last check: {s.last_error}</p>}
            </>
          )}

          <div className="row" style={{ marginTop: 8 }}>
            {!s.verified_at && (
              <button type="button" className="btn" onClick={() => verify(s)} disabled={busy === s.id}>
                {busy === s.id ? "Checking your site…" : "Verify"}
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => remove(s)} aria-label={`Remove ${s.host}`}>Remove</button>
          </div>
        </section>
      ))}
    </div>
  );
}
