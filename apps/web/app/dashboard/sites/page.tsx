import { SitesPanel } from "@/components/dashboard/SitesPanel";
import { requireMe } from "@/lib/session";

export default async function Sites() {
  const me = await requireMe("/dashboard/sites");
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Websites</h1>
      <p className="muted" style={{ maxWidth: "65ch" }}>
        {me.role === "advertiser"
          ? "Prove you own your brand's website. A verified domain earns your brand a trust badge and speeds up brand verification."
          : "Prove you own the websites where you promote offers. Verified sites show brands your traffic is genuine."}
      </p>
      <SitesPanel />
    </>
  );
}
