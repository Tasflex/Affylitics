"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Kept in sync with CONSENT_KEY in Analytics.tsx (a server component this file can't import from).
const KEY = "aff-consent";
const OPEN_EVENT = "aff-consent-open";

type Choice = "granted" | "denied";

function apply(choice: Choice) {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

/** Cookie banner: shown until the visitor accepts or rejects analytics and advertising cookies. */
export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved !== "granted" && saved !== "denied") setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  function choose(choice: Choice) {
    try {
      localStorage.setItem(KEY, choice);
    } catch {}
    apply(choice);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <section className="consent" role="region" aria-label="Cookie consent">
      <div className="consent-text">
        <strong>Cookies on NetAffil</strong>
        <p>
          We use essential cookies to keep you signed in. With your permission we&apos;d also use Google Analytics cookies
          to see how people find and use the site. <Link href="/legal/privacy#cookies">Privacy policy</Link>
        </p>
      </div>
      <div className="consent-actions">
        <button type="button" className="btn ghost small" onClick={() => choose("denied")}>Reject</button>
        <button type="button" className="btn small" onClick={() => choose("granted")}>Accept</button>
      </div>
    </section>
  );
}

/** Footer link that reopens the banner so visitors can change their choice. */
export function CookieSettingsButton() {
  return (
    <button type="button" className="link-button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}
