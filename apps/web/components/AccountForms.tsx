"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { api } from "@/lib/client";

type Status = { kind: "error" | "success"; text: string } | null;

function Message({ status }: { status: Status }) {
  return (
    <div aria-live="polite">
      {status && <div className={`alert ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>{status.text}</div>}
    </div>
  );
}

/** Confirm-email page. A button press, not page load, confirms, so link scanners can't use the token. */
export function VerifyEmail() {
  const token = useSearchParams().get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? null : { kind: "error", text: "This link is missing its code. Open the link from your email again." });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await api("/api/auth/verify-email", { token });
      setDone(true);
      setStatus({ kind: "success", text: "Your email is confirmed. Thank you!" });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Message status={status} />
      {done ? (
        <Link href="/dashboard" className="btn">Go to my dashboard</Link>
      ) : token ? (
        <button type="button" className="btn lg" onClick={confirm} disabled={busy}>{busy ? "Confirming…" : "Confirm my email"}</button>
      ) : null}
    </>
  );
}

export function ForgotPassword() {
  const id = useId();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/forgot", { email: new FormData(e.currentTarget).get("email") });
      setStatus({ kind: "success", text: "If an account uses that email, a reset link is on its way. It works for one hour; check spam if you don't see it." });
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Message status={status} />
      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} name="email" type="email" className="input" required autoComplete="email" inputMode="email" />
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Sending…" : "Send reset link"}</button>
      <p className="muted" style={{ marginTop: 16, textAlign: "center" }}><Link href="/login">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPassword() {
  const id = useId();
  const token = useSearchParams().get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? null : { kind: "error", text: "This link is missing its code. Request a new reset link." });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setStatus({ kind: "error", text: "The two passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/reset", { token, password: form.get("password") });
      setDone(true);
      setStatus({ kind: "success", text: "Your password has been changed and you've been signed out everywhere. Sign in with your new password." });
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (done) return (<><Message status={status} /><Link href="/login" className="btn">Sign in</Link></>);
  return (
    <form onSubmit={submit}>
      <Message status={status} />
      <div className="field">
        <label htmlFor={`${id}-pw`}>New password</label>
        <input id={`${id}-pw`} name="password" type="password" className="input" required minLength={10} maxLength={128} autoComplete="new-password" aria-describedby={`${id}-hint`} />
        <span className="hint" id={`${id}-hint`}>At least 10 characters.</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-confirm`}>Repeat new password</label>
        <input id={`${id}-confirm`} name="confirm" type="password" className="input" required minLength={10} maxLength={128} autoComplete="new-password" />
      </div>
      <button className="btn" type="submit" disabled={busy || !token} style={{ width: "100%" }}>{busy ? "Saving…" : "Set new password"}</button>
      <p className="muted" style={{ marginTop: 16, textAlign: "center" }}><Link href="/forgot-password">Request a new link</Link></p>
    </form>
  );
}

/** Dashboard banner for unconfirmed emails. */
export function VerifyBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="alert info" role="note" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
      <span>
        {status?.kind === "success" ? status.text : status?.kind === "error" ? status.text : <>Please confirm your email: we sent a link to <strong>{email}</strong>.</>}
      </span>
      {status?.kind !== "success" && (
        <button type="button" className="btn small secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await api("/api/auth/resend-verification", {});
            setStatus({ kind: "success", text: `A new confirmation link is on its way to ${email}.` });
          } catch (e) {
            setStatus({ kind: "error", text: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}>Resend link</button>
      )}
    </div>
  );
}
