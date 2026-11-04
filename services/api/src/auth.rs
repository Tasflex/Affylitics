use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::{
    crypto,
    error::{AppError, AppResult},
    AppState,
};

pub const SESSION_COOKIE: &str = "aff_session";
const SESSION_DAYS: i64 = 30;

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub display_name: String,
    pub country: String,
    pub kyc_tier: i16,
    pub email_verified: bool,
    pub is_admin: bool,
}

impl CurrentUser {
    /// Payouts and verification depend on the country, which new Google users set during onboarding.
    pub fn require_country(&self) -> AppResult<()> {
        if self.country.is_empty() {
            Err(AppError::Forbidden("finish setting up your account first".into()))
        } else {
            Ok(())
        }
    }

    pub fn require_admin(&self) -> AppResult<()> {
        if self.is_admin {
            Ok(())
        } else {
            // Look like a missing route rather than advertising that an admin area exists.
            Err(AppError::NotFound)
        }
    }

    pub fn require_role(&self, role: &str) -> AppResult<()> {
        self.require_country()?;
        if self.role == role || self.role == "admin" {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!("this needs a {role} account")))
        }
    }
}

#[async_trait]
impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let token = jar.get(SESSION_COOKIE).ok_or(AppError::Unauthorized)?.value().to_string();
        let row: Option<(Uuid, String, String, String, String, i16, bool, bool)> = sqlx::query_as(
            // role and country are empty until a Google user finishes onboarding.
            "SELECT u.id, u.email::text, COALESCE(u.role::text, ''), u.display_name, COALESCE(u.country, ''), u.kyc_tier, u.email_verified, u.is_admin
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'",
        )
        .bind(crypto::sha256(token.as_bytes()))
        .fetch_optional(&state.db)
        .await?;
        let (id, email, role, display_name, country, kyc_tier, email_verified, is_admin) =
            row.ok_or(AppError::Unauthorized)?;
        Ok(CurrentUser { id, email, role, display_name, country: country.trim().to_string(), kyc_tier, email_verified, is_admin })
    }
}

/// Creates a session and returns the cookie to set.
pub async fn start_session(
    state: &AppState,
    user_id: Uuid,
    headers: &HeaderMap,
) -> AppResult<Cookie<'static>> {
    let token = crypto::random_token(32);
    sqlx::query(
        "INSERT INTO sessions (token_hash, user_id, expires_at, ip_hash, user_agent) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(crypto::sha256(token.as_bytes()))
    .bind(user_id)
    .bind(Utc::now() + Duration::days(SESSION_DAYS))
    .bind(crypto::salted_hash(&state.cfg.hash_salt, &client_ip(headers)))
    .bind(headers.get("user-agent").and_then(|v| v.to_str().ok()).map(|s| s.chars().take(300).collect::<String>()))
    .execute(&state.db)
    .await?;
    Ok(session_cookie(state, token, SESSION_DAYS))
}

pub fn session_cookie(state: &AppState, value: String, days: i64) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, value))
        .path("/")
        .http_only(true)
        .secure(state.cfg.cookie_secure)
        .same_site(SameSite::Lax)
        .max_age(time_days(days))
        .build()
}

fn time_days(days: i64) -> time::Duration {
    time::Duration::days(days)
}

/// The client's IP. nginx sets X-Real-IP (from Cloudflare's CF-Connecting-IP); the API only
/// listens on localhost so the header cannot be forged from outside.
pub fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

pub async fn audit(state: &AppState, actor: Option<Uuid>, action: &str, target: Option<String>, meta: serde_json::Value, headers: &HeaderMap) {
    let res = sqlx::query("INSERT INTO audit_log (actor_id, action, target, meta, ip_hash) VALUES ($1, $2, $3, $4, $5)")
        .bind(actor)
        .bind(action)
        .bind(target)
        .bind(meta)
        .bind(crypto::salted_hash(&state.cfg.hash_salt, &client_ip(headers)))
        .execute(&state.db)
        .await;
    if let Err(e) = res {
        tracing::error!(error = ?e, action, "audit write failed");
    }
}

pub fn clear_cookie(jar: CookieJar) -> CookieJar {
    jar.remove(Cookie::build(SESSION_COOKIE).path("/").build())
}
