//! Fixed-window rate limiter keyed by (bucket, client). In-memory is enough while the API
//! runs as a single process; move to Redis if it ever runs as several.

use dashmap::DashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    windows: DashMap<(&'static str, String), (Instant, u32)>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self { windows: DashMap::new() }
    }

    /// Returns true if the request is allowed.
    pub fn check(&self, bucket: &'static str, client: &str, limit: u32, window: Duration) -> bool {
        let now = Instant::now();
        let mut entry = self.windows.entry((bucket, client.to_string())).or_insert((now, 0));
        let (start, count) = *entry;
        if now.duration_since(start) > window {
            *entry = (now, 1);
            return true;
        }
        if count >= limit {
            return false;
        }
        entry.1 += 1;
        true
    }

    /// Drop expired windows so memory stays bounded.
    pub fn sweep(&self, older_than: Duration) {
        let now = Instant::now();
        self.windows.retain(|_, (start, _)| now.duration_since(*start) < older_than);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_limit() {
        let rl = RateLimiter::new();
        for _ in 0..3 {
            assert!(rl.check("t", "1.2.3.4", 3, Duration::from_secs(60)));
        }
        assert!(!rl.check("t", "1.2.3.4", 3, Duration::from_secs(60)));
        assert!(rl.check("t", "5.6.7.8", 3, Duration::from_secs(60)));
    }
}
