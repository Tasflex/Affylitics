use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::{limit, valid_country};
use crate::{
    auth::{self, CurrentUser},
    crypto,
    error::{AppError, AppResult},
    ledger,
    rails::CountryRails,
    AppState,
};

/// 30-day payout limits per KYC tier, in cents. Tier 0 cannot withdraw.
pub fn tier_limit_cents(tier: i16) -> i64 {
    match tier {
        1 => 100_000,
        2 => 2_500_000,
        3 => i64::MAX,
        _ => 0,
    }
}

pub async fn rails_for_country(State(state): State<AppState>, Path(country): Path<String>) -> AppResult<Json<CountryRails>> {
    let country = country.to_uppercase();
    if !valid_country(&country) {
        return Err(AppError::NotFound);
    }
    state.rails.for_country(&country).map(Json).ok_or(AppError::NotFound)
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MethodRow {
    id: Uuid,
    rail: String,
    currency: String,
    details_hint: String,
    is_default: bool,
}

pub async fn list_methods(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<MethodRow>>> {
    let rows = sqlx::query_as::<_, MethodRow>(
        "SELECT id, rail, currency::text AS currency, details_hint, is_default FROM payout_methods
         WHERE user_id = $1 AND removed_at IS NULL ORDER BY is_default DESC, created_at",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct MethodBody {
    rail: String,
    /// Rail-specific fields, e.g. {"phone": "+2547..."} or {"account_number": "...", "bank_code": "..."}.
    details: serde_json::Map<String, Value>,
}

/// The value we show back to the user: the last four characters of the main identifier.
fn hint(details: &serde_json::Map<String, Value>) -> String {
    let main = ["phone", "account_number", "iban", "email", "wallet_address", "upi_id", "pix_key"]
        .iter()
        .find_map(|k| details.get(*k).and_then(Value::as_str))
        .unwrap_or("");
    let tail: String = main.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("•••• {tail}")
}

pub async fn add_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<MethodBody>,
) -> AppResult<Json<Value>> {
    limit(&state, &headers, "method", 10, 3600)?;
    let country_rails = state
        .rails
        .for_country(&user.country)
        .ok_or_else(|| AppError::Forbidden("we cannot pay out to this country".into()))?;
    if !country_rails.rails.iter().any(|r| r.id == body.rail) {
        return Err(AppError::BadRequest("that payout method is not available in your country".into()));
    }
    if body.details.is_empty() || body.details.values().any(|v| !v.is_string() || v.as_str().unwrap().len() > 200) {
        return Err(AppError::BadRequest("fill in the payout details".into()));
    }
    let plaintext = serde_json::to_vec(&body.details).map_err(anyhow::Error::from)?;
    let encrypted = crypto::encrypt(&state.cfg.data_key, &plaintext)?;
    let first: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM payout_methods WHERE user_id = $1 AND removed_at IS NULL)")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO payout_methods (user_id, rail, country, currency, details_encrypted, details_hint, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(user.id)
    .bind(&body.rail)
    .bind(&user.country)
    .bind(&country_rails.currency)
    .bind(encrypted)
    .bind(hint(&body.details))
    .bind(first)
    .fetch_one(&state.db)
    .await?;
    auth::audit(&state, Some(user.id), "payout_method.add", Some(id.to_string()), json!({ "rail": body.rail }), &headers).await;
    Ok(Json(json!({ "id": id })))
}

pub async fn remove_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Value>> {
    let res = sqlx::query("UPDATE payout_methods SET removed_at = now(), is_default = false WHERE id = $1 AND user_id = $2 AND removed_at IS NULL")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "payout_method.remove", Some(id.to_string()), json!({}), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct PayoutRow {
    id: Uuid,
    amount_cents: i64,
    fee_cents: i64,
    local_currency: Option<String>,
    local_amount: Option<String>,
    status: String,
    rail: String,
    failure_reason: Option<String>,
    created_at: DateTime<Utc>,
}

pub async fn list_payouts(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<PayoutRow>>> {
    let rows = sqlx::query_as::<_, PayoutRow>(
        "SELECT p.id, p.amount_cents, p.fee_cents, p.local_currency::text AS local_currency, p.local_amount::text AS local_amount,
                p.status::text AS status, m.rail, p.failure_reason, p.created_at
         FROM payouts p JOIN payout_methods m ON m.id = p.method_id
         WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 200",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct PayoutBody {
    method_id: Uuid,
    amount_cents: i64,
    /// Client-generated key; resubmitting the same key returns the original payout.
    idempotency_key: String,
}

pub async fn request_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<PayoutBody>,
) -> AppResult<Json<Value>> {
    user.require_role("publisher")?;
    limit(&state, &headers, "payout", 10, 3600)?;
    let key = body.idempotency_key.trim();
    if key.is_empty() || key.len() > 80 {
        return Err(AppError::BadRequest("missing idempotency key".into()));
    }
    if let Some(existing) = sqlx::query_scalar::<_, Uuid>("SELECT id FROM payouts WHERE user_id = $1 AND idempotency_key = $2")
        .bind(user.id)
        .bind(key)
        .fetch_optional(&state.db)
        .await?
    {
        return Ok(Json(json!({ "id": existing, "duplicate": true })));
    }

    if user.kyc_tier < 1 {
        return Err(AppError::Forbidden("verify your identity before your first payout".into()));
    }
    let (rail_id,): (String,) = sqlx::query_as("SELECT rail FROM payout_methods WHERE id = $1 AND user_id = $2 AND removed_at IS NULL")
        .bind(body.method_id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let rail = state.rails.rail(&rail_id).ok_or_else(|| AppError::BadRequest("this payout method is no longer supported".into()))?;
    let min_cents = (rail.min_usd * 100.0).round() as i64;
    if body.amount_cents < min_cents {
        return Err(AppError::BadRequest(format!("the minimum for {} is ${:.2}", rail.name, rail.min_usd)));
    }
    let fee_cents = ((body.amount_cents as f64) * rail.fee_pct / 100.0 + rail.fee_usd * 100.0).round() as i64;
    if fee_cents >= body.amount_cents {
        return Err(AppError::BadRequest("amount is too small to cover the transfer fee".into()));
    }

    let recent: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM payouts
         WHERE user_id = $1 AND status <> 'failed' AND created_at > now() - interval '30 days'",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;
    if recent + body.amount_cents > tier_limit_cents(user.kyc_tier) {
        return Err(AppError::Forbidden("this would pass your 30-day payout limit; complete the next verification level to raise it".into()));
    }

    let mut tx = state.db.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO payouts (user_id, method_id, amount_cents, fee_cents, provider, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(user.id)
    .bind(body.method_id)
    .bind(body.amount_cents)
    .bind(fee_cents)
    .bind(&rail.provider)
    .bind(key)
    .fetch_one(&mut *tx)
    .await?;
    let available = ledger::account(&mut tx, Some(user.id), ledger::AVAILABLE).await?;
    let clearing = ledger::account(&mut tx, Some(user.id), ledger::CLEARING).await?;
    ledger::post(&mut tx, "payout_requested", Some(id), None, &[(available, -body.amount_cents), (clearing, body.amount_cents)]).await?;
    tx.commit().await?;

    auth::audit(&state, Some(user.id), "payout.request", Some(id.to_string()), json!({ "amount_cents": body.amount_cents, "rail": rail_id }), &headers).await;
    Ok(Json(json!({ "id": id, "fee_cents": fee_cents, "status": "requested" })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hint_shows_last_four() {
        let mut m = serde_json::Map::new();
        m.insert("phone".into(), Value::String("+254712345678".into()));
        assert_eq!(hint(&m), "•••• 5678");
    }

    #[test]
    fn tier_zero_cannot_withdraw() {
        assert_eq!(tier_limit_cents(0), 0);
        assert!(tier_limit_cents(2) > tier_limit_cents(1));
    }
}
