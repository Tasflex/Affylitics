import { redirect } from "next/navigation";
import { AdvertiserPanel } from "@/components/dashboard/AdvertiserPanel";
import { requireMe } from "@/lib/session";

export default async function Advertiser({ searchParams }: { searchParams: Promise<{ funded?: string }> }) {
  const me = await requireMe("/dashboard/advertiser");
  if (me.role === "publisher") redirect("/dashboard");
  const { funded } = await searchParams;
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Offers &amp; escrow</h1>
      {funded === "1" && (
        <div className="alert success" role="status">Payment received. Your escrow updates as soon as the provider confirms it, usually within a minute.</div>
      )}
      <AdvertiserPanel />
    </>
  );
}
