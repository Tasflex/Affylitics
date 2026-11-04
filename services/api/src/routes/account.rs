use axum::{extract::State, http::HeaderMap, Json};
use axum_extra::extract::CookieJar;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::{limit, valid_country};
use crate::{
    auth::{self, CurrentUser, SESSION_COOKIE},
    crypto, email,
    error::{AppError, AppResult},
    ledger, AppState,
};

fn valid_password(p: &str) -> AppResult<()> {
    if p.chars().count() < 10 || p.len() > 128 {
        return Err(AppError::BadRequest("password must be 10 to 128 characters".into()));
    }
    Ok(())
}

/// Issues a single-use email token, replacing any unused one for the same purpose. Only its
/// SHA-256 is stored.
async fn issue_token(state: &AppState, user_id: Uuid, purpose: &str, hours: i64) -> AppResult<String> {
    let token = crypto::random_token(32);
    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL")
        .bind(user_id)
        .bind(purpose)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))")
        .bind(crypto::sha256(token.as_bytes()))
        .bind(user_id)
        .bind(purpose)
        .bind(hours as i32)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(token)
}

/// Marks a token used and returns its user, or None if it is wrong, used or expired.
async fn consume_token(conn: &mut sqlx::PgConnection, token: &str, purpose: &str) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar(
        "UPDATE email_tokens SET used_at = now()
         WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
    )
    .bind(crypto::sha256(token.trim().as_bytes()))
    .bind(purpose)
    .fetch_optional(conn)
    .await
}

async fn send_verification(state: &AppState, user_id: Uuid, to: &str, name: &str) -> AppResult<()> {
    let token = issue_token(state, user_id, "verify", 48).await?;
    let link = format!("{}/verify-email?token={token}", state.cfg.public_origin);
    email::send_later(state, email::verify_email(to, name, &link));
    Ok(())
}

#[derive(Deserialize)]
pub struct SignupBody {
    email: String,
    password: String,
    display_name: String,
    country: String,
    role: String,
}

fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && email.len() <= 254 && !email.contains(char::is_whitespace)
}

pub async fn signup(
    State(state): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    Json(body): Json<SignupBody>,
) -> AppResult<(CookieJar, Json<Value>)> {
    limit(&state, &headers, "signup", 5, 3600)?;

    let email = body.email.trim().to_lowercase();
    let country = body.country.trim().to_uppercase();
    let display_name = body.display_name.trim().to_string();
    if !valid_email(&email) {
        return Err(AppError::BadRequest("enter a valid email address".into()));
    }
    valid_password(&body.password)?;
    if display_name.is_empty() || display_name.chars().count() > 80 {
        return Err(AppError::BadRequest("name must be 1 to 80 characters".into()));
    }
    if !valid_country(&country) {
        return Err(AppError::BadRequest("choose your country".into()));
    }
    if state.rails.is_blocked(&country) {
        return Err(AppError::Forbidden(
            "international sanctions law stops us from paying accounts in this country".into(),
        ));
    }
    if body.role != "publisher" && body.role != "advertiser" {
        return Err(AppError::BadRequest("role must be publisher or advertiser".into()));
    }

    let hash = crypto::hash_password(&body.password)?;
    let mut tx = state.db.begin().await?;
    let user_id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash, role, display_name, country)
         VALUES ($1, $2, $3::user_role, $4, $5) ON CONFLICT (email) DO NOTHING RETURNING id",
    )
    .bind(&email)
    .bind(&hash)
    .bind(&body.role)
    .bind(&display_name)
    .bind(&country)
    .fetch_optional(&mut *tx)
    .await?;
    let user_id = user_id.ok_or_else(|| AppError::Conflict("an account with this email already exists".into()))?;
    create_ledger_accounts(&mut tx, user_id, &body.role).await?;
    tx.commit().await?;

    auth::audit(&state, Some(user_id), "signup", None, json!({ "role": body.role, "country": country }), &headers).await;
    send_verification(&state, user_id, &email, &display_name).await?;
    let cookie = auth::start_session(&state, user_id, &headers).await?;
    Ok((jar.add(cookie), Json(json!({ "id": user_id }))))
}

