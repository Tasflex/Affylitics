"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container section" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "2.2rem" }}>We can&apos;t load your dashboard right now</h1>
      <p className="lede">Your balances and links are safe. Our account service is briefly unavailable; please try again in a minute.</p>
      <button type="button" className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
