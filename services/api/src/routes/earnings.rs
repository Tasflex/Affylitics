use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    auth::{self, CurrentUser},
    error::{AppError, AppResult},
    ledger, AppState,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct ConversionRow {
    id: Uuid,
    offer_title: String,
    external_ref: String,
    sale_cents: Option<i64>,
    commission_cents: i64,
    status: String,
    matures_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

pub async fn publisher_conversions(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<ConversionRow>>> {
    let rows = sqlx::query_as::<_, ConversionRow>(
        "SELECT v.id, o.title AS offer_title, v.external_ref, v.sale_cents, v.commission_cents,
                v.status::text AS status, v.matures_at, v.created_at
         FROM conversions v JOIN offers o ON o.id = v.offer_id
         WHERE v.publisher_id = $1 ORDER BY v.created_at DESC LIMIT 500",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn advertiser_conversions(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<ConversionRow>>> {
    user.require_role("advertiser")?;
    let rows = sqlx::query_as::<_, ConversionRow>(
        "SELECT v.id, o.title AS offer_title, v.external_ref, v.sale_cents, v.commission_cents,
                v.status::text AS status, v.matures_at, v.created_at
         FROM conversions v JOIN offers o ON o.id = v.offer_id JOIN brands b ON b.id = o.brand_id
         WHERE b.owner_id = $1 ORDER BY v.created_at DESC LIMIT 500",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct EntryRow {
    kind: String,
    account: String,
    amount_cents: i64,
    reference: Option<Uuid>,
    created_at: DateTime<Utc>,
}

/// Every ledger entry behind the user's balances, newest first.
pub async fn ledger_entries(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<EntryRow>>> {
    let rows = sqlx::query_as::<_, EntryRow>(
        "SELECT t.kind, a.kind::text AS account, e.amount_cents, t.reference, e.created_at
         FROM ledger_entries e JOIN accounts a ON a.id = e.account_id JOIN ledger_txns t ON t.id = e.txn_id
         WHERE a.owner_id = $1 ORDER BY e.id DESC LIMIT 500",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct RejectBody {
    reason: String,
}

/// Advertisers may reject a conversion during its hold period (refund, fraud, cancelled order).
/// The commission and fee go back to their escrow.
pub async fn reject_conversion(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(body): Json<RejectBody>,
) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    let reason = body.reason.trim();
    if reason.len() < 3 {
        return Err(AppError::BadRequest("give a short reason so the publisher understands".into()));
    }
    let mut tx = state.db.begin().await?;
    let row: Option<(Uuid, Uuid, i64, i64)> = sqlx::query_as(
        "UPDATE conversions v SET status = 'rejected'
         FROM offers o, brands b
         WHERE v.id = $1 AND v.status = 'pending' AND o.id = v.offer_id AND b.id = o.brand_id AND b.owner_id = $2
         RETURNING v.publisher_id, b.owner_id, v.commission_cents, v.fee_cents",
    )
    .bind(id)
    .bind(user.id)
    .fetch_optional(&mut *tx)
    .await?;
    let (publisher, advertiser, commission, fee) =
        row.ok_or_else(|| AppError::Conflict("only pending conversions you own can be rejected".into()))?;
    let pending = ledger::account(&mut tx, Some(publisher), ledger::PENDING).await?;
    let escrow = ledger::account(&mut tx, Some(advertiser), ledger::ESCROW).await?;
    let revenue = ledger::account(&mut tx, None, ledger::REVENUE).await?;
    ledger::post(&mut tx, "conversion_rejected", Some(id), None, &[(pending, -commission), (revenue, -fee), (escrow, commission + fee)]).await?;
    tx.commit().await?;
    auth::audit(&state, Some(user.id), "conversion.reject", Some(id.to_string()), json!({ "reason": reason }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

/// Moves conversions whose hold period has ended from pending to available.
pub async fn mature_conversions(db: &PgPool) -> anyhow::Result<u64> {
    let mut matured = 0;
    loop {
        let mut tx = db.begin().await?;
        let batch: Vec<(Uuid, Uuid, i64)> = sqlx::query_as(
            "UPDATE conversions SET status = 'approved'
             WHERE id IN (SELECT id FROM conversions WHERE status = 'pending' AND matures_at <= now()
                          ORDER BY matures_at LIMIT 200 FOR UPDATE SKIP LOCKED)
             RETURNING id, publisher_id, commission_cents",
        )
        .fetch_all(&mut *tx)
        .await?;
        if batch.is_empty() {
            return Ok(matured);
        }
        for (conv, publisher, amount) in &batch {
            let pending = ledger::account(&mut tx, Some(*publisher), ledger::PENDING).await?;
            let available = ledger::account(&mut tx, Some(*publisher), ledger::AVAILABLE).await?;
            ledger::post(&mut tx, "conversion_matured", Some(*conv), None, &[(pending, -amount), (available, *amount)]).await?;
        }
        tx.commit().await?;
        matured += batch.len() as u64;
    }
}
