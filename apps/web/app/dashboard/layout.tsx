import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashNav } from "@/components/DashNav";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  if (!me.onboarded) redirect("/onboarding");
  return (
    <div className="container dash">
      <DashNav role={me.role} name={me.display_name} />
      <div>{children}</div>
    </div>
  );
}
