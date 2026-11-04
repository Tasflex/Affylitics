//! Staff console API. Every route requires `users.is_admin`; non-admins get 404. Every change is
//! written to the audit log with the acting admin.

use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::{earnings, internal, limit};
use crate::{
    auth::{self, CurrentUser},
    error::{AppError, AppResult},
    ledger, AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/users", get(users))
        .route("/users/:id", get(user_detail))
        .route("/users/:id/status", post(set_user_status))
        .route("/users/:id/kyc", post(set_kyc_tier))
        .route("/brands", get(brands))
        .route("/brands/:id/verify", post(verify_brand))
        .route("/offers", get(offers))
        .route("/offers/:id/status", post(set_offer_status))
        .route("/payouts", get(payouts))
        .route("/payouts/:id/settle", post(settle_payout))
        .route("/conversions", get(conversions))
        .route("/conversions/:id/reject", post(reject_conversion))
        .route("/escrow/credit", post(credit_escrow))
        .route("/audit", get(audit_log))
}

fn reason_ok(r: &str) -> AppResult<&str> {
    let r = r.trim();
    if r.len() < 3 || r.len() > 500 {
        return Err(AppError::BadRequest("give a reason (3 to 500 characters); it is kept in the audit log".into()));
    }
    Ok(r)
}

#[derive(Deserialize)]
pub struct Page {
    q: Option<String>,
    role: Option<String>,
    status: Option<String>,
    verified: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
}

impl Page {
    fn limit(&self) -> i64 {
        self.limit.unwrap_or(50).clamp(1, 200)
    }
    fn offset(&self) -> i64 {
        self.offset.unwrap_or(0).max(0)
    }
    fn q(&self) -> Option<String> {
        self.q.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(|s| s.chars().take(80).collect())
    }
    fn status(&self) -> Option<String> {
        self.status.as_deref().filter(|s| !s.is_empty() && *s != "all").map(str::to_string)
    }
}

// ── Overview ──────────────────────────────────────────────────────────────

async fn stats(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_admin()?;
    let row: (i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT
           (SELECT COUNT(*) FROM users WHERE role = 'publisher'),
           (SELECT COUNT(*) FROM users WHERE role = 'advertiser'),
           (SELECT COUNT(*) FROM users WHERE created_at > now() - interval '7 days'),
           (SELECT COUNT(*) FROM users WHERE onboarded_at IS NULL),
           (SELECT COUNT(*) FROM offers WHERE status = 'active'),
           (SELECT COUNT(*) FROM brands WHERE NOT verified),
           (SELECT COUNT(*) FROM clicks WHERE created_at > now() - interval '30 days'),
           (SELECT COUNT(*) FROM conversions WHERE created_at > now() - interval '30 days'),
           (SELECT COALESCE(SUM(commission_cents), 0)::bigint FROM conversions WHERE status <> 'rejected' AND created_at > now() - interval '30 days'),
           (SELECT COALESCE(SUM(e.amount_cents), 0)::bigint FROM ledger_entries e JOIN accounts a ON a.id = e.account_id WHERE a.kind = 'platform_revenue'),
           (SELECT COALESCE(SUM(e.amount_cents), 0)::bigint FROM ledger_entries e JOIN accounts a ON a.id = e.account_id WHERE a.kind = 'advertiser_escrow'),
           (SELECT COUNT(*) FROM payouts WHERE status = 'requested'),
           (SELECT COUNT(*) FROM payouts WHERE status = 'processing' AND updated_at < now() - interval '15 minutes' AND provider_ref IS NULL),
           (SELECT COUNT(*) FROM kyc_checks WHERE status IN ('started', 'pending'))",
    )
    .fetch_one(&state.db)
    .await?;
    let review = state.rails.review_countries();
    let held: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM payouts p JOIN payout_methods m ON m.id = p.method_id WHERE p.status = 'requested' AND m.country::text = ANY($1)",
    )
    .bind(&review)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "publishers": row.0, "advertisers": row.1, "signups_7d": row.2, "not_onboarded": row.3,
        "active_offers": row.4, "unverified_brands": row.5,
        "clicks_30d": row.6, "conversions_30d": row.7, "commission_30d_cents": row.8,
        "platform_revenue_cents": row.9, "escrow_total_cents": row.10,
        "payouts_queued": row.11, "payouts_stuck": row.12, "payouts_held_for_review": held,
        "kyc_open": row.13,
    })))
}

