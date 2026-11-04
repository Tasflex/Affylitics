use axum::{
    extract::{Path, Query, State},
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
    ledger, AppState,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct PublicOffer {
    id: Uuid,
    slug: String,
    title: String,
    description: String,
    category: String,
    brand: String,
    brand_verified: bool,
    model: String,
    payout_cents: Option<i64>,
    payout_bps: Option<i32>,
    cookie_days: i32,
    hold_days: i32,
    allowed_countries: Option<Vec<String>>,
    /// Whether the advertiser's escrow currently covers at least one more conversion.
    funded: bool,
    created_at: DateTime<Utc>,
}

const PUBLIC_OFFER_SELECT: &str = "
    SELECT o.id, o.slug, o.title, o.description, o.category, b.name AS brand, b.verified AS brand_verified,
           o.model::text AS model, o.payout_cents, o.payout_bps, o.cookie_days, o.hold_days,
           o.allowed_countries::text[] AS allowed_countries,
           COALESCE((SELECT SUM(e.amount_cents) FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
                     WHERE a.owner_id = b.owner_id AND a.kind = 'advertiser_escrow'), 0) > 0 AS funded,
           o.created_at
    FROM offers o JOIN brands b ON b.id = o.brand_id";

#[derive(Deserialize)]
pub struct OfferQuery {
    category: Option<String>,
    country: Option<String>,
    q: Option<String>,
}

pub async fn list_public(State(state): State<AppState>, Query(q): Query<OfferQuery>) -> AppResult<Json<Vec<PublicOffer>>> {
    let sql = format!(
        "{PUBLIC_OFFER_SELECT}
         WHERE o.status = 'active'
           AND ($1::text IS NULL OR o.category = $1)
           AND ($2::text IS NULL OR o.allowed_countries IS NULL OR $2::char(2) = ANY(o.allowed_countries))
           AND ($3::text IS NULL OR o.title ILIKE '%' || $3 || '%' OR o.description ILIKE '%' || $3 || '%')
         ORDER BY funded DESC, o.created_at DESC LIMIT 200"
    );
    let offers = sqlx::query_as::<_, PublicOffer>(&sql)
        .bind(q.category.filter(|c| !c.is_empty()))
        .bind(q.country.map(|c| c.to_uppercase()).filter(|c| valid_country(c)))
        .bind(q.q.map(|s| s.trim().chars().take(60).collect::<String>()).filter(|s| !s.is_empty()))
        .fetch_all(&state.db)
        .await?;
    Ok(Json(offers))
}

pub async fn get_public(State(state): State<AppState>, Path(slug): Path<String>) -> AppResult<Json<PublicOffer>> {
    let sql = format!("{PUBLIC_OFFER_SELECT} WHERE o.slug = $1 AND o.status = 'active'");
    sqlx::query_as::<_, PublicOffer>(&sql)
        .bind(slug)
        .fetch_optional(&state.db)
        .await?
        .map(Json)
        .ok_or(AppError::NotFound)
}

// ── Advertiser ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BrandBody {
    name: String,
    website: String,
}

