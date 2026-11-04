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

    let kinds: &[&str] = if body.role == "advertiser" {
        &[ledger::ESCROW]
    } else {
        &[ledger::PENDING, ledger::AVAILABLE, ledger::CLEARING]
    };
    for kind in kinds {
        ledger::account(&mut tx, Some(user_id), kind).await?;
    }
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
    let row: Option<(Uuid, String, String)> =
        sqlx::query_as("SELECT id, password_hash, status::text FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;

    // Verify against a dummy hash when the user is missing so timing does not reveal accounts.
    let (hash, found) = match &row {
        Some((_, h, _)) => (h.as_str(), true),
        None => (crypto::dummy_hash(), false),
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
    Ok(Json(json!({
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "display_name": user.display_name,
        "country": user.country,
        "kyc_tier": user.kyc_tier,
        "email_verified": user.email_verified,
        "balances": balances,
    })))
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
}
