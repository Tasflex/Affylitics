use axum::{extract::State, http::HeaderMap, Json};
use axum_extra::extract::CookieJar;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use super::{limit, valid_country};
use crate::{
    auth::{self, CurrentUser, SESSION_COOKIE},
    crypto,
    error::{AppError, AppResult},
    ledger, AppState,
};

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
    if body.password.chars().count() < 10 || body.password.len() > 128 {
        return Err(AppError::BadRequest("password must be 10 to 128 characters".into()));
    }
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
    }
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
