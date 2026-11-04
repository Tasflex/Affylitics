import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Reach affiliates in every market",
  description:
    "List your product on Affylitics and reach publishers across Africa, Asia, Latin America and beyond. Pay only for results, from an escrow you control, with server-to-server tracking.",
  alternates: { canonical: "/advertisers" },
};

const SIGNATURE_EXAMPLE = `ts=$(date +%s)
body='{"click_id":"<aff_click from your landing URL>","external_ref":"order-1042","sale_cents":4999}'
sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$POSTBACK_SECRET" -hex | cut -d' ' -f2)

curl https://network.affylitics.com/api/postback \\
  -H "Content-Type: application/json" \\
  -H "X-Affylitics-Brand: $BRAND_ID" \\
  -H "X-Affylitics-Timestamp: $ts" \\
  -H "X-Affylitics-Signature: $sig" \\
  -d "$body"`;

export default function Advertisers() {
  return (
    <div className="container section">
      <p className="eyebrow">For advertisers</p>
      <h1>Thousands of new markets, paid on results</h1>
      <p className="lede">
        Affylitics publishers write in local languages, run local communities and reach buyers the big networks never
        recruited. You set the commission, fund an escrow, and pay only when a sale or lead is confirmed.
      </p>
      <div className="row" style={{ margin: "24px 0 48px" }}>
        <Link href="/signup?role=advertiser" className="btn">List your first offer</Link>
      </div>

      <ol className="steps">
        <li><h3>Create your brand</h3><p className="muted">Add your website and get a postback secret for server-to-server tracking.</p></li>
        <li><h3>Set the offer</h3><p className="muted">Fixed per sale or lead, or a revenue share. Choose hold and cookie windows.</p></li>
        <li><h3>Fund escrow</h3><p className="muted">Top up by card, mobile money or bank. Offers go live once funded.</p></li>
        <li><h3>Confirm conversions</h3><p className="muted">Send a signed postback per sale. Reject refunds during the hold period.</p></li>
      </ol>

      <h2 style={{ marginTop: 56 }}>Pricing</h2>
      <div className="prose">
        <p>
          A platform fee of 20% is added on top of each commission you pay out. No setup fee, no monthly minimum. Unused
          escrow stays yours. If your escrow runs out, your offers pause automatically so publishers never send traffic
          that can&apos;t be paid.
        </p>
      </div>

      <h2 style={{ marginTop: 40 }}>Tracking in one request</h2>
      <div className="prose">
        <p>
          Each click arrives on your landing page with an <code className="code">aff_click</code> parameter. Store it with
          the order. When the order is confirmed, sign the JSON body with your postback secret (HMAC-SHA256 over
          <code className="code">timestamp.body</code>) and send it to us:
        </p>
      </div>
      <pre className="card code" style={{ overflowX: "auto", whiteSpace: "pre" }} tabIndex={0} aria-label="Example postback request">
        {SIGNATURE_EXAMPLE}
      </pre>
    </div>
  );
}
