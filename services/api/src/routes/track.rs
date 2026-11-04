use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::limit;
use crate::{
    auth::{client_ip, CurrentUser},
    crypto, email,
    error::{AppError, AppResult},
    ledger, AppState,
};

// ── Links ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct LinkBody {
    offer_slug: String,
    sub_id: Option<String>,
}

pub async fn create_link(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<LinkBody>,
) -> AppResult<Json<Value>> {
    user.require_role("publisher")?;
    limit(&state, &headers, "link", 60, 3600)?;
    let sub_id = body.sub_id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if sub_id.as_ref().is_some_and(|s| s.len() > 64 || !s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))) {
        return Err(AppError::BadRequest("sub ID may use letters, numbers, - _ . (max 64)".into()));
    }

    // allowed_countries limits where buyers are, not who may promote: publishers anywhere can join.
    let offer_id: Uuid = sqlx::query_scalar("SELECT id FROM offers WHERE slug = $1 AND status = 'active'")
        .bind(&body.offer_slug)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    // Reuse an existing link for the same offer and sub ID.
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT code FROM links WHERE publisher_id = $1 AND offer_id = $2 AND sub_id IS NOT DISTINCT FROM $3",
    )
    .bind(user.id)
    .bind(offer_id)
    .bind(&sub_id)
    .fetch_optional(&state.db)
    .await?;
    let code = match existing {
        Some(code) => code,
        None => {
            let code = crypto::random_token(5); // 10 hex chars
            sqlx::query("INSERT INTO links (code, publisher_id, offer_id, sub_id) VALUES ($1, $2, $3, $4)")
                .bind(&code)
                .bind(user.id)
                .bind(offer_id)
                .bind(&sub_id)
                .execute(&state.db)
                .await?;
            code
        }
    };
    Ok(Json(json!({ "code": code, "url": format!("{}/go/{}", state.cfg.public_origin, code) })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct LinkRow {
    code: String,
    sub_id: Option<String>,
    offer_slug: String,
    offer_title: String,
    clicks: i64,
    conversions: i64,
    earned_cents: i64,
    created_at: DateTime<Utc>,
}

pub async fn list_links(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<LinkRow>>> {
    user.require_role("publisher")?;
    let rows = sqlx::query_as::<_, LinkRow>(
        "SELECT l.code, l.sub_id, o.slug AS offer_slug, o.title AS offer_title,
                (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id) AS clicks,
                (SELECT COUNT(*) FROM conversions v JOIN clicks c ON c.id = v.click_id
                  WHERE c.link_id = l.id AND v.status <> 'rejected') AS conversions,
                COALESCE((SELECT SUM(v.commission_cents) FROM conversions v JOIN clicks c ON c.id = v.click_id
                  WHERE c.link_id = l.id AND v.status <> 'rejected'), 0)::bigint AS earned_cents,
                l.created_at
         FROM links l JOIN offers o ON o.id = l.offer_id
         WHERE l.publisher_id = $1 ORDER BY l.created_at DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

// ── Click redirect ─────────────────────────────────────────────────────────

pub async fn redirect(State(state): State<AppState>, headers: HeaderMap, Path(code): Path<String>) -> Response {
    match record_click(&state, &headers, &code).await {
        Ok(Some(location)) => (
            StatusCode::FOUND,
            [(header::LOCATION, location), (header::CACHE_CONTROL, "no-store".to_string())],
        )
            .into_response(),
        Ok(None) => (
            StatusCode::FOUND,
            [(header::LOCATION, format!("{}/offers?link=expired", state.cfg.public_origin))],
        )
            .into_response(),
        Err(e) => e.into_response(),
    }
}

async fn record_click(state: &AppState, headers: &HeaderMap, code: &str) -> AppResult<Option<String>> {
    if code.len() > 32 || !code.chars().all(|c| c.is_ascii_hexdigit()) {
        return Ok(None);
    }
    let row: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT l.id, o.landing_url FROM links l JOIN offers o ON o.id = l.offer_id
         WHERE l.code = $1 AND o.status = 'active'",
    )
    .bind(code)
    .fetch_optional(&state.db)
    .await?;
    let Some((link_id, landing)) = row else { return Ok(None) };
    let mut url = url::Url::parse(&landing).map_err(|e| AppError::Internal(e.into()))?;

    // Bots and refresh-spam still get redirected, but stop being counted after 30 clicks a minute.
    let ip = client_ip(headers);
    let counted = state.limiter.check("click", &ip, 30, std::time::Duration::from_secs(60));
    if counted {
        let ua = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
        let country = headers
            .get("cf-ipcountry")
            .and_then(|v| v.to_str().ok())
            .filter(|c| c.len() == 2 && *c != "XX" && *c != "T1");
        let referer_host = headers
            .get(header::REFERER)
            .and_then(|v| v.to_str().ok())
            .and_then(|r| url::Url::parse(r).ok())
            .and_then(|u| u.host_str().map(str::to_string));
        let click_id: Uuid = sqlx::query_scalar(
            "INSERT INTO clicks (link_id, ip_hash, ua_hash, country, referer_host) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        )
        .bind(link_id)
        .bind(crypto::salted_hash(&state.cfg.hash_salt, &ip))
        .bind(crypto::salted_hash(&state.cfg.hash_salt, ua))
        .bind(country)
        .bind(referer_host)
        .fetch_one(&state.db)
        .await?;
        url.query_pairs_mut().append_pair("aff_click", &click_id.to_string());
    }
    Ok(Some(url.to_string()))
}

// ── Advertiser postback (server to server) ─────────────────────────────────

#[derive(Deserialize)]
struct PostbackBody {
    click_id: Uuid,
    external_ref: String,
    sale_cents: Option<i64>,
}

/// Records a conversion. The advertiser signs `"{timestamp}.{raw body}"` with HMAC-SHA256 using
/// their brand's postback secret, and sends X-NetAffil-Brand, X-NetAffil-Timestamp and
/// X-NetAffil-Signature (hex).
pub async fn postback(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> AppResult<Json<Value>> {
    limit(&state, &headers, "postback", 600, 60)?;
    let h = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let brand_id: Uuid = h("x-netaffil-brand")
        .and_then(|v| v.parse().ok())
        .ok_or(AppError::Unauthorized)?;
    let ts: i64 = h("x-netaffil-timestamp").and_then(|v| v.parse().ok()).ok_or(AppError::Unauthorized)?;
    let sig = h("x-netaffil-signature").and_then(|v| hex::decode(v).ok()).ok_or(AppError::Unauthorized)?;
    if (Utc::now().timestamp() - ts).abs() > 300 {
        return Err(AppError::BadRequest("timestamp outside the 5-minute window".into()));
    }

    let brand: Option<(Vec<u8>, Uuid)> = sqlx::query_as("SELECT postback_secret, owner_id FROM brands WHERE id = $1")
        .bind(brand_id)
        .fetch_optional(&state.db)
        .await?;
    let (secret, advertiser_id) = brand.ok_or(AppError::Unauthorized)?;
    // The key is the secret as shown to the advertiser (hex text), so standard tools like
    // `openssl dgst -hmac "$SECRET"` produce the same signature.
    let expected = crypto::hmac_sha256(hex::encode(&secret).as_bytes(), &[ts.to_string().as_bytes(), b".", &body].concat());
    if !crypto::constant_time_eq(&expected, &sig) {
        return Err(AppError::Unauthorized);
    }

    let pb: PostbackBody = serde_json::from_slice(&body).map_err(|e| AppError::BadRequest(format!("invalid body: {e}")))?;
    let external_ref = pb.external_ref.trim();
    if external_ref.is_empty() || external_ref.len() > 128 {
        return Err(AppError::BadRequest("external_ref must be 1 to 128 characters".into()));
    }

    #[derive(sqlx::FromRow)]
    struct ClickOffer {
        offer_id: Uuid,
        publisher_id: Uuid,
        model: String,
        payout_cents: Option<i64>,
        payout_bps: Option<i32>,
        platform_fee_bps: i32,
        hold_days: i32,
        cookie_days: i32,
        click_at: DateTime<Utc>,
    }
    let co = sqlx::query_as::<_, ClickOffer>(
        "SELECT o.id AS offer_id, l.publisher_id, o.model::text AS model, o.payout_cents, o.payout_bps,
                o.platform_fee_bps, o.hold_days, o.cookie_days, c.created_at AS click_at
         FROM clicks c JOIN links l ON l.id = c.link_id JOIN offers o ON o.id = l.offer_id
         WHERE c.id = $1 AND o.brand_id = $2",
    )
    .bind(pb.click_id)
    .bind(brand_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("unknown click_id for this brand".into()))?;

    if Utc::now() - co.click_at > Duration::days(co.cookie_days as i64) {
        return Err(AppError::BadRequest("click is outside the offer's attribution window".into()));
    }
    let commission = match co.model.as_str() {
        "cps" => {
            let sale = pb.sale_cents.filter(|s| *s > 0).ok_or_else(|| AppError::BadRequest("sale_cents is required for revenue-share offers".into()))?;
            sale * co.payout_bps.unwrap_or(0) as i64 / 10_000
        }
        _ => co.payout_cents.unwrap_or(0),
    };
    if commission < 1 {
        return Err(AppError::BadRequest("commission rounds to zero".into()));
    }
    let (commission, fee) = ledger::split(commission, co.platform_fee_bps);

    let mut tx = state.db.begin().await?;
    let conv_id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO conversions (click_id, offer_id, publisher_id, external_ref, sale_cents, commission_cents, fee_cents, matures_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (offer_id, external_ref) DO NOTHING RETURNING id",
    )
    .bind(pb.click_id)
    .bind(co.offer_id)
    .bind(co.publisher_id)
    .bind(external_ref)
    .bind(pb.sale_cents)
    .bind(commission)
    .bind(fee)
    .bind(Utc::now() + Duration::days(co.hold_days as i64))
    .fetch_optional(&mut *tx)
    .await?;
    let Some(conv_id) = conv_id else {
        return Ok(Json(json!({ "status": "duplicate" })));
    };

    let escrow = ledger::account(&mut tx, Some(advertiser_id), ledger::ESCROW).await?;
    let pending = ledger::account(&mut tx, Some(co.publisher_id), ledger::PENDING).await?;
    let revenue = ledger::account(&mut tx, None, ledger::REVENUE).await?;
    ledger::post(
        &mut tx,
        "conversion",
        Some(conv_id),
        None,
        &[(escrow, -(commission + fee)), (pending, commission), (revenue, fee)],
    )
    .await?;

    match tx.commit().await {
        Ok(()) => {
            notify_commission(&state, co.publisher_id, co.offer_id, commission, co.hold_days).await;
            Ok(Json(json!({ "status": "recorded", "conversion_id": conv_id, "commission_cents": commission })))
        }
        Err(e) => {
            let err = AppError::from(e);
            if matches!(err, AppError::Conflict(_)) {
                // Escrow ran dry: pause the advertiser's offers so no publisher sends unpaid traffic.
                let paused = sqlx::query("UPDATE offers o SET status = 'paused' FROM brands b WHERE o.brand_id = b.id AND b.owner_id = $1 AND o.status = 'active'")
                    .bind(advertiser_id)
                    .execute(&state.db)
                    .await?;
                // Email only when something was actually paused, not on every rejected postback.
                if paused.rows_affected() > 0 {
                    if let Some((to, name)) = contact(&state, advertiser_id).await {
                        email::send_later(&state, email::campaigns_paused(&to, &name, &state.cfg.public_origin));
                    }
                }
                return Err(AppError::Conflict("escrow balance too low; offers paused until funded".into()));
            }
            Err(err)
        }
    }
}

pub fn usd(cents: i64) -> String {
    format!("${}.{:02}", cents / 100, cents % 100)
}

/// A user's email and display name, for notifications. Errors are logged, never surfaced.
pub async fn contact(state: &AppState, user_id: Uuid) -> Option<(String, String)> {
    sqlx::query_as("SELECT email::text, display_name FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| tracing::error!(error = ?e, "contact lookup failed"))
        .ok()
        .flatten()
}

async fn notify_commission(state: &AppState, publisher_id: Uuid, offer_id: Uuid, commission: i64, hold_days: i32) {
    let Some((to, name)) = contact(state, publisher_id).await else { return };
    let offer: String = sqlx::query_scalar("SELECT title FROM offers WHERE id = $1")
        .bind(offer_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or_else(|_| "an offer".into());
    let available_on = (Utc::now() + Duration::days(hold_days as i64)).format("%-d %B %Y").to_string();
    email::send_later(state, email::commission_earned(&to, &name, &usd(commission), &offer, &available_on, &state.cfg.public_origin));
}
