import { KycPanel } from "@/components/dashboard/KycPanel";
import { requireMe } from "@/lib/session";

const LEVELS = [
  { tier: 1, title: "Level 1: ID number", body: "Your legal name, date of birth and national ID number, checked with the issuing authority. Unlocks withdrawals up to $1,000 every 30 days." },
  { tier: 2, title: "Level 2: ID photo and selfie", body: "A photo of your ID document and a quick selfie to confirm it is you. Unlocks up to $25,000 every 30 days." },
  { tier: 3, title: "Level 3: Business", body: "Company registration and owners. For agencies, large publishers and advertisers funding more than $10,000." },
];

export default async function Kyc({ searchParams }: { searchParams: Promise<{ simulated?: string }> }) {
  const me = await requireMe("/dashboard/kyc");
  const { simulated } = await searchParams;
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Verification</h1>
      <p className="muted" style={{ maxWidth: "65ch" }}>
        We verify identities to keep payments safe and to meet anti-money-laundering law. Checks are run by Smile ID (for
        African national IDs) or Sumsub. We never see or store photos of your documents ourselves.
      </p>
      <p>Your current level: <strong>{me.kyc_tier === 0 ? "Not verified" : `Level ${me.kyc_tier}`}</strong></p>
      <KycPanel levels={LEVELS} current={me.kyc_tier} simulatedCheck={simulated ?? null} />
    </>
  );
}