#[derive(Deserialize)]
pub struct LoginBody {
    email: String,
    password: String,
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    jar: CookieJar,
    Json(body): Json<LoginBody>,
) -> AppResult<(CookieJar, Json<Value>)> {
    limit(&state, &headers, "login", 10, 900)?;
    let email = body.email.trim().to_lowercase();
    let row: Option<(Uuid, Option<String>, String)> =
        sqlx::query_as("SELECT id, password_hash, status::text FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;

    // Verify against a dummy hash when the user is missing (or signs in with Google only) so
    // timing does not reveal which accounts exist.
    let (hash, found) = match &row {
        Some((_, Some(h), _)) => (h.as_str(), true),
        _ => (crypto::dummy_hash(), false),
    };
    let ok = crypto::verify_password(&body.password, hash) && found;
    let Some((user_id, _, status)) = row.filter(|_| ok) else {
        return Err(AppError::BadRequest("email or password is incorrect".into()));
    };
    if status != "active" {
        return Err(AppError::Forbidden("this account is not active; contact support".into()));
    }

    auth::audit(&state, Some(user_id), "login", None, json!({}), &headers).await;
    let cookie = auth::start_session(&state, user_id, &headers).await?;
    Ok((jar.add(cookie), Json(json!({ "id": user_id }))))
}

pub async fn logout(State(state): State<AppState>, jar: CookieJar) -> AppResult<(CookieJar, Json<Value>)> {
    if let Some(c) = jar.get(SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(crypto::sha256(c.value().as_bytes()))
            .execute(&state.db)
            .await?;
    }
    Ok((auth::clear_cookie(jar), Json(json!({ "ok": true }))))
}

pub async fn me(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let balances = ledger::balances(&state.db, user.id).await?;
    let (onboarded, profile, has_password): (bool, Value, bool) = sqlx::query_as(
        "SELECT onboarded_at IS NOT NULL, profile, password_hash IS NOT NULL FROM users WHERE id = $1",
    )
    .bind(user.id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(json!({
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "display_name": user.display_name,
        "country": user.country,
        "kyc_tier": user.kyc_tier,
        "email_verified": user.email_verified,
        "is_admin": user.is_admin,
        "onboarded": onboarded,
        "has_password": has_password,
        "profile": profile,
        "balances": balances,
    })))
}

/// The balance accounts each role needs. Idempotent.
pub async fn create_ledger_accounts(conn: &mut sqlx::PgConnection, user_id: Uuid, role: &str) -> sqlx::Result<()> {
    let kinds: &[&str] = if role == "advertiser" {
        &[ledger::ESCROW]
    } else {
        &[ledger::PENDING, ledger::AVAILABLE, ledger::CLEARING]
    };
    for kind in kinds {
        ledger::account(conn, Some(user_id), kind).await?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct OnboardingBody {
    /// Required only when the account has no role yet (new Google sign-ups).
    role: Option<String>,
    country: Option<String>,
    display_name: Option<String>,
    /// Free-form answers: channels, niches, audience size, target markets.
    profile: Option<serde_json::Map<String, Value>>,
    /// True on the last step; marks onboarding finished.
    #[serde(default)]
    complete: bool,
}

/// Every value must be a short string, a boolean or a short list of short strings.
fn valid_profile(p: &serde_json::Map<String, Value>) -> bool {
    let short = |v: &Value| v.as_str().is_some_and(|s| s.len() <= 300);
    p.len() <= 20
        && p.keys().all(|k| k.len() <= 40)
        && p.values().all(|v| short(v) || v.is_boolean() || v.as_array().is_some_and(|a| a.len() <= 30 && a.iter().all(short)))
}

pub async fn onboarding(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<OnboardingBody>,
) -> AppResult<Json<Value>> {
    limit(&state, &headers, "onboarding", 60, 3600)?;
    let mut tx = state.db.begin().await?;

    // New Google accounts may arrive with neither role nor country, or with a role picked on the
    // sign-up page but no country yet. A role, once set, never changes here.
    if user.role.is_empty() || user.country.is_empty() {
        let role = if user.role.is_empty() { body.role.as_deref().unwrap_or("") } else { user.role.as_str() };
        if role != "publisher" && role != "advertiser" {
            return Err(AppError::BadRequest("choose whether you're an affiliate or a brand".into()));
        }
        let country = body.country.as_deref().unwrap_or("").trim().to_uppercase();
        if !valid_country(&country) {
            return Err(AppError::BadRequest("choose your country".into()));
        }
        if state.rails.is_blocked(&country) {
            return Err(AppError::Forbidden("international sanctions law stops us from paying accounts in this country".into()));
        }
        sqlx::query("UPDATE users SET role = COALESCE(role, $2::user_role), country = COALESCE(country, $3) WHERE id = $1")
            .bind(user.id)
            .bind(role)
            .bind(&country)
            .execute(&mut *tx)
            .await?;
        create_ledger_accounts(&mut tx, user.id, role).await?;
    }

    if let Some(name) = body.display_name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        if name.chars().count() > 80 {
            return Err(AppError::BadRequest("name must be 1 to 80 characters".into()));
        }
        sqlx::query("UPDATE users SET display_name = $2 WHERE id = $1").bind(user.id).bind(name).execute(&mut *tx).await?;
    }

    if let Some(profile) = &body.profile {
        if !valid_profile(profile) {
            return Err(AppError::BadRequest("profile answers are too long".into()));
        }
        sqlx::query("UPDATE users SET profile = profile || $2 WHERE id = $1")
            .bind(user.id)
            .bind(Value::Object(profile.clone()))
            .execute(&mut *tx)
            .await?;
    }

    if body.complete {
        let ready: bool = sqlx::query_scalar("SELECT role IS NOT NULL AND country IS NOT NULL FROM users WHERE id = $1")
            .bind(user.id)
            .fetch_one(&mut *tx)
            .await?;
        if !ready {
            return Err(AppError::BadRequest("choose your account type and country first".into()));
        }
        sqlx::query("UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1").bind(user.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;

    if body.complete {
        auth::audit(&state, Some(user.id), "onboarding.complete", None, json!({}), &headers).await;
        let (name, role): (String, String) = sqlx::query_as("SELECT display_name, role::text FROM users WHERE id = $1")
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
        email::send_later(&state, email::welcome(&user.email, &name, &role, &state.cfg.public_origin));
    }
    Ok(Json(json!({ "ok": true })))
}

// ── Email verification and password reset ──────────────────────────────────

#[derive(Deserialize)]
pub struct TokenBody {
    token: String,
}

pub async fn verify_email(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<TokenBody>) -> AppResult<Json<Value>> {
    limit(&state, &headers, "verify", 20, 3600)?;
    let mut tx = state.db.begin().await?;
    let user_id = consume_token(&mut tx, &body.token, "verify")
        .await?
        .ok_or_else(|| AppError::BadRequest("this link is invalid or has expired; request a new one from your dashboard".into()))?;
    sqlx::query("UPDATE users SET email_verified = true WHERE id = $1").bind(user_id).execute(&mut *tx).await?;
    tx.commit().await?;
    auth::audit(&state, Some(user_id), "email.verified", None, json!({}), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

pub async fn resend_verification(State(state): State<AppState>, headers: HeaderMap, user: CurrentUser) -> AppResult<Json<Value>> {
    limit(&state, &headers, "resend_verify", 3, 3600)?;
    if user.email_verified {
        return Ok(Json(json!({ "ok": true, "already_verified": true })));
    }
    send_verification(&state, user.id, &user.email, &user.display_name).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ForgotBody {
    email: String,
}

/// Always answers the same way, so it can't be used to find out which emails have accounts.
pub async fn forgot_password(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<ForgotBody>) -> AppResult<Json<Value>> {
    limit(&state, &headers, "forgot", 5, 3600)?;
    let email_addr = body.email.trim().to_lowercase();
    let user: Option<(Uuid, String)> = sqlx::query_as("SELECT id, display_name FROM users WHERE email = $1 AND status = 'active'")
        .bind(&email_addr)
        .fetch_optional(&state.db)
        .await?;
    if let Some((user_id, name)) = user {
        let token = issue_token(&state, user_id, "reset", 1).await?;
        let link = format!("{}/reset-password?token={token}", state.cfg.public_origin);
        email::send_later(&state, email::reset_password(&email_addr, &name, &link));
        auth::audit(&state, Some(user_id), "password.reset_requested", None, json!({}), &headers).await;
    }
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ResetBody {
    token: String,
    password: String,
}

/// Sets a new password (also lets Google-only accounts add one), verifies the email, and signs
/// out every existing session.
pub async fn reset_password(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<ResetBody>) -> AppResult<Json<Value>> {
    limit(&state, &headers, "reset", 10, 3600)?;
    valid_password(&body.password)?;
    let hash = crypto::hash_password(&body.password)?;
    let mut tx = state.db.begin().await?;
    let user_id = consume_token(&mut tx, &body.token, "reset")
        .await?
        .ok_or_else(|| AppError::BadRequest("this link is invalid or has expired; request a new one".into()))?;
    sqlx::query("UPDATE users SET password_hash = $2, email_verified = true WHERE id = $1")
        .bind(user_id)
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sessions WHERE user_id = $1").bind(user_id).execute(&mut *tx).await?;
    tx.commit().await?;
    auth::audit(&state, Some(user_id), "password.reset", None, json!({}), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    #[test]
    fn email_validation() {
        assert!(super::valid_email("a@b.co"));
        assert!(!super::valid_email("a@b"));
        assert!(!super::valid_email("@b.co"));
        assert!(!super::valid_email("a b@c.co"));
    }

    #[test]
    fn profile_validation() {
        let ok = serde_json::json!({ "channels": ["youtube", "blog"], "audience": "1k-10k", "agreed": true });
        assert!(super::valid_profile(ok.as_object().unwrap()));
        let nested = serde_json::json!({ "x": { "deep": 1 } });
        assert!(!super::valid_profile(nested.as_object().unwrap()));
        let long = serde_json::json!({ "bio": "a".repeat(301) });
        assert!(!super::valid_profile(long.as_object().unwrap()));
    }
}
