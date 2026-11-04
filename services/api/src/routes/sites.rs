//! Website ownership verification. A user adds a site, puts
//! `<meta name="netaffil-verification" content="TOKEN">` in its <head>, and we fetch the home
//! page to find it.
//!
//! Fetching a URL a user typed is a server-side request forgery risk, so the fetcher only talks to
//! public IPs on ports 80/443, pins each request to the address it vetted (no DNS rebinding),
//! re-vets every redirect hop itself, and caps time and response size.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use super::limit;
use crate::{
    auth::{self, CurrentUser},
    crypto,
    error::{AppError, AppResult},
    AppState,
};

pub const META_NAME: &str = "netaffil-verification";
const MAX_BODY: usize = 1_000_000;
const MAX_REDIRECTS: usize = 4;

#[derive(Serialize, sqlx::FromRow)]
pub struct SiteRow {
    id: Uuid,
    url: String,
    host: String,
    token: String,
    verified_at: Option<DateTime<Utc>>,
    last_checked_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
    created_at: DateTime<Utc>,
}

pub async fn list(State(state): State<AppState>, user: CurrentUser) -> AppResult<Json<Vec<SiteRow>>> {
    let rows = sqlx::query_as::<_, SiteRow>(
        "SELECT id, url, host, token, verified_at, last_checked_at, last_error, created_at FROM sites WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

/// The site's home page URL (scheme + host), and the host without a leading "www.".
fn normalize(input: &str) -> Option<(url::Url, String)> {
    let raw = input.trim();
    let with_scheme = if raw.contains("://") { raw.to_string() } else { format!("https://{raw}") };
    let parsed = url::Url::parse(&with_scheme).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.username() != "" || parsed.password().is_some() {
        return None;
    }
    let host = parsed.host_str()?.to_ascii_lowercase();
    if !host.contains('.') || host.len() > 253 {
        return None;
    }
    let mut home = url::Url::parse(&format!("{}://{}/", parsed.scheme(), host)).ok()?;
    if let Some(port) = parsed.port() {
        home.set_port(Some(port)).ok()?;
    }
    Some((home, host.trim_start_matches("www.").to_string()))
}

#[derive(Deserialize)]
pub struct AddBody {
    url: String,
}

pub async fn add(State(state): State<AppState>, headers: HeaderMap, user: CurrentUser, Json(b): Json<AddBody>) -> AppResult<Json<Value>> {
    limit(&state, &headers, "site_add", 20, 3600)?;
    let (home, host) = normalize(&b.url).ok_or_else(|| AppError::BadRequest("enter a website address like https://example.com".into()))?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sites WHERE user_id = $1").bind(user.id).fetch_one(&state.db).await?;
    if count >= 20 {
        return Err(AppError::BadRequest("you can add up to 20 websites".into()));
    }
    let token = format!("na-{}", crypto::random_token(16));
    let id: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO sites (user_id, url, host, token) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, host) DO NOTHING RETURNING id",
    )
    .bind(user.id)
    .bind(home.as_str())
    .bind(&host)
    .bind(&token)
    .fetch_optional(&state.db)
    .await?;
    let id = id.ok_or_else(|| AppError::Conflict("you've already added this website".into()))?;
    auth::audit(&state, Some(user.id), "site.add", Some(id.to_string()), json!({ "host": host }), &headers).await;
    Ok(Json(json!({ "id": id, "url": home.as_str(), "token": token })))
}

pub async fn remove(State(state): State<AppState>, headers: HeaderMap, user: CurrentUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    let res = sqlx::query("DELETE FROM sites WHERE id = $1 AND user_id = $2").bind(id).bind(user.id).execute(&state.db).await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    auth::audit(&state, Some(user.id), "site.remove", Some(id.to_string()), json!({}), &headers).await;
    Ok(Json(json!({ "ok": true })))
}

