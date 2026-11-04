//! Double-entry ledger. The database enforces that each transaction sums to zero and that
//! escrow/pending/available/clearing balances never go negative; this module is the only
//! place that writes entries.

use serde::Serialize;
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

pub const ESCROW: &str = "advertiser_escrow";
pub const PENDING: &str = "publisher_pending";
pub const AVAILABLE: &str = "publisher_available";
pub const CLEARING: &str = "payout_clearing";
pub const REVENUE: &str = "platform_revenue";
pub const EXTERNAL: &str = "external";

/// The account for (owner, kind), creating it on first use. Platform accounts have no owner.
pub async fn account(conn: &mut PgConnection, owner: Option<Uuid>, kind: &str) -> sqlx::Result<Uuid> {
    sqlx::query(
        "INSERT INTO accounts (owner_id, kind) VALUES ($1, $2::account_kind)
         ON CONFLICT (owner_id, kind) DO NOTHING",
    )
    .bind(owner)
    .bind(kind)
    .execute(&mut *conn)
    .await?;
    sqlx::query_scalar(
        "SELECT id FROM accounts WHERE owner_id IS NOT DISTINCT FROM $1 AND kind = $2::account_kind",
    )
    .bind(owner)
    .bind(kind)
    .fetch_one(&mut *conn)
    .await
}

/// Posts a balanced transaction. Must run inside a DB transaction: the balance checks fire
/// at commit.
pub async fn post(
    conn: &mut PgConnection,
    kind: &str,
    reference: Option<Uuid>,
    idempotency_key: Option<&str>,
    entries: &[(Uuid, i64)],
) -> sqlx::Result<Uuid> {
    debug_assert_eq!(entries.iter().map(|(_, a)| a).sum::<i64>(), 0, "unbalanced ledger txn");
    let txn: Uuid = sqlx::query_scalar(
        "INSERT INTO ledger_txns (kind, reference, idempotency_key) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(kind)
    .bind(reference)
    .bind(idempotency_key)
    .fetch_one(&mut *conn)
    .await?;
    for (account_id, amount) in entries.iter().filter(|(_, a)| *a != 0) {
        sqlx::query("INSERT INTO ledger_entries (txn_id, account_id, amount_cents) VALUES ($1, $2, $3)")
            .bind(txn)
            .bind(account_id)
            .bind(amount)
            .execute(&mut *conn)
            .await?;
    }
    Ok(txn)
}

#[derive(Debug, Default, Serialize)]
pub struct Balances {
    pub escrow_cents: i64,
    pub pending_cents: i64,
    pub available_cents: i64,
    pub in_payout_cents: i64,
}

pub async fn balances(db: &PgPool, owner: Uuid) -> sqlx::Result<Balances> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT a.kind::text, COALESCE(SUM(e.amount_cents), 0)::bigint
         FROM accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
         WHERE a.owner_id = $1 GROUP BY a.kind",
    )
    .bind(owner)
    .fetch_all(db)
    .await?;
    let mut b = Balances::default();
    for (kind, sum) in rows {
        match kind.as_str() {
            ESCROW => b.escrow_cents = sum,
            PENDING => b.pending_cents = sum,
            AVAILABLE => b.available_cents = sum,
            CLEARING => b.in_payout_cents = sum,
            _ => {}
        }
    }
    Ok(b)
}

/// Splits an advertiser's cost for a conversion into publisher commission and platform fee.
/// The fee is charged on top of the commission, so the publisher gets the full advertised rate.
pub fn split(commission_cents: i64, fee_bps: i32) -> (i64, i64) {
    let fee = commission_cents * fee_bps as i64 / 10_000;
    (commission_cents, fee)
}

#[cfg(test)]
mod tests {
    #[test]
    fn fee_is_on_top() {
        assert_eq!(super::split(1000, 2000), (1000, 200));
        assert_eq!(super::split(999, 2000), (999, 199));
    }
}
