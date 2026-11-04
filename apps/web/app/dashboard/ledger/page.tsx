import { serverApi } from "@/lib/api";
import { requireMe } from "@/lib/session";
import { formatUsd } from "@/lib/site";

type Entry = { kind: string; account: string; amount_cents: number; reference: string | null; created_at: string };

const KIND: Record<string, string> = {
  conversion: "Commission recorded",
  conversion_matured: "Hold period ended",
  conversion_rejected: "Conversion rejected",
  payout_requested: "Withdrawal requested",
  payout_sent: "Withdrawal sent",
  payout_failed: "Withdrawal failed, refunded",
  escrow_funded: "Escrow top-up",
};
const ACCOUNT: Record<string, string> = {
  advertiser_escrow: "Escrow",
  publisher_pending: "Pending",
  publisher_available: "Available",
  payout_clearing: "Being paid out",
};

export default async function Ledger() {
  await requireMe("/dashboard/ledger");
  const { data } = await serverApi<Entry[]>("/api/ledger", { auth: true });
  const entries = data ?? [];
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Ledger</h1>
      <p className="muted" style={{ maxWidth: "65ch" }}>
        Every change to your balances, newest first. Each line is one side of a balanced double-entry transaction, and
        entries can never be edited or deleted.
      </p>
      {entries.length === 0 ? <p>No entries yet.</p> : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Ledger entries</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Balance</th><th scope="col" className="num">Amount</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{KIND[e.kind] ?? e.kind}</td>
                  <td>{ACCOUNT[e.account] ?? e.account}</td>
                  <td className="num" style={{ color: e.amount_cents < 0 ? "var(--danger)" : "var(--green-ink)" }}>
                    {e.amount_cents > 0 ? "+" : "−"}{formatUsd(Math.abs(e.amount_cents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