pub async fn verify(State(state): State<AppState>, headers: HeaderMap, user: CurrentUser, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    limit(&state, &headers, "site_verify", 30, 3600)?;
    let site: Option<(String, String)> = sqlx::query_as("SELECT url, token FROM sites WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await?;
    let (url, token) = site.ok_or(AppError::NotFound)?;
    let start = url::Url::parse(&url).map_err(|e| AppError::Internal(e.into()))?;

    let outcome = match fetch_public(start).await {
        Ok(html) if has_tag(&html, &token) => Ok(()),
        Ok(_) => Err(format!("we loaded your home page but couldn't find the {META_NAME} tag. Check it's inside <head> and that your site isn't serving a cached copy")),
        Err(e) => Err(e),
    };
    match &outcome {
        Ok(()) => {
            sqlx::query("UPDATE sites SET verified_at = COALESCE(verified_at, now()), last_checked_at = now(), last_error = NULL WHERE id = $1")
                .bind(id)
                .execute(&state.db)
                .await?;
            auth::audit(&state, Some(user.id), "site.verified", Some(id.to_string()), json!({}), &headers).await;
        }
        Err(e) => {
            sqlx::query("UPDATE sites SET last_checked_at = now(), last_error = $2 WHERE id = $1").bind(id).bind(e).execute(&state.db).await?;
        }
    }
    Ok(Json(json!({ "verified": outcome.is_ok(), "error": outcome.err() })))
}

// ── Safe fetching ──────────────────────────────────────────────────────────

fn public_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.is_multicast()
        || o[0] == 0
        || (o[0] == 100 && (64..=127).contains(&o[1])) // carrier-grade NAT
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)     // IETF protocol assignments
        || (o[0] == 198 && (18..=19).contains(&o[1]))  // benchmarking
        || o[0] >= 240)
}

fn public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return public_v4(v4);
    }
    let s = ip.segments();
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (s[0] & 0xfe00) == 0xfc00 // unique local
        || (s[0] & 0xffc0) == 0xfe80 // link local
        || s[0] == 0x2001 && s[1] == 0x0db8) // documentation
}

pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => public_v4(v4),
        IpAddr::V6(v6) => public_v6(v6),
    }
}

/// Fetches a page from the public internet only. Returns the body (up to 1 MB) or a message
/// suitable for showing the user.
async fn fetch_public(start: url::Url) -> Result<String, String> {
    let mut current = start;
    for _ in 0..=MAX_REDIRECTS {
        if !matches!(current.scheme(), "http" | "https") {
            return Err("your site redirected to an unsupported address".into());
        }
        let host = current.host_str().ok_or("invalid address")?.to_string();
        let port = current.port_or_known_default().ok_or("invalid address")?;
        if port != 80 && port != 443 {
            return Err("only standard web ports (80 and 443) can be checked".into());
        }
        let mut addrs: Vec<SocketAddr> = tokio::time::timeout(Duration::from_secs(5), tokio::net::lookup_host((host.as_str(), port)))
            .await
            .map_err(|_| "looking up your domain timed out".to_string())?
            .map_err(|_| "we couldn't find that domain; check the address".to_string())?
            .collect();
        if addrs.is_empty() || !addrs.iter().all(|a| is_public(a.ip())) {
            return Err("that address doesn't point to a public website".into());
        }
        // Prefer IPv4 (the server may have no IPv6 route), then try each vetted address in turn.
        addrs.sort_by_key(|a| a.is_ipv6());
        let mut last_err = "we couldn't connect to your site".to_string();
        let mut response = None;
        for addr in addrs.iter().take(4) {
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .connect_timeout(Duration::from_secs(4))
                .resolve(&host, *addr)
                .user_agent("NetAffilBot/1.0 (+https://netaffil.com) site verification")
                .build()
                .map_err(|_| "internal error".to_string())?;
            match client.get(current.clone()).header("accept", "text/html").send().await {
                Ok(r) => {
                    response = Some(r);
                    break;
                }
                Err(e) if e.is_connect() => continue,
                Err(e) => {
                    last_err = if e.is_timeout() { "your site took too long to respond".into() } else { "we couldn't connect to your site".into() };
                    break;
                }
            }
        }
        let mut res = response.ok_or(last_err)?;

        if res.status().is_redirection() {
            let location = res.headers().get("location").and_then(|v| v.to_str().ok()).ok_or("your site sent a broken redirect")?;
            current = current.join(location).map_err(|_| "your site sent a broken redirect".to_string())?;
            continue;
        }
        if !res.status().is_success() {
            return Err(format!("your site answered with HTTP {}", res.status().as_u16()));
        }
        let mut body = Vec::new();
        while let Some(chunk) = res.chunk().await.map_err(|_| "the connection dropped while loading your site".to_string())? {
            body.extend_from_slice(&chunk);
            if body.len() >= MAX_BODY {
                body.truncate(MAX_BODY);
                break;
            }
        }
        return Ok(String::from_utf8_lossy(&body).into_owned());
    }
    Err("your site redirected too many times".into())
}

