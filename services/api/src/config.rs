use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};

pub struct Config {
    pub database_url: String,
    pub bind: String,
    /// The site origin browsers use, e.g. https://netaffil.com. Used for CSRF checks.
    pub public_origin: String,
    pub cookie_secure: bool,
    /// Salt for hashing IPs and user agents so raw values are never stored.
    pub hash_salt: Vec<u8>,
    /// 32-byte AES-256-GCM key for payout details.
    pub data_key: [u8; 32],
    /// Shared secret for calls between the API and the intel service.
    pub internal_token: String,
    pub intel_url: String,
    pub rails_path: String,
    /// Google OAuth client. Sign-in with Google is off unless both are set.
    pub google: Option<GoogleOAuth>,
}

pub struct GoogleOAuth {
    pub client_id: String,
    pub client_secret: String,
}

fn optional(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn var(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("missing env var {name}"))
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let data_key_vec = STANDARD
            .decode(var("DATA_KEY")?)
            .context("DATA_KEY must be base64")?;
        let data_key: [u8; 32] = data_key_vec
            .try_into()
            .map_err(|_| anyhow::anyhow!("DATA_KEY must decode to 32 bytes"))?;

        let hash_salt = var("HASH_SALT")?.into_bytes();
        let internal_token = var("INTERNAL_TOKEN")?;
        if hash_salt.len() < 16 || internal_token.len() < 32 {
            bail!("HASH_SALT must be 16+ chars and INTERNAL_TOKEN 32+ chars");
        }

        Ok(Self {
            database_url: var("DATABASE_URL")?,
            bind: std::env::var("API_BIND").unwrap_or_else(|_| "127.0.0.1:8100".into()),
            public_origin: var("PUBLIC_ORIGIN")?,
            cookie_secure: std::env::var("COOKIE_SECURE").map(|v| v != "false").unwrap_or(true),
            hash_salt,
            data_key,
            internal_token,
            intel_url: std::env::var("INTEL_URL").unwrap_or_else(|_| "http://127.0.0.1:8200".into()),
            rails_path: std::env::var("RAILS_PATH")
                .unwrap_or_else(|_| "../../packages/shared/rails.json".into()),
            google: optional("GOOGLE_CLIENT_ID")
                .zip(optional("GOOGLE_CLIENT_SECRET"))
                .map(|(client_id, client_secret)| GoogleOAuth { client_id, client_secret }),
        })
    }
}
