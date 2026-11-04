"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api } from "@/lib/client";

export type ActionField = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "dollars";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** Send a select's value as a number. */
  asNumber?: boolean;
};

/** A staff action: a button that opens an inline form, POSTs, then refreshes the page. */
export function AdminAction({
  endpoint,
  label,
  fields = [],
  fixed = {},
  reason = true,
  danger = false,
}: {
  endpoint: string;
  label: string;
  fields?: ActionField[];
  fixed?: Record<string, unknown>;
  reason?: boolean;
  danger?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const raw = String(form.get(f.name) ?? "").trim();
      if (f.type === "number" || f.asNumber) body[f.name] = Number(raw);
      else if (f.type === "dollars") body[f.name] = Math.round(Number(raw) * 100);
      else if (raw) body[f.name] = raw;
    }
    if (reason) body.reason = String(form.get("reason") ?? "");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ status?: string }>(endpoint, body);
      setDone(res.status ? `Done (${res.status})` : "Done");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span className="row" style={{ gap: 6, display: "inline-flex" }}>
        <button type="button" className={`btn small ${danger ? "ghost" : "secondary"}`} style={danger ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
          onClick={() => { setOpen(true); setDone(null); }}>{label}</button>
        {done && <span className="pill green" role="status">{done}</span>}
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="admin-action" aria-label={label}>
      {fields.map((f) => (
        <div className="field" key={f.name} style={{ marginBottom: 10 }}>
          <label htmlFor={`${id}-${f.name}`}>{f.label}</label>
          {f.type === "select" ? (
            <select id={`${id}-${f.name}`} name={f.name} className="input" required={f.required !== false}>
              {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input id={`${id}-${f.name}`} name={f.name} className="input" required={f.required !== false} placeholder={f.placeholder}
              type={f.type === "number" || f.type === "dollars" ? "number" : "text"} step={f.type === "dollars" ? "0.01" : undefined} min={f.type === "dollars" ? "0.01" : undefined} />
          )}
        </div>
      ))}
      {reason && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor={`${id}-reason`}>Reason (kept in the audit log)</label>
          <input id={`${id}-reason`} name="reason" className="input" required minLength={3} maxLength={500} />
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn small" disabled={busy}>{busy ? "Working…" : `Confirm: ${label}`}</button>
        <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