/// Attribute value from inside a tag, handling double, single or no quotes, any case.
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = lower[from..].find(name) {
        let start = from + pos;
        from = start + name.len();
        let before_ok = start == 0 || lower.as_bytes()[start - 1].is_ascii_whitespace();
        let rest = lower[from..].trim_start();
        if !before_ok || !rest.starts_with('=') {
            continue;
        }
        let offset = tag.len() - rest.len() + 1;
        let value = tag[offset..].trim_start();
        let parsed = match value.chars().next() {
            Some(q @ ('"' | '\'')) => value[1..].split(q).next().unwrap_or(""),
            _ => value.split(|c: char| c.is_whitespace() || c == '>' || c == '/').next().unwrap_or(""),
        };
        return Some(parsed.trim().to_string());
    }
    None
}

pub fn has_tag(html: &str, token: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(pos) = lower[from..].find("<meta") {
        let start = from + pos;
        let end = lower[start..].find('>').map(|e| start + e).unwrap_or(lower.len());
        let tag = &html[start..end];
        if attr(tag, "name").is_some_and(|n| n.eq_ignore_ascii_case(META_NAME)) && attr(tag, "content").as_deref() == Some(token) {
            return true;
        }
        from = end;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_tag_in_any_attribute_style() {
        let t = "na-abc123";
        assert!(has_tag(r#"<head><meta name="netaffil-verification" content="na-abc123"></head>"#, t));
        assert!(has_tag(r#"<META CONTENT='na-abc123' NAME='netaffil-verification' />"#, t));
        assert!(has_tag("<meta name=netaffil-verification content=na-abc123>", t));
        assert!(!has_tag(r#"<meta name="netaffil-verification" content="na-other">"#, t));
        assert!(!has_tag(r#"<meta property="og:title" content="na-abc123">"#, t));
        assert!(!has_tag(r#"<meta data-name="netaffil-verification" content="na-abc123">"#, t));
        assert!(!has_tag("na-abc123 netaffil-verification", t));
    }

    #[test]
    fn private_addresses_are_refused() {
        for ip in ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"] {
            assert!(!is_public(ip.parse().unwrap()), "{ip} should be refused");
        }
        for ip in ["8.8.8.8", "185.187.169.13", "2606:4700::6810:1"] {
            assert!(is_public(ip.parse().unwrap()), "{ip} should be allowed");
        }
    }

    #[test]
    fn urls_are_normalized_to_the_home_page() {
        let (home, host) = normalize("www.Example.com/blog/post?x=1").unwrap();
        assert_eq!(home.as_str(), "https://www.example.com/");
        assert_eq!(host, "example.com");
        assert!(normalize("javascript:alert(1)").is_none());
        assert!(normalize("https://user:pw@example.com").is_none());
        assert!(normalize("localhost").is_none());
    }
}
