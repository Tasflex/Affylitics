import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container section" style={{ maxWidth: 640 }}>
      <p className="eyebrow">404</p>
      <h1>This page isn&apos;t here</h1>
      <p className="lede">It may have moved, or the offer may have ended.</p>
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/" className="btn">Go home</Link>
        <Link href="/offers" className="btn ghost">Browse offers</Link>
      </div>
    </div>
  );
}
