"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { api } from "@/lib/client";
import { GoogleButton, OrDivider } from "./GoogleButton";

type Country = { code: string; name: string };

/** Messages for ?error= codes set by the Google sign-in callback. */
const OAUTH_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_expired: "That sign-in took too long. Please try again.",
  google_failed: "We couldn't complete Google sign-in. Please try again.",
  google_no_email: "Your Google account didn't share an email address.",
  google_unverified: "Your Google email address isn't verified yet.",
  google_unavailable: "Google sign-in isn't available right now. Use your email instead.",
  account_inactive: "This account is not active. Please contact support.",
  too_many: "Too many attempts. Please wait a few minutes.",
};

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function AuthForm({ mode, countries = [], googleEnabled = false }: { mode: "signup" | "login"; countries?: Country[]; googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const id = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(() => OAUTH_ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState(params.get("role") === "advertiser" ? "advertiser" : "publisher");
  const initialRole = role;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await api("/api/auth/signup", {
          email: form.get("email"),
          password: form.get("password"),
          display_name: form.get("display_name"),
          country: form.get("country"),
          role: form.get("role"),
        });
        router.push("/onboarding");
      } else {
        await api("/api/auth/login", { email: form.get("email"), password: form.get("password") });
        router.push(safeNext(params.get("next")));
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} aria-describedby={error ? `${id}-error` : undefined}>
      <div ref={errorRef} tabIndex={-1} id={`${id}-error`} aria-live="assertive">
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>

      {mode === "signup" && (
        <fieldset className="radio-cards">
          <legend>I want to</legend>
          <label className="radio-card">
            <input type="radio" name="role" value="publisher" defaultChecked={initialRole === "publisher"} onChange={() => setRole("publisher")} />
            <span><strong>Earn commissions</strong><br /><span className="muted">Affiliate, creator or publisher</span></span>
          </label>
          <label className="radio-card">
            <input type="radio" name="role" value="advertiser" defaultChecked={initialRole === "advertiser"} onChange={() => setRole("advertiser")} />
            <span><strong>Grow my brand</strong><br /><span className="muted">Brand or product owner</span></span>
          </label>
        </fieldset>
      )}

      {googleEnabled && (
        <>
          <GoogleButton role={mode === "signup" ? role : undefined} next={mode === "login" ? safeNext(params.get("next")) : undefined} />
          <OrDivider />
        </>
      )}

      {mode === "signup" && (
        <>
          <div className="field">
            <label htmlFor={`${id}-name`}>Your name or brand</label>
            <input id={`${id}-name`} name="display_name" className="input" required maxLength={80} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-country`}>Country you live in</label>
            <select id={`${id}-country`} name="country" className="input" required defaultValue="">
              <option value="" disabled>Choose your country</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <span className="hint">This decides which payout methods you get.</span>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} name="email" type="email" className="input" required autoComplete="email" inputMode="email" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-password`}>Password</label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          className="input"
          required
          minLength={mode === "signup" ? 10 : undefined}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-describedby={mode === "signup" ? `${id}-pw-hint` : undefined}
        />
        {mode === "signup" && <span className="hint" id={`${id}-pw-hint`}>At least 10 characters. A short sentence works well.</span>}
      </div>

      <button type="submit" className="btn" disabled={busy} style={{ width: "100%" }}>
        {busy ? "Please wait…" : mode === "signup" ? "Create free account" : "Sign in"}
      </button>
      <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
        {mode === "signup" ? (
          <>Already have an account? <Link href="/login">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup">Create a free account</Link></>
        )}
      </p>
      {mode === "signup" && (
        <p className="muted" style={{ fontSize: ".88rem", textAlign: "center" }}>
          By joining you agree to our <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy policy</Link>.
        </p>
      )}
    </form>
  );
}
