mod auth;
mod config;
mod crypto;
mod email;
mod error;
mod ledger;
mod rails;
mod ratelimit;
mod routes;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use axum::{
    extract::{Request, State},
    http::{Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use sqlx::postgres::PgPoolOptions;
use tower_http::{limit::RequestBodyLimitLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub cfg: Arc<config::Config>,
    pub limiter: Arc<ratelimit::RateLimiter>,
    pub rails: Arc<rails::Rails>,
    pub http: reqwest::Client,
}

/// Rejects state-changing browser requests that do not come from our own origin. Postbacks and
/// internal calls are authenticated by signature/token instead, so they are exempt.
async fn origin_guard(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let path = req.uri().path();
    let safe = matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS);
    let exempt = path.starts_with("/api/postback") || path.starts_with("/internal/") || path.starts_with("/go/");
    if !safe && !exempt {
        let origin = req.headers().get("origin").and_then(|v| v.to_str().ok());
        if origin != Some(state.cfg.public_origin.as_str()) {
            return (StatusCode::FORBIDDEN, axum::Json(serde_json::json!({ "error": "bad origin" })))
                .into_response();
        }
    }
    next.run(req).await
}

async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert("x-content-type-options", "nosniff".parse().unwrap());
    h.insert("referrer-policy", "strict-origin-when-cross-origin".parse().unwrap());
    if !h.contains_key("cache-control") {
        h.insert("cache-control", "no-store".parse().unwrap());
    }
    res
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "affylitics_api=info,tower_http=warn".into()),
        )
        .init();

    let cfg = Arc::new(config::Config::from_env()?);
    // Aiven's smaller plans allow ~20-25 connections in total, so stay well under by default.
    let max_conns = std::env::var("DB_MAX_CONNECTIONS").ok().and_then(|v| v.parse().ok()).unwrap_or(10);
    let db = PgPoolOptions::new()
        .max_connections(max_conns)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&cfg.database_url)
        .await?;
    sqlx::migrate!("../../db/migrations").run(&db).await?;

    let state = AppState {
        db,
        rails: Arc::new(rails::Rails::load(&cfg.rails_path)?),
        limiter: Arc::new(ratelimit::RateLimiter::new()),
        http: reqwest::Client::builder().timeout(Duration::from_secs(15)).build()?,
        cfg: cfg.clone(),
    };

    spawn_background_jobs(state.clone());

    let app = routes::router(state.clone())
        .layer(middleware::from_fn_with_state(state.clone(), origin_guard))
        .layer(middleware::from_fn(security_headers))
        .layer(RequestBodyLimitLayer::new(64 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind).await?;
    tracing::info!("affylitics-api listening on {}", cfg.bind);
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

fn spawn_background_jobs(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(600));
        loop {
            tick.tick().await;
            match routes::earnings::mature_conversions(&state.db).await {
                Ok(n) if n > 0 => tracing::info!(count = n, "matured conversions"),
                Ok(_) => {}
                Err(e) => tracing::error!(error = ?e, "maturing conversions failed"),
            }
            state.limiter.sweep(Duration::from_secs(3600));
        }
    });
}
