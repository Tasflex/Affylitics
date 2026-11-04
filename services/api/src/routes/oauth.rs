//! Sign in with Google (OAuth 2.0 authorization code flow with PKCE).
//!
//! `/api/auth/google/start` stores a one-time state and PKCE verifier in a short-lived cookie
//! and sends the browser to Google. `/api/auth/google/callback` checks the state, exchanges the
//! code server-to-server, reads the verified identity from Google's userinfo endpoint over TLS,
//! then signs the user in, linking or creating the account.

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::limit;
use crate::{auth, crypto, error::AppError, AppState};

const STATE_COOKIE: &str = "aff_oauth";
const GOOGLE_AUTH: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO: &str = "https://openidconnect.googleapis.com/v1/userinfo";

fn redirect(to: &str) -> Response {
    (StatusCode::FOUND, [(header::LOCATION, to.to_string()), (header::CACHE_CONTROL, "no-store".to_string())]).into_response()
}

fn redirect_uri(state: &AppState) -> String {
    format!("{}/api/auth/google/callback", state.cfg.public_origin)
}

/// Only same-site relative paths, never `//host` or a full URL.
fn safe_next(next: Option<&str>) -> String {
    match next {
        Some(n) if n.starts_with('/') && !n.starts_with("//") && !n.contains('\\') && n.len() <= 200 => n.to_string(),
        _ => "/dashboard".to_string(),
    }
}

#[derive(Deserialize)]
pub struct StartQuery {
    role: Option<String>,
    next: Option<String>,
}

pub async fn start(State(state): State<AppState>, headers: HeaderMap, jar: CookieJar, Query(q): Query<StartQuery>) -> Response {
    let Some(google) = &state.cfg.google else {
        return redirect("/login?error=google_unavailable");
    };
    if limit(&state, &headers, "oauth", 30, 600).is_err() {
        return redirect("/login?error=too_many");
    }
    let csrf = crypto::random_token(16);
    let verifier = URL_SAFE_NO_PAD.encode(crypto::random_bytes(32));
    let challenge = URL_SAFE_NO_PAD.encode(crypto::sha256(verifier.as_bytes()));
    let role = match q.role.as_deref() {
        Some("advertiser") => "advertiser",
        Some("publisher") => "publisher",
        _ => "",
    };
    // state|verifier|role|next — the browser holds it, but only our domain can set it, and the
    // state value must also come back from Google unchanged.
    let payload = format!("{csrf}|{verifier}|{role}|{}", safe_next(q.next.as_deref()));
    let cookie = Cookie::build((STATE_COOKIE, URL_SAFE_NO_PAD.encode(payload)))
        .path("/api/auth/google")
        .http_only(true)
        .secure(state.cfg.cookie_secure)
        // Lax: the cookie must come back on Google's top-level redirect to our callback.
        .same_site(SameSite::Lax)
        .max_age(time::Duration::minutes(10))
        .build();

    let mut url = url::Url::parse(GOOGLE_AUTH).expect("static url");
    url.query_pairs_mut()
        .append_pair("client_id", &google.client_id)
        .append_pair("redirect_uri", &redirect_uri(&state))
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &csrf)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");
    (jar.add(cookie), redirect(url.as_str())).into_response()
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GoogleUser {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
}

pub async fn callback(State(state): State<AppState>, headers: HeaderMap, jar: CookieJar, Query(q): Query<CallbackQuery>) -> Response {
    let cleared = jar.clone().remove(Cookie::build(STATE_COOKIE).path("/api/auth/google").build());
    match finish(&state, &headers, &jar, q).await {
        Ok((session, to)) => (cleared.add(session), redirect(&to)).into_response(),
        Err(reason) => {
            tracing::warn!(reason, "google sign-in failed");
            (cleared, redirect(&format!("/login?error={reason}"))).into_response()
        }
    }
}