// ── Users ─────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    display_name: String,
    role: Option<String>,
    country: Option<String>,
    kyc_tier: i16,
    status: String,
    email_verified: bool,
    is_admin: bool,
    onboarded: bool,
    created_at: DateTime<Utc>,
}

async fn users(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Value>> {
    user.require_admin()?;
    let filter = "($1::text IS NULL OR u.email::text ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%' OR u.id::text = $1)
                  AND ($2::text IS NULL OR u.role::text = $2) AND ($3::text IS NULL OR u.status::text = $3)";
    let rows = sqlx::query_as::<_, UserRow>(&format!(
        "SELECT u.id, u.email::text AS email, u.display_name, u.role::text AS role, u.country::text AS country, u.kyc_tier,
                u.status::text AS status, u.email_verified, u.is_admin, u.onboarded_at IS NOT NULL AS onboarded, u.created_at
         FROM users u WHERE {filter} ORDER BY u.created_at DESC LIMIT $4 OFFSET $5"
    ))
    .bind(p.q())
    .bind(p.role.as_deref().filter(|r| !r.is_empty() && *r != "all"))
    .bind(p.status())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    let total: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM users u WHERE {filter}"))
        .bind(p.q())
        .bind(p.role.as_deref().filter(|r| !r.is_empty() && *r != "all"))
        .bind(p.status())
        .fetch_one(&state.db)
        .await?;
    Ok(Json(json!({ "rows": rows, "total": total })))
}

async fn user_detail(State(state): State<AppState>, user: CurrentUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    user.require_admin()?;
    let u = sqlx::query_as::<_, UserRow>(
        "SELECT u.id, u.email::text AS email, u.display_name, u.role::text AS role, u.country::text AS country, u.kyc_tier,
                u.status::text AS status, u.email_verified, u.is_admin, u.onboarded_at IS NOT NULL AS onboarded, u.created_at
         FROM users u WHERE u.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let (profile, suspended_reason): (Value, Option<String>) = sqlx::query_as("SELECT profile, suspended_reason FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let balances = ledger::balances(&state.db, id).await?;
    let brands: Vec<(Uuid, String, String, bool)> = sqlx::query_as("SELECT id, name, website, verified FROM brands WHERE owner_id = $1 ORDER BY created_at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    let kyc: Vec<(String, i16, String, Option<String>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT provider, tier, status::text, reason, created_at FROM kyc_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let audit: Vec<(String, Option<String>, Value, Option<Uuid>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT action, target, meta, actor_id, created_at FROM audit_log
         WHERE actor_id = $1 OR target = $2 ORDER BY id DESC LIMIT 30",
    )
    .bind(id)
    .bind(id.to_string())
    .fetch_all(&state.db)
    .await?;
    let sites: Vec<(String, Option<DateTime<Utc>>)> = sqlx::query_as("SELECT url, verified_at FROM sites WHERE user_id = $1 ORDER BY created_at")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    let identities: Vec<(String,)> = sqlx::query_as("SELECT provider FROM user_identities WHERE user_id = $1")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(json!({
        "user": u,
        "profile": profile,
        "suspended_reason": suspended_reason,
        "balances": balances,
        "sites": sites.into_iter().map(|(url, verified_at)| json!({ "url": url, "verified_at": verified_at })).collect::<Vec<_>>(),
        "sign_in": identities.into_iter().map(|(p,)| p).collect::<Vec<_>>(),
        "brands": brands.into_iter().map(|(id, name, website, verified)| json!({ "id": id, "name": name, "website": website, "verified": verified })).collect::<Vec<_>>(),
        "kyc": kyc.into_iter().map(|(provider, tier, status, reason, at)| json!({ "provider": provider, "tier": tier, "status": status, "reason": reason, "created_at": at })).collect::<Vec<_>>(),
        "audit": audit.into_iter().map(|(action, target, meta, actor, at)| json!({ "action": action, "target": target, "meta": meta, "actor_id": actor, "created_at": at })).collect::<Vec<_>>(),
    })))
}

#[derive(Deserialize)]
struct StatusBody {
    status: String,
    reason: String,
}

async fn set_user_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<StatusBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    if id == user.id {
        return Err(AppError::BadRequest("you can't change your own account status".into()));
    }
    if b.status != "active" && b.status != "suspended" {
        return Err(AppError::BadRequest("status must be active or suspended".into()));
    }
    let reason = reason_ok(&b.reason)?;
    let mut tx = state.db.begin().await?;
    let res = sqlx::query("UPDATE users SET status = $2::user_status, suspended_reason = CASE WHEN $2 = 'suspended' THEN $3 ELSE NULL END WHERE id = $1")
        .bind(id)
        .bind(&b.status)
        .bind(reason)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    if b.status == "suspended" {
        // Sign them out everywhere and stop their campaigns sending traffic.
        sqlx::query("DELETE FROM sessions WHERE user_id = $1").bind(id).execute(&mut *tx).await?;
        sqlx::query("UPDATE offers o SET status = 'paused' FROM brands b WHERE o.brand_id = b.id AND b.owner_id = $1 AND o.status = 'active'")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    auth::audit(&state, Some(user.id), &format!("admin.user.{}", b.status), Some(id.to_string()), json!({ "reason": reason }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct KycBody {
    tier: i16,
    reason: String,
}

/// Manual verification override, e.g. after checking documents through support.
async fn set_kyc_tier(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<KycBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    if !(0..=3).contains(&b.tier) {
        return Err(AppError::BadRequest("tier must be 0 to 3".into()));
    }
    let reason = reason_ok(&b.reason)?;
    let res = sqlx::query("UPDATE users SET kyc_tier = $2 WHERE id = $1").bind(id).bind(b.tier).execute(&state.db).await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "admin.user.kyc_tier", Some(id.to_string()), json!({ "tier": b.tier, "reason": reason }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

// ── Brands and offers ─────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct BrandRow {
    id: Uuid,
    name: String,
    website: String,
    verified: bool,
    /// The owner proved control of the brand's website with the verification meta tag.
    domain_verified: bool,
    owner_id: Uuid,
    owner_email: String,
    offers: i64,
    escrow_cents: i64,
    created_at: DateTime<Utc>,
}

async fn brands(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Vec<BrandRow>>> {
    user.require_admin()?;
    let rows = sqlx::query_as::<_, BrandRow>(
        "SELECT b.id, b.name, b.website, b.verified,
                EXISTS(SELECT 1 FROM sites s WHERE s.user_id = b.owner_id AND s.verified_at IS NOT NULL
                       AND s.host = regexp_replace(lower(b.website), '^https?://(www\\.)?([^/:]+).*$', '\\2')) AS domain_verified,
                b.owner_id, u.email::text AS owner_email,
                (SELECT COUNT(*) FROM offers o WHERE o.brand_id = b.id) AS offers,
                COALESCE((SELECT SUM(e.amount_cents) FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
                          WHERE a.owner_id = b.owner_id AND a.kind = 'advertiser_escrow'), 0)::bigint AS escrow_cents,
                b.created_at
         FROM brands b JOIN users u ON u.id = b.owner_id
         WHERE ($1::bool IS NULL OR b.verified = $1)
           AND ($2::text IS NULL OR b.name ILIKE '%' || $2 || '%' OR b.website ILIKE '%' || $2 || '%' OR u.email::text ILIKE '%' || $2 || '%')
         ORDER BY b.verified, b.created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(p.verified)
    .bind(p.q())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct VerifyBody {
    verified: bool,
}

async fn verify_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<VerifyBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    let res = sqlx::query("UPDATE brands SET verified = $2 WHERE id = $1").bind(id).bind(b.verified).execute(&state.db).await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "admin.brand.verify", Some(id.to_string()), json!({ "verified": b.verified }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, sqlx::FromRow)]
struct OfferRow {
    id: Uuid,
    slug: String,
    title: String,
    brand: String,
    status: String,
    model: String,
    payout_cents: Option<i64>,
    payout_bps: Option<i32>,
    clicks: i64,
    conversions: i64,
    created_at: DateTime<Utc>,
}

async fn offers(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Vec<OfferRow>>> {
    user.require_admin()?;
    let rows = sqlx::query_as::<_, OfferRow>(
        "SELECT o.id, o.slug, o.title, b.name AS brand, o.status::text AS status, o.model::text AS model, o.payout_cents, o.payout_bps,
                (SELECT COUNT(*) FROM clicks c JOIN links l ON l.id = c.link_id WHERE l.offer_id = o.id) AS clicks,
                (SELECT COUNT(*) FROM conversions v WHERE v.offer_id = o.id) AS conversions,
                o.created_at
         FROM offers o JOIN brands b ON b.id = o.brand_id
         WHERE ($1::text IS NULL OR o.status::text = $1)
           AND ($2::text IS NULL OR o.title ILIKE '%' || $2 || '%' OR b.name ILIKE '%' || $2 || '%')
         ORDER BY o.created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(p.status())
    .bind(p.q())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn set_offer_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<StatusBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    // Staff can take campaigns down; only the advertiser (with funded escrow) can set them live.
    if b.status != "paused" && b.status != "archived" {
        return Err(AppError::BadRequest("staff can pause or archive campaigns".into()));
    }
    let reason = reason_ok(&b.reason)?;
    let res = sqlx::query("UPDATE offers SET status = $2::offer_status WHERE id = $1").bind(id).bind(&b.status).execute(&state.db).await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "admin.offer.status", Some(id.to_string()), json!({ "status": b.status, "reason": reason }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

// ── Money ─────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
struct PayoutRow {
    id: Uuid,
    user_id: Uuid,
    email: String,
    rail: String,
    country: String,
    provider: String,
    amount_cents: i64,
    fee_cents: i64,
    status: String,
    provider_ref: Option<String>,
    failure_reason: Option<String>,
    held_for_review: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

async fn payouts(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Vec<PayoutRow>>> {
    user.require_admin()?;
    let rows = sqlx::query_as::<_, PayoutRow>(
        "SELECT p.id, p.user_id, u.email::text AS email, m.rail, m.country::text AS country, p.provider, p.amount_cents, p.fee_cents,
                p.status::text AS status, p.provider_ref, p.failure_reason,
                (p.status = 'requested' AND m.country::text = ANY($2)) AS held_for_review,
                p.created_at, p.updated_at
         FROM payouts p JOIN payout_methods m ON m.id = p.method_id JOIN users u ON u.id = p.user_id
         WHERE ($1::text IS NULL OR p.status::text = $1)
         ORDER BY (p.status IN ('requested', 'processing')) DESC, p.created_at DESC LIMIT $3 OFFSET $4",
    )
    .bind(p.status())
    .bind(state.rails.review_countries())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct SettleBody {
    status: String,
    provider_ref: Option<String>,
    reason: String,
}

/// Records the outcome of a payout staff handled by hand: a held-for-review payout sent manually,
/// or a stuck one reconciled against the provider's dashboard.
async fn settle_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<SettleBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    if b.status != "paid" && b.status != "failed" {
        return Err(AppError::BadRequest("status must be paid or failed".into()));
    }
    let reason = reason_ok(&b.reason)?;
    let provider_ref = b.provider_ref.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if b.status == "paid" && provider_ref.is_none() {
        return Err(AppError::BadRequest("enter the provider's transaction reference for a paid payout".into()));
    }
    let failure = (b.status == "failed").then_some(reason);
    internal::settle_payout(&state, id, &b.status, provider_ref, failure, (None, None, None), &["requested", "processing"]).await?;
    auth::audit(&state, Some(user.id), "admin.payout.settle", Some(id.to_string()), json!({ "status": b.status, "provider_ref": provider_ref, "reason": reason }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize, sqlx::FromRow)]
struct ConversionRow {
    id: Uuid,
    offer_title: String,
    brand: String,
    publisher_email: String,
    external_ref: String,
    commission_cents: i64,
    fee_cents: i64,
    status: String,
    reject_reason: Option<String>,
    click_fraud_score: Option<f32>,
    created_at: DateTime<Utc>,
}

async fn conversions(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Vec<ConversionRow>>> {
    user.require_admin()?;
    let rows = sqlx::query_as::<_, ConversionRow>(
        "SELECT v.id, o.title AS offer_title, b.name AS brand, u.email::text AS publisher_email, v.external_ref,
                v.commission_cents, v.fee_cents, v.status::text AS status, v.reject_reason, c.fraud_score AS click_fraud_score, v.created_at
         FROM conversions v JOIN offers o ON o.id = v.offer_id JOIN brands b ON b.id = o.brand_id
              JOIN users u ON u.id = v.publisher_id JOIN clicks c ON c.id = v.click_id
         WHERE ($1::text IS NULL OR v.status::text = $1)
         ORDER BY c.fraud_score DESC NULLS LAST, v.created_at DESC LIMIT $2 OFFSET $3",
    )
    .bind(p.status())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct RejectBody {
    reason: String,
}

async fn reject_conversion(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(b): Json<RejectBody>,
) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    earnings::reject(&state, id, None, &b.reason).await?;
    auth::audit(&state, Some(user.id), "admin.conversion.reject", Some(id.to_string()), json!({ "reason": b.reason.trim() }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct CreditBody {
    user_id: Uuid,
    amount_cents: i64,
    /// The bank or provider reference; the same reference can never be credited twice.
    reference: String,
}

/// Credits escrow for a payment received outside the checkout (e.g. a bank transfer), after staff
/// have confirmed the money arrived.
async fn credit_escrow(State(state): State<AppState>, headers: HeaderMap, user: CurrentUser, Json(b): Json<CreditBody>) -> AppResult<Json<Value>> {
    user.require_admin()?;
    limit(&state, &headers, "admin_write", 120, 3600)?;
    if b.amount_cents > 10_000_000 {
        return Err(AppError::BadRequest("credits above $100,000 must be split or done by engineering".into()));
    }
    let reference = format!("manual:{}", b.reference.trim());
    let status = internal::credit_escrow(&state, b.user_id, b.amount_cents, &reference).await?;
    auth::audit(&state, Some(user.id), "admin.escrow.credit", Some(b.user_id.to_string()),
        json!({ "amount_cents": b.amount_cents, "reference": b.reference.trim(), "result": status }), &headers).await;
    Ok(Json(json!({ "status": status })))
}

async fn audit_log(State(state): State<AppState>, user: CurrentUser, Query(p): Query<Page>) -> AppResult<Json<Value>> {
    user.require_admin()?;
    let rows: Vec<(i64, Option<Uuid>, Option<String>, String, Option<String>, Value, DateTime<Utc>)> = sqlx::query_as(
        "SELECT a.id, a.actor_id, u.email::text, a.action, a.target, a.meta, a.created_at
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         WHERE ($1::text IS NULL OR a.action ILIKE $1 || '%' OR u.email::text ILIKE '%' || $1 || '%' OR a.target = $1)
         ORDER BY a.id DESC LIMIT $2 OFFSET $3",
    )
    .bind(p.q())
    .bind(p.limit())
    .bind(p.offset())
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!(rows
        .into_iter()
        .map(|(id, actor, email, action, target, meta, at)| json!({ "id": id, "actor_id": actor, "actor_email": email, "action": action, "target": target, "meta": meta, "created_at": at }))
        .collect::<Vec<_>>())))
}
