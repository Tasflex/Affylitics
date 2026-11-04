//! Endpoints for the intel service (payout worker, KYC webhooks, fraud scoring, payment
//! collection). Authenticated by the shared INTERNAL_TOKEN; nginx never exposes /internal.

use axum::{
    async_trait,
    extract::{FromRequestParts, Path, Query, State},
    http::request::Parts,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    crypto,
    error::{AppError, AppResult},
    ledger, AppState,
};

pub struct Internal;

#[async_trait]
impl FromRequestParts<AppState> for Internal {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        if crypto::constant_time_eq(token.as_bytes(), state.cfg.internal_token.as_bytes()) {
            Ok(Internal)
        } else {
            Err(AppError::Unauthorized)
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/payouts/claim", post(claim_payouts))
        .route("/payouts/:id/result", post(payout_result))
        .route("/kyc/result", post(kyc_result))
        .route("/escrow/credit", post(escrow_credit))
        .route("/clicks/unscored", get(unscored_clicks))
        .route("/clicks/scores", post(click_scores))
}

#[derive(Serialize)]
struct ClaimedPayout {
    id: Uuid,
    user_id: Uuid,
    rail: String,
    provider: String,
    country: String,
    currency: String,
    amount_cents: i64,
    fee_cents: i64,
    display_name: String,
    email: String,
    details: Value,
}

#[derive(Deserialize)]
struct ClaimBody {
    limit: Option<i64>,
    /// Providers the worker has credentials for; payouts for other providers stay queued.
    providers: Vec<String>,
}

/// Claims requested payouts for sending, marking them `processing`. Payouts held for compliance
/// review (countries flagged `review` in rails.json) are skipped here and handled by staff.
async fn claim_payouts(_: Internal, State(state): State<AppState>, Json(body): Json<ClaimBody>) -> AppResult<Json<Vec<ClaimedPayout>>> {
    #[allow(clippy::type_complexity)]
    let rows: Vec<(Uuid, Uuid, String, String, String, String, i64, i64, String, String, Vec<u8>)> = sqlx::query_as(
        "UPDATE payouts p SET status = 'processing', updated_at = now()
         FROM payout_methods m, users u
         WHERE p.id IN (SELECT p2.id FROM payouts p2 JOIN payout_methods m2 ON m2.id = p2.method_id
                        WHERE p2.status = 'requested' AND NOT (m2.country::text = ANY($2)) AND p2.provider = ANY($3)
                        ORDER BY p2.created_at LIMIT $1 FOR UPDATE OF p2 SKIP LOCKED)
           AND m.id = p.method_id AND u.id = p.user_id
         RETURNING p.id, p.user_id, m.rail, p.provider, m.country::text, m.currency::text, p.amount_cents, p.fee_cents,
                   u.display_name, u.email::text, m.details_encrypted",
    )
    .bind(body.limit.unwrap_or(20).clamp(1, 100))
    .bind(state.rails.review_countries())
    .bind(&body.providers)
    .fetch_all(&state.db)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for (id, user_id, rail, provider, country, currency, amount_cents, fee_cents, display_name, email, enc) in rows {
        let details = serde_json::from_slice(&crypto::decrypt(&state.cfg.data_key, &enc)?).map_err(anyhow::Error::from)?;
        out.push(ClaimedPayout { id, user_id, rail, provider, country: country.trim().into(), currency, amount_cents, fee_cents, display_name, email, details });
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
struct PayoutResult {
    status: String,
    provider_ref: Option<String>,
    failure_reason: Option<String>,
    local_currency: Option<String>,
    local_amount: Option<f64>,
    fx_rate: Option<f64>,
}

/// `submitted`: the provider accepted the transfer; records its reference and FX quote, no money
/// moves. `paid` / `failed`: final outcome (usually from the provider's webhook).
async fn payout_result(_: Internal, State(state): State<AppState>, Path(id): Path<Uuid>, Json(r): Json<PayoutResult>) -> AppResult<Json<Value>> {
    if r.status == "submitted" {
        let res = sqlx::query(
            "UPDATE payouts SET provider_ref = $2, local_currency = $3, local_amount = $4::numeric, fx_rate = $5::numeric,
                    updated_at = now()
             WHERE id = $1 AND status = 'processing'",
        )
        .bind(id)
        .bind(&r.provider_ref)
        .bind(&r.local_currency)
        .bind(r.local_amount)
        .bind(r.fx_rate)
        .execute(&state.db)
        .await?;
        if res.rows_affected() == 0 {
            return Err(AppError::Conflict("payout is not processing".into()));
        }
        return Ok(Json(json!({ "ok": true })));
    }
    if r.status != "paid" && r.status != "failed" {
        return Err(AppError::BadRequest("status must be submitted, paid or failed".into()));
    }
    let mut tx = state.db.begin().await?;
    let row: Option<(Uuid, i64)> = sqlx::query_as(
        "UPDATE payouts SET status = $2::payout_status, provider_ref = COALESCE($3, provider_ref), failure_reason = $4,
                local_currency = COALESCE($5, local_currency), local_amount = COALESCE($6::numeric, local_amount),
                fx_rate = COALESCE($7::numeric, fx_rate), updated_at = now()
         WHERE id = $1 AND status = 'processing' RETURNING user_id, amount_cents",
    )
    .bind(id)
    .bind(&r.status)
    .bind(&r.provider_ref)
    .bind(&r.failure_reason)
    .bind(&r.local_currency)
    .bind(r.local_amount)
    .bind(r.fx_rate)
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, amount) = row.ok_or_else(|| AppError::Conflict("payout is not processing".into()))?;
    let clearing = ledger::account(&mut tx, Some(user_id), ledger::CLEARING).await?;
    let (kind, dest) = if r.status == "paid" {
        ("payout_sent", ledger::account(&mut tx, None, ledger::EXTERNAL).await?)
    } else {
        ("payout_failed", ledger::account(&mut tx, Some(user_id), ledger::AVAILABLE).await?)
    };
    ledger::post(&mut tx, kind, Some(id), None, &[(clearing, -amount), (dest, amount)]).await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct KycResult {
    provider_ref: String,
    status: String,
    reason: Option<String>,
}

async fn kyc_result(_: Internal, State(state): State<AppState>, Json(r): Json<KycResult>) -> AppResult<Json<Value>> {
    if !["pending", "approved", "rejected"].contains(&r.status.as_str()) {
        return Err(AppError::BadRequest("bad status".into()));
    }
    let mut tx = state.db.begin().await?;
    let row: Option<(Uuid, i16)> = sqlx::query_as(
        "UPDATE kyc_checks SET status = $2::kyc_status, reason = $3, updated_at = now()
         WHERE provider_ref = $1 AND status IN ('started', 'pending') RETURNING user_id, tier",
    )
    .bind(&r.provider_ref)
    .bind(&r.status)
    .bind(&r.reason)
    .fetch_optional(&mut *tx)
    .await?;
    let (user_id, tier) = row.ok_or(AppError::NotFound)?;
    if r.status == "approved" {
        sqlx::query("UPDATE users SET kyc_tier = GREATEST(kyc_tier, $2) WHERE id = $1")
            .bind(user_id)
            .bind(tier)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("INSERT INTO audit_log (actor_id, action, target, meta) VALUES (NULL, 'kyc.result', $1, $2)")
        .bind(user_id.to_string())
        .bind(json!({ "status": r.status, "tier": tier }))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct CreditBody {
    user_id: Uuid,
    amount_cents: i64,
    /// Payment provider's transaction ID; a repeated webhook cannot credit twice.
    reference: String,
}

/// Credits an advertiser's escrow after the intel service confirms a payment was collected.
async fn escrow_credit(_: Internal, State(state): State<AppState>, Json(b): Json<CreditBody>) -> AppResult<Json<Value>> {
    if b.amount_cents <= 0 || b.reference.is_empty() {
        return Err(AppError::BadRequest("amount and reference required".into()));
    }
    let key = format!("escrow:{}", b.reference);
    let mut tx = state.db.begin().await?;
    let seen: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM ledger_txns WHERE idempotency_key = $1)")
        .bind(&key)
        .fetch_one(&mut *tx)
        .await?;
    if seen {
        return Ok(Json(json!({ "status": "duplicate" })));
    }
    let is_advertiser: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND role = 'advertiser')")
        .bind(b.user_id)
        .fetch_one(&mut *tx)
        .await?;
    if !is_advertiser {
        return Err(AppError::NotFound);
    }
    let external = ledger::account(&mut tx, None, ledger::EXTERNAL).await?;
    let escrow = ledger::account(&mut tx, Some(b.user_id), ledger::ESCROW).await?;
    ledger::post(&mut tx, "escrow_funded", Some(b.user_id), Some(&key), &[(external, -b.amount_cents), (escrow, b.amount_cents)]).await?;
    tx.commit().await?;
    Ok(Json(json!({ "status": "credited" })))
}

#[derive(Deserialize)]
struct UnscoredQuery {
    limit: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
struct UnscoredClick {
    id: Uuid,
    link_id: Uuid,
    publisher_id: Uuid,
    ip_hash: String,
    ua_hash: String,
    country: Option<String>,
    referer_host: Option<String>,
    created_at: DateTime<Utc>,
}

async fn unscored_clicks(_: Internal, State(state): State<AppState>, Query(q): Query<UnscoredQuery>) -> AppResult<Json<Vec<UnscoredClick>>> {
    let rows = sqlx::query_as::<_, UnscoredClick>(
        "SELECT c.id, c.link_id, l.publisher_id, encode(c.ip_hash, 'hex') AS ip_hash, encode(c.ua_hash, 'hex') AS ua_hash,
                c.country::text AS country, c.referer_host, c.created_at
         FROM clicks c JOIN links l ON l.id = c.link_id
         WHERE c.fraud_score IS NULL ORDER BY c.created_at LIMIT $1",
    )
    .bind(q.limit.unwrap_or(500).clamp(1, 5000))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct Score {
    id: Uuid,
    score: f32,
}

async fn click_scores(_: Internal, State(state): State<AppState>, Json(scores): Json<Vec<Score>>) -> AppResult<Json<Value>> {
    let ids: Vec<Uuid> = scores.iter().map(|s| s.id).collect();
    let vals: Vec<f32> = scores.iter().map(|s| s.score.clamp(0.0, 1.0)).collect();
    let res = sqlx::query(
        "UPDATE clicks c SET fraud_score = s.score FROM UNNEST($1::uuid[], $2::real[]) AS s(id, score) WHERE c.id = s.id",
    )
    .bind(&ids)
    .bind(&vals)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "updated": res.rows_affected() })))
}
