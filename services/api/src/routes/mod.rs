pub mod account;
pub mod earnings;
pub mod internal;
pub mod kyc;
pub mod oauth;
pub mod offers;
pub mod payouts;
pub mod track;

use std::time::Duration;

use axum::{
    http::HeaderMap,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::{json, Value};

use crate::{
    auth::client_ip,
    error::{AppError, AppResult},
    AppState,
};

pub fn router(_state: AppState) -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        // Account
        .route("/api/auth/signup", post(account::signup))
        .route("/api/auth/login", post(account::login))
        .route("/api/auth/logout", post(account::logout))
        .route("/api/me", get(account::me))
        .route("/api/onboarding", post(account::onboarding))
        .route("/api/auth/google/start", get(oauth::start))
        .route("/api/auth/google/callback", get(oauth::callback))
        // Marketplace
        .route("/api/offers", get(offers::list_public).post(offers::create))
        .route("/api/offers/:slug", get(offers::get_public))
        .route("/api/offers/:id/status", post(offers::set_status))
        .route("/api/brands", get(offers::list_brands).post(offers::create_brand))
        .route("/api/advertiser/offers", get(offers::list_mine))
        .route("/api/escrow/fund", post(offers::fund_escrow))
        .route("/api/advertiser/conversions", get(earnings::advertiser_conversions))
        .route("/api/advertiser/conversions/:id/reject", post(earnings::reject_conversion))
        // Publisher
        .route("/api/links", get(track::list_links).post(track::create_link))
        .route("/api/conversions", get(earnings::publisher_conversions))
        .route("/api/ledger", get(earnings::ledger_entries))
        // Tracking
        .route("/go/:code", get(track::redirect))
        .route("/api/postback", post(track::postback))
        // Payouts and KYC
        .route("/api/rails/:country", get(payouts::rails_for_country))
        .route("/api/payout-methods", get(payouts::list_methods).post(payouts::add_method))
        .route("/api/payout-methods/:id", delete(payouts::remove_method))
        .route("/api/payouts", get(payouts::list_payouts).post(payouts::request_payout))
        .route("/api/kyc", get(kyc::status).post(kyc::start))
        // Service-to-service
        .nest("/internal", internal::router())
}

async fn health(axum::extract::State(state): axum::extract::State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}

/// Per-IP rate limit for a named bucket.
pub fn limit(state: &AppState, headers: &HeaderMap, bucket: &'static str, max: u32, per_secs: u64) -> AppResult<()> {
    if state.limiter.check(bucket, &client_ip(headers), max, Duration::from_secs(per_secs)) {
        Ok(())
    } else {
        Err(AppError::TooManyRequests)
    }
}

pub fn valid_country(code: &str) -> bool {
    code.len() == 2 && code.bytes().all(|b| b.is_ascii_uppercase())
}
