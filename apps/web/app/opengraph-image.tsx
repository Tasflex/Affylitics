import { ImageResponse } from "next/og";

export const alt = "NetAffil: the global affiliate marketplace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social sharing card, rendered at build time.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 72, background: "linear-gradient(135deg, #29294E 0%, #1d2f7a 60%, #2463EB 100%)", color: "#fff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "#2463EB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, fontWeight: 800, border: "3px solid #ffffff40" }}>N</div>
          <div style={{ fontSize: 44, fontWeight: 800, display: "flex" }}>Net<span style={{ color: "#F28A00" }}>Affil</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>The world is your marketplace.</div>
          <div style={{ fontSize: 32, marginTop: 24, color: "#d8dcff" }}>Brands find people who sell. People find brands that pay.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#29294E" }}>
          {["M-Pesa", "UPI", "PIX", "SEPA", "PayPal", "USDC"].map((r) => (
            <div key={r} style={{ background: "#EDEBFA", borderRadius: 999, padding: "8px 22px" }}>{r}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
