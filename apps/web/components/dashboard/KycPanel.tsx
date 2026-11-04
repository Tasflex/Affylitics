"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Level = { tier: number; title: string; body: string };

export function KycPanel({ levels, current, simulatedCheck }: { levels: Level[]; current: number; simulatedCheck: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(tier: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string | null }>("/api/kyc", { tier });
      if (res.url) window.location.assign(res.url);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function approveSimulated() {
    // Development only; the endpoint does not exist in production.
    await fetch(`/hooks/kyc/simulated/${encodeURIComponent(simulatedCheck!)}`, { method: "POST" });
    router.replace("/dashboard/kyc");
    router.refresh();
  }

  return (
    <div className="stack">
      {error && <div className="alert error" role="alert">{error}</div>}
      {simulatedCheck && (
        <div className="alert info" role="note">
          Development mode: no KYC provider is connected.{" "}
          <button type="button" className="btn small" onClick={approveSimulated}>Approve this test check</button>
        </div>
      )}
      <ol className="stack" style={{ listStyle: "none", padding: 0 }}>
        {levels.map((l) => {
          const done = current >= l.tier;
          const next = current + 1 === l.tier;
          return (
            <li key={l.tier} className="card">
              <div className="spread">
                <h2 style={{ fontSize: "1.3rem", margin: 0, fontFamily: "var(--font-sans)", fontWeight: 700 }}>{l.title}</h2>
                {done ? <span className="pill green">Complete</span> : next ? <span className="pill">Next step</span> : <span className="pill">Locked</span>}
              </div>
              <p className="muted" style={{ margin: "10px 0" }}>{l.body}</p>
              {next && <button type="button" className="btn" disabled={busy} onClick={() => start(l.tier)}>{busy ? "Starting…" : "Start verification"}</button>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