pub async fn create_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<BrandBody>,
) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    limit(&state, &headers, "brand", 10, 3600)?;
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::BadRequest("brand name must be 1 to 120 characters".into()));
    }
    let website = url::Url::parse(body.website.trim())
        .ok()
        .filter(|u| u.scheme() == "https" && u.host_str().is_some())
        .ok_or_else(|| AppError::BadRequest("website must be an https:// address".into()))?;

    let secret = crypto::random_bytes(32);
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO brands (owner_id, name, website, postback_secret) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(user.id)
    .bind(name)
    .bind(website.as_str())
    .bind(&secret)
    .fetch_one(&state.db)
    .await?;
    auth::audit(&state, Some(user.id), "brand.create", Some(id.to_string()), json!({ "name": name }), &headers).await;
    // The secret is shown once; we never return it again.
    Ok(Json(json!({ "id": id, "postback_secret": hex::encode(secret) })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct BrandRow {
    id: Uuid,
    name: String,
    website: String,
    verified: bool,
}

pub async fn list_brands(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<BrandRow>>> {
    user.require_role("advertiser")?;
    let rows = sqlx::query_as::<_, BrandRow>(
        "SELECT id, name, website, verified FROM brands WHERE owner_id = $1 ORDER BY created_at",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct OfferBody {
    brand_id: Uuid,
    title: String,
    description: String,
    category: String,
    landing_url: String,
    model: String,
    payout_cents: Option<i64>,
    payout_bps: Option<i32>,
    cookie_days: Option<i32>,
    hold_days: Option<i32>,
    allowed_countries: Option<Vec<String>>,
}

fn slugify(title: &str) -> String {
    let mut s = String::new();
    for ch in title.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            s.push(ch);
        } else if !s.ends_with('-') && !s.is_empty() {
            s.push('-');
        }
    }
    let base: String = s.trim_end_matches('-').chars().take(60).collect();
    let base = base.trim_end_matches('-');
    let suffix = &crypto::random_token(3);
    if base.is_empty() { format!("offer-{suffix}") } else { format!("{base}-{suffix}") }
}

pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(b): Json<OfferBody>,
) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    limit(&state, &headers, "offer", 30, 3600)?;

    let owns: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM brands WHERE id = $1 AND owner_id = $2)")
        .bind(b.brand_id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    if !owns {
        return Err(AppError::NotFound);
    }
    let landing = url::Url::parse(b.landing_url.trim())
        .ok()
        .filter(|u| u.scheme() == "https")
        .ok_or_else(|| AppError::BadRequest("landing URL must start with https://".into()))?;
    let (payout_cents, payout_bps) = match b.model.as_str() {
        "cps" => (None, Some(b.payout_bps.filter(|v| (1..=9000).contains(v)).ok_or_else(|| {
            AppError::BadRequest("revenue share must be between 0.01% and 90%".into())
        })?)),
        "cpa" | "cpl" => (Some(b.payout_cents.filter(|v| *v >= 1 && *v <= 1_000_000).ok_or_else(|| {
            AppError::BadRequest("payout must be between $0.01 and $10,000".into())
        })?), None),
        _ => return Err(AppError::BadRequest("model must be cpa, cps or cpl".into())),
    };
    let countries = match b.allowed_countries {
        Some(list) if !list.is_empty() => {
            let list: Vec<String> = list.into_iter().map(|c| c.trim().to_uppercase()).collect();
            if !list.iter().all(|c| valid_country(c)) {
                return Err(AppError::BadRequest("countries must be 2-letter codes".into()));
            }
            Some(list)
        }
        _ => None,
    };
    let title = b.title.trim();
    if title.chars().count() < 3 || title.chars().count() > 140 {
        return Err(AppError::BadRequest("title must be 3 to 140 characters".into()));
    }

    let slug = slugify(title);
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO offers (brand_id, slug, title, description, category, landing_url, model, payout_cents, payout_bps,
                             cookie_days, hold_days, allowed_countries)
         VALUES ($1, $2, $3, $4, $5, $6, $7::payout_model, $8, $9, $10, $11, $12::char(2)[]) RETURNING id",
    )
    .bind(b.brand_id)
    .bind(&slug)
    .bind(title)
    .bind(b.description.trim().chars().take(5000).collect::<String>())
    .bind(b.category.trim().to_lowercase().chars().take(40).collect::<String>())
    .bind(landing.as_str())
    .bind(&b.model)
    .bind(payout_cents)
    .bind(payout_bps)
    .bind(b.cookie_days.unwrap_or(30).clamp(1, 120))
    .bind(b.hold_days.unwrap_or(30).clamp(0, 120))
    .bind(countries)
    .fetch_one(&state.db)
    .await?;
    auth::audit(&state, Some(user.id), "offer.create", Some(id.to_string()), json!({ "slug": slug }), &headers).await;
    Ok(Json(json!({ "id": id, "slug": slug, "status": "draft" })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MyOffer {
    id: Uuid,
    slug: String,
    title: String,
    status: String,
    model: String,
    payout_cents: Option<i64>,
    payout_bps: Option<i32>,
    clicks: i64,
    conversions: i64,
}

pub async fn list_mine(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    let offers = sqlx::query_as::<_, MyOffer>(
        "SELECT o.id, o.slug, o.title, o.status::text AS status, o.model::text AS model, o.payout_cents, o.payout_bps,
                (SELECT COUNT(*) FROM clicks c JOIN links l ON l.id = c.link_id WHERE l.offer_id = o.id) AS clicks,
                (SELECT COUNT(*) FROM conversions v WHERE v.offer_id = o.id) AS conversions
         FROM offers o JOIN brands b ON b.id = o.brand_id
         WHERE b.owner_id = $1 ORDER BY o.created_at DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let balances = ledger::balances(&state.db, user.id).await?;
    Ok(Json(json!({ "offers": offers, "escrow_cents": balances.escrow_cents })))
}

#[derive(Deserialize)]
pub struct StatusBody {
    status: String,
}

pub async fn set_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Path(id): Path<Uuid>,
    Json(body): Json<StatusBody>,
) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    if !["active", "paused", "archived"].contains(&body.status.as_str()) {
        return Err(AppError::BadRequest("status must be active, paused or archived".into()));
    }
    if body.status == "active" {
        // Funded offers only: escrow must cover at least one conversion at the flat rate.
        let balances = ledger::balances(&state.db, user.id).await?;
        let need: Option<i64> = sqlx::query_scalar("SELECT payout_cents FROM offers WHERE id = $1").bind(id).fetch_optional(&state.db).await?.flatten();
        if balances.escrow_cents <= 0 || need.is_some_and(|n| balances.escrow_cents < n) {
            return Err(AppError::Conflict("fund your escrow before going live, so publishers are guaranteed payment".into()));
        }
    }
    let updated = sqlx::query(
        "UPDATE offers o SET status = $1::offer_status FROM brands b
         WHERE o.id = $2 AND o.brand_id = b.id AND b.owner_id = $3",
    )
    .bind(&body.status)
    .bind(id)
    .bind(user.id)
    .execute(&state.db)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "offer.status", Some(id.to_string()), json!({ "status": body.status }), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct FundBody {
    amount_cents: i64,
}

/// Starts a hosted checkout to top up escrow. The intel service picks the payment provider for
/// the advertiser's country and credits escrow when the provider's webhook confirms payment.
pub async fn fund_escrow(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<FundBody>,
) -> AppResult<Json<Value>> {
    user.require_role("advertiser")?;
    limit(&state, &headers, "fund", 10, 3600)?;
    if !(1_000..=1_000_000).contains(&body.amount_cents) {
        return Err(AppError::BadRequest("fund between $10 and $10,000 per payment".into()));
    }
    let res = state
        .http
        .post(format!("{}/funding/start", state.cfg.intel_url))
        .bearer_auth(&state.cfg.internal_token)
        .json(&json!({
            "user_id": user.id,
            "email": user.email,
            "name": user.display_name,
            "country": user.country,
            "amount_cents": body.amount_cents,
            "return_url": format!("{}/dashboard/advertiser?funded=1", state.cfg.public_origin),
        }))
        .send()
        .await
        .map_err(anyhow::Error::from)?;
    if !res.status().is_success() {
        return Err(AppError::Internal(anyhow::anyhow!("intel /funding/start returned {}", res.status())));
    }
    let out: Value = res.json().await.map_err(anyhow::Error::from)?;
    auth::audit(&state, Some(user.id), "escrow.fund_start", None, json!({ "amount_cents": body.amount_cents }), &headers).await;
    Ok(Json(out))
}

#[cfg(test)]
mod tests {
    #[test]
    fn slugs_are_url_safe() {
        let s = super::slugify("Solar Kits — 20% off!");
        assert!(s.starts_with("solar-kits-20-off-"), "{s}");
        assert!(s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'));
        assert!(super::slugify("***").starts_with("offer-"));
    }
}