/// Returns the session cookie and where to send the user, or a short error code for the login page.
async fn finish(state: &AppState, headers: &HeaderMap, jar: &CookieJar, q: CallbackQuery) -> Result<(Cookie<'static>, String), &'static str> {
    let google = state.cfg.google.as_ref().ok_or("google_unavailable")?;
    if q.error.is_some() {
        return Err("google_cancelled");
    }
    let raw = jar.get(STATE_COOKIE).map(|c| c.value().to_string()).ok_or("google_expired")?;
    let decoded = URL_SAFE_NO_PAD.decode(raw).ok().and_then(|b| String::from_utf8(b).ok()).ok_or("google_failed")?;
    let mut parts = decoded.splitn(4, '|');
    let (csrf, verifier, role, next) = (
        parts.next().unwrap_or(""),
        parts.next().unwrap_or(""),
        parts.next().unwrap_or(""),
        parts.next().unwrap_or("/dashboard"),
    );
    let returned = q.state.as_deref().unwrap_or("");
    if csrf.is_empty() || !crypto::constant_time_eq(csrf.as_bytes(), returned.as_bytes()) {
        return Err("google_failed");
    }
    let code = q.code.ok_or("google_failed")?;

    let token: TokenResponse = state
        .http
        .post(GOOGLE_TOKEN)
        .form(&[
            ("code", code.as_str()),
            ("client_id", google.client_id.as_str()),
            ("client_secret", google.client_secret.as_str()),
            ("redirect_uri", redirect_uri(state).as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|_| "google_failed")?
        .error_for_status()
        .map_err(|_| "google_failed")?
        .json()
        .await
        .map_err(|_| "google_failed")?;
    let user: GoogleUser = state
        .http
        .get(GOOGLE_USERINFO)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|_| "google_failed")?
        .error_for_status()
        .map_err(|_| "google_failed")?
        .json()
        .await
        .map_err(|_| "google_failed")?;

    let email = user.email.map(|e| e.trim().to_lowercase()).filter(|e| !e.is_empty()).ok_or("google_no_email")?;
    if user.email_verified != Some(true) {
        return Err("google_unverified");
    }
    let (user_id, onboarded) = find_or_create(state, &user.sub, &email, user.name.as_deref(), role).await.map_err(|e| {
        tracing::error!(error = ?e, "google account linking failed");
        "google_failed"
    })?;
    let user_id = user_id.ok_or("account_inactive")?;

    auth::audit(state, Some(user_id), "login.google", None, json!({}), headers).await;
    let session = auth::start_session(state, user_id, headers).await.map_err(|_| "google_failed")?;
    let to = if onboarded { next.to_string() } else { "/onboarding".to_string() };
    Ok((session, to))
}

/// Returns (user id, onboarded). The id is None when the matching account is suspended or closed.
async fn find_or_create(state: &AppState, sub: &str, email: &str, name: Option<&str>, role: &str) -> Result<(Option<Uuid>, bool), AppError> {
    let mut tx = state.db.begin().await?;

    // 1. Already linked to this Google account.
    let linked: Option<(Uuid, String, bool)> = sqlx::query_as(
        "SELECT u.id, u.status::text, u.onboarded_at IS NOT NULL FROM user_identities i JOIN users u ON u.id = i.user_id
         WHERE i.provider = 'google' AND i.subject = $1",
    )
    .bind(sub)
    .fetch_optional(&mut *tx)
    .await?;

    let (id, status, onboarded) = match linked {
        Some(found) => found,
        None => {
            // 2. An existing account with the same (Google-verified) email: link it.
            let existing: Option<(Uuid, String, bool)> = sqlx::query_as(
                "SELECT id, status::text, onboarded_at IS NOT NULL FROM users WHERE email = $1",
            )
            .bind(email)
            .fetch_optional(&mut *tx)
            .await?;
            let found = match existing {
                Some(found) => {
                    sqlx::query("UPDATE users SET email_verified = true WHERE id = $1").bind(found.0).execute(&mut *tx).await?;
                    found
                }
                // 3. A brand-new account; role and country are chosen during onboarding.
                None => {
                    let display: String = name.map(str::trim).filter(|n| !n.is_empty()).unwrap_or("New member").chars().take(80).collect();
                    let id: Uuid = sqlx::query_scalar(
                        "INSERT INTO users (email, email_verified, password_hash, role, display_name, country)
                         VALUES ($1, true, NULL, NULLIF($2, '')::user_role, $3, NULL) RETURNING id",
                    )
                    .bind(email)
                    .bind(role)
                    .bind(&display)
                    .fetch_one(&mut *tx)
                    .await?;
                    (id, "active".to_string(), false)
                }
            };
            sqlx::query("INSERT INTO user_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)")
                .bind(sub)
                .bind(found.0)
                .bind(email)
                .execute(&mut *tx)
                .await?;
            found
        }
    };
    tx.commit().await?;
    Ok(((status == "active").then_some(id), onboarded))
}

#[cfg(test)]
mod tests {
    #[test]
    fn next_is_always_local() {
        assert_eq!(super::safe_next(Some("/offers/x")), "/offers/x");
        assert_eq!(super::safe_next(Some("//evil.com")), "/dashboard");
        assert_eq!(super::safe_next(Some("https://evil.com")), "/dashboard");
        assert_eq!(super::safe_next(Some("/\\evil.com")), "/dashboard");
        assert_eq!(super::safe_next(None), "/dashboard");
    }
}
