"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container section" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "2.2rem" }}>Something went wrong on our side</h1>
      <p className="lede">Your account and balances are safe. Please try again in a minute.</p>
      <button type="button" className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
