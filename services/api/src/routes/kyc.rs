use axum::{extract::State, http::HeaderMap, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::limit;
use crate::{
    auth::{self, CurrentUser},
    error::{AppError, AppResult},
    AppState,
};

#[derive(Serialize, sqlx::FromRow)]
pub struct CheckRow {
    id: Uuid,
    provider: String,
    tier: i16,
    status: String,
    reason: Option<String>,
    created_at: DateTime<Utc>,
}

pub async fn status(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Value>> {
    let checks = sqlx::query_as::<_, CheckRow>(
        "SELECT id, provider, tier, status::text AS status, reason, created_at FROM kyc_checks
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({ "tier": user.kyc_tier, "checks": checks })))
}

#[derive(Deserialize)]
pub struct StartBody {
    tier: i16,
}

#[derive(Deserialize)]
struct IntelStart {
    provider: String,
    provider_ref: String,
    /// Where to send the user to complete the check (hosted flow), if the provider uses one.
    url: Option<String>,
    /// SDK token for embedded flows.
    token: Option<String>,
}

/// Starts a verification with the provider that covers the user's country. The intel service
/// picks the provider and talks to it; results come back through /internal/kyc/result.
pub async fn start(
    State(state): State<AppState>,
    headers: HeaderMap,
    user: CurrentUser,
    Json(body): Json<StartBody>,
) -> AppResult<Json<Value>> {
    limit(&state, &headers, "kyc", 5, 3600)?;
    if !(1..=3).contains(&body.tier) || body.tier <= user.kyc_tier {
        return Err(AppError::BadRequest("choose a higher verification level than you have".into()));
    }
    if body.tier > user.kyc_tier + 1 {
        return Err(AppError::BadRequest("complete the levels in order".into()));
    }
    let open: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM kyc_checks WHERE user_id = $1 AND status IN ('started', 'pending') AND created_at > now() - interval '1 day')")
        .bind(user.id)
        .fetch_one(&state.db)
        .await?;
    if open {
        return Err(AppError::Conflict("you already have a verification in progress".into()));
    }

    let check_id = Uuid::new_v4();
    let res = state
        .http
        .post(format!("{}/kyc/start", state.cfg.intel_url))
        .bearer_auth(&state.cfg.internal_token)
        .json(&json!({
            "check_id": check_id,
            "user_id": user.id,
            "country": user.country,
            "tier": body.tier,
            "email": user.email,
            "role": user.role,
        }))
        .send()
        .await
        .map_err(anyhow::Error::from)?;
    if !res.status().is_success() {
        return Err(AppError::Internal(anyhow::anyhow!("intel /kyc/start returned {}", res.status())));
    }
    let started: IntelStart = res.json().await.map_err(anyhow::Error::from)?;

    sqlx::query("INSERT INTO kyc_checks (id, user_id, provider, tier, provider_ref) VALUES ($1, $2, $3, $4, $5)")
        .bind(check_id)
        .bind(user.id)
        .bind(&started.provider)
        .bind(body.tier)
        .bind(&started.provider_ref)
        .execute(&state.db)
        .await?;
    auth::audit(&state, Some(user.id), "kyc.start", Some(check_id.to_string()), json!({ "tier": body.tier, "provider": started.provider }), &headers).await;
    Ok(Json(json!({ "check_id": check_id, "provider": started.provider, "url": started.url, "token": started.token })))
}
