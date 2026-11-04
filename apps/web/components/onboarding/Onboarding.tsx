"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { feeText, railsFor } from "@/lib/rails";

type Role = "publisher" | "advertiser";
type Profile = Record<string, string | string[] | boolean>;

const CHANNELS = ["Website or blog", "YouTube", "TikTok", "Instagram", "Facebook", "X (Twitter)", "WhatsApp or Telegram", "Email newsletter", "Deals or coupon site", "Other"];
const AUDIENCE = ["Just starting", "Under 1,000", "1,000–10,000", "10,000–100,000", "100,000+"];
const NICHES = ["Fashion", "Beauty", "Tech & software", "Finance", "Education", "Health & fitness", "Travel", "Home & solar", "Gaming", "Food", "Kids & family", "Business"];
const MARKETS = ["Worldwide", "Africa", "Asia", "Middle East", "Europe", "Americas", "Oceania"];

function Chips({ legend, name, options, value, onChange, hint }: { legend: string; name: string; options: string[]; value: string[]; onChange: (v: string[]) => void; hint?: string }) {
  const id = useId();
  return (
    <fieldset className="chips" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend>{legend}</legend>
      {hint && <p className="hint" id={`${id}-hint`} style={{ margin: "-4px 0 10px" }}>{hint}</p>}
      <div className="chip-row">
        {options.map((o) => (
          <label key={o} className="chip">
            <input type="checkbox" name={name} value={o} checked={value.includes(o)}
              onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((v) => v !== o))} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Onboarding(props: {
  initialRole: string;
  initialCountry: string;
  initialName: string;
  initialProfile: Profile;
  countries: { code: string; name: string }[];
}) {
  const router = useRouter();
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const needsAccount = !props.initialRole || !props.initialCountry;
  const steps = needsAccount ? ["account", "profile", "setup"] as const : ["profile", "setup"] as const;
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | "">((props.initialRole as Role) || "");
  const [country, setCountry] = useState(props.initialCountry);
  const [name, setName] = useState(props.initialName === "New member" ? "" : props.initialName);
  const p = props.initialProfile;
  const list = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]) : []);
  const [channels, setChannels] = useState(list("channels"));
  const [niches, setNiches] = useState(list("niches"));
  const [markets, setMarkets] = useState(list("markets"));
  const [audience, setAudience] = useState(typeof p.audience === "string" ? p.audience : "");
  const [mainUrl, setMainUrl] = useState(typeof p.main_url === "string" ? p.main_url : "");
  const [website, setWebsite] = useState(typeof p.website === "string" ? p.website : "");
  const [secret, setSecret] = useState<{ brand: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = steps[step];
  const countryName = props.countries.find((c) => c.code === country)?.name ?? country;
  const rails = useMemo(() => (country ? railsFor(country) : null), [country]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/onboarding", body);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (current === "account") {
      if (!role) return setError("Choose whether you're an affiliate or a brand.");
      if (!country) return setError("Choose your country.");
      if (await save({ role, country, display_name: name })) setStep(step + 1);
      return;
    }
    if (current === "profile") {
      if (role === "advertiser") {
        if (!/^https:\/\/[^\s/]+\.[^\s]+/.test(website.trim())) return setError("Enter your website, starting with https://");
        const ok = await save({ display_name: name, profile: { website: website.trim(), niches, markets } });
        if (!ok) return;
        // Create the first brand so the next step can show its tracking secret.
        try {
          setBusy(true);
          const brands = await api<{ id: string }[]>("/api/brands");
          if (brands.length === 0) {
            const res = await api<{ id: string; postback_secret: string }>("/api/brands", { name: name || "My brand", website: website.trim() });
            setSecret({ brand: res.id, value: res.postback_secret });
          }
        } catch (err) {
          setBusy(false);
          return setError((err as Error).message);
        }
        setBusy(false);
      } else {
        const ok = await save({ display_name: name, profile: { channels, niches, audience, main_url: mainUrl.trim() } });
        if (!ok) return;
      }
      setStep(step + 1);
      return;
    }
    if (await save({ complete: true })) {
      router.push(role === "advertiser" ? "/dashboard/advertiser" : "/dashboard");
      router.refresh();
    }
  }

  const titles: Record<string, string> = {
    account: "Welcome to NetAffil",
    profile: role === "advertiser" ? "Tell us about your brand" : "Tell us how you promote",
    setup: role === "advertiser" ? "You're ready to launch" : "Here's how you'll get paid",
  };
  const labels: Record<string, string> = { account: "Account", profile: "Profile", setup: "Get set up" };

  return (
    <div className="onboard">
      <ol className="onboard-steps" aria-label="Setup progress">
        {steps.map((s, i) => (
          <li key={s} data-state={i < step ? "done" : i === step ? "current" : "todo"} aria-current={i === step ? "step" : undefined}>
            <span className="dot" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
            <span>{labels[s]}</span>
          </li>
        ))}
      </ol>

      <form className="card onboard-card" onSubmit={next} aria-labelledby={`${id}-title`}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>Step {step + 1} of {steps.length}</p>
        <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1} style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)", outline: "none" }}>{titles[current]}</h1>
        <div aria-live="assertive">{error && <div className="alert error" role="alert">{error}</div>}</div>

        {current === "account" && (
          <>
            <p className="lede" style={{ fontSize: "1.05rem" }}>A few details to tailor NetAffil to you.</p>
            {!props.initialRole && (
              <fieldset className="radio-cards">
                <legend>I want to</legend>
                <label className="radio-card">
                  <input type="radio" name="role" checked={role === "publisher"} onChange={() => setRole("publisher")} />
                  <span><strong>Earn commissions</strong><br /><span className="muted">Promote brands as an affiliate, creator or publisher</span></span>
                </label>
                <label className="radio-card">
                  <input type="radio" name="role" checked={role === "advertiser"} onChange={() => setRole("advertiser")} />
                  <span><strong>Grow my brand</strong><br /><span className="muted">Launch campaigns and reach new markets</span></span>
                </label>
              </fieldset>
            )}
            <div className="field">
              <label htmlFor={`${id}-name`}>{role === "advertiser" ? "Brand or company name" : "Your name"}</label>
              <input id={`${id}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor={`${id}-country`}>Country you live in</label>
              <select id={`${id}-country`} className="input" value={country} onChange={(e) => setCountry(e.target.value)} required disabled={!!props.initialCountry}>
                <option value="" disabled>Choose your country</option>
                {props.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <span className="hint">This sets the payout methods available to you. It can&apos;t be changed later without contacting support.</span>
            </div>
          </>
        )}

        {current === "profile" && role === "publisher" && (
          <>
            <p className="lede" style={{ fontSize: "1.05rem" }}>This helps us show you the right offers. You can change it any time.</p>
            <Chips legend="Where do you promote?" name="channels" options={CHANNELS} value={channels} onChange={setChannels} hint="Pick all that apply." />
            <div className="field">
              <label htmlFor={`${id}-url`}>Main link (optional)</label>
              <input id={`${id}-url`} className="input" type="url" inputMode="url" placeholder="https://" value={mainUrl} onChange={(e) => setMainUrl(e.target.value)} maxLength={300} />
              <span className="hint">Your website, channel or profile.</span>
            </div>
            <fieldset className="chips">
              <legend>How big is your audience?</legend>
              <div className="chip-row">
                {AUDIENCE.map((a) => (
                  <label key={a} className="chip">
                    <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} />
                    <span>{a}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Chips legend="What do you like to promote?" name="niches" options={NICHES} value={niches} onChange={setNiches} />
          </>
        )}

        {current === "profile" && role === "advertiser" && (
          <>
            <p className="lede" style={{ fontSize: "1.05rem" }}>We&apos;ll set up your brand and match you with relevant affiliates.</p>
            <div className="field">
              <label htmlFor={`${id}-bn`}>Brand name</label>
              <input id={`${id}-bn`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </div>
            <div className="field">
              <label htmlFor={`${id}-web`}>Website</label>
              <input id={`${id}-web`} className="input" type="url" inputMode="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} required />
            </div>
            <Chips legend="What do you sell?" name="niches" options={NICHES} value={niches} onChange={setNiches} />
            <Chips legend="Where are your customers?" name="markets" options={MARKETS} value={markets} onChange={setMarkets} />
          </>
        )}

        {current === "setup" && role === "publisher" && (
          <>
            <p className="lede" style={{ fontSize: "1.05rem" }}>In {countryName}, you can withdraw your commissions with:</p>
            <ul className="rail-grid" style={{ padding: 0, margin: "0 0 20px" }}>
              {rails?.rails.slice(0, 4).map((r) => (
                <li key={r.id} className="rail">
                  <span className="rail-name">{r.name}</span>
                  <span className="rail-min">From ${r.min_usd}</span>
                  <span className="rail-meta">{feeText(r)} · {r.speed}</span>
                </li>
              ))}
            </ul>
            <ol className="timeline">
              <li><strong>Find an offer and get your link</strong><span>Every click and sale is tracked to you.</span></li>
              <li><strong>Earn commissions</strong><span>Sales show as pending during the brand&apos;s hold period, then become available.</span></li>
              <li><strong>Verify once, withdraw any time</strong><span>A one-time ID check before your first withdrawal, then cash out the way you prefer.</span></li>
            </ol>
          </>
        )}

        {current === "setup" && role === "advertiser" && (
          <>
            {secret ? (
              <div className="alert success" role="status" style={{ marginTop: 8 }}>
                <strong>Your tracking secret.</strong> Your developer uses it to confirm sales with NetAffil. Copy it now: we won&apos;t show it again.
                <div className="row" style={{ marginTop: 10 }}>
                  <span className="code" style={{ flex: 1 }}>{secret.value}</span>
                  <button type="button" className="btn small secondary" onClick={async () => { await navigator.clipboard.writeText(secret.value); setCopied(true); }}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="hint" style={{ margin: "8px 0 0" }}>Brand ID: <span className="code">{secret.brand}</span></p>
              </div>
            ) : (
              <p className="lede" style={{ fontSize: "1.05rem" }}>Your brand is set up.</p>
            )}
            <ol className="timeline" style={{ marginTop: 20 }}>
              <li><strong>Create your first campaign</strong><span>Choose the commission, cookie window, hold period and markets.</span></li>
              <li><strong>Fund your escrow</strong><span>Campaigns go live once funded, so affiliates know they&apos;ll be paid.</span></li>
              <li><strong>Connect tracking</strong><span>Send a signed postback for each confirmed sale. <Link href="/advertisers#tracking">See how</Link>.</span></li>
            </ol>
          </>
        )}

        <div className="spread" style={{ marginTop: 28 }}>
          {step > 0 && !(current === "setup" && secret) ? (
            <button type="button" className="btn ghost" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}>Back</button>
          ) : <span />}
          <button type="submit" className="btn lg" disabled={busy}>
            {busy ? "Saving…" : current === "setup" ? (role === "advertiser" ? "Go to my dashboard" : "Start exploring") : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
