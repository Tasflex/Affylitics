//! Reads packages/shared/rails.json, the registry of payout rails per country.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Rail {
    pub name: String,
    pub kind: String,
    pub provider: String,
    pub min_usd: f64,
    pub fee_pct: f64,
    pub fee_usd: f64,
    pub speed: String,
}

#[derive(Debug, Deserialize)]
struct CountryEntry {
    currency: String,
    rails: Vec<String>,
    #[serde(default)]
    review: bool,
}

#[derive(Debug, Deserialize)]
struct DefaultEntry {
    rails: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RailsFile {
    blocked: Vec<String>,
    rails: HashMap<String, Rail>,
    default: DefaultEntry,
    countries: HashMap<String, CountryEntry>,
    sepa: Vec<String>,
}

pub struct Rails {
    file: RailsFile,
}

#[derive(Debug, Serialize)]
pub struct ResolvedRail {
    pub id: String,
    #[serde(flatten)]
    pub rail: Rail,
}

#[derive(Debug, Serialize)]
pub struct CountryRails {
    pub country: String,
    pub currency: String,
    /// Payouts to this country are held for manual compliance review.
    pub review: bool,
    pub rails: Vec<ResolvedRail>,
}

fn sepa_currency(country: &str) -> &'static str {
    match country {
        "PL" => "PLN",
        "CZ" => "CZK",
        "HU" => "HUF",
        "RO" => "RON",
        "BG" => "BGN",
        "SE" => "SEK",
        "DK" => "DKK",
        "NO" => "NOK",
        "IS" => "ISK",
        "CH" => "CHF",
        _ => "EUR",
    }
}

impl Rails {
    pub fn load(path: &str) -> Result<Self> {
        let raw = std::fs::read_to_string(path).with_context(|| format!("reading {path}"))?;
        let file: RailsFile = serde_json::from_str(&raw).context("parsing rails.json")?;
        Ok(Self { file })
    }

    pub fn is_blocked(&self, country: &str) -> bool {
        self.file.blocked.iter().any(|c| c == country)
    }

    /// Countries whose payouts wait for manual compliance review instead of auto-sending.
    pub fn review_countries(&self) -> Vec<String> {
        self.file.countries.iter().filter(|(_, c)| c.review).map(|(k, _)| k.clone()).collect()
    }

    pub fn rail(&self, id: &str) -> Option<&Rail> {
        self.file.rails.get(id)
    }

    /// The rails available in a country, or None if we are barred from paying it.
    pub fn for_country(&self, country: &str) -> Option<CountryRails> {
        if self.is_blocked(country) {
            return None;
        }
        let (currency, ids, review) = if let Some(c) = self.file.countries.get(country) {
            (c.currency.clone(), c.rails.clone(), c.review)
        } else if self.file.sepa.iter().any(|c| c == country) {
            let ids = ["sepa", "paypal", "payoneer", "usdc"].map(String::from).to_vec();
            (sepa_currency(country).to_string(), ids, false)
        } else {
            ("USD".to_string(), self.file.default.rails.clone(), false)
        };
        let rails = ids
            .into_iter()
            .filter_map(|id| self.file.rails.get(&id).map(|r| ResolvedRail { id, rail: r.clone() }))
            .collect();
        Some(CountryRails { country: country.to_string(), currency, review, rails })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rails() -> Rails {
        Rails::load(concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/shared/rails.json")).unwrap()
    }

    #[test]
    fn kenya_gets_mpesa_first() {
        let ke = rails().for_country("KE").unwrap();
        assert_eq!(ke.currency, "KES");
        assert_eq!(ke.rails[0].id, "mpesa");
    }

    #[test]
    fn every_listed_rail_exists() {
        let r = rails();
        for (code, c) in &r.file.countries {
            for id in &c.rails {
                assert!(r.rail(id).is_some(), "{code} references unknown rail {id}");
            }
        }
    }

    #[test]
    fn unlisted_and_sepa_and_blocked() {
        let r = rails();
        assert_eq!(r.for_country("FR").unwrap().currency, "EUR");
        assert_eq!(r.for_country("PL").unwrap().currency, "PLN");
        assert!(!r.for_country("FJ").unwrap().rails.is_empty());
        assert!(r.for_country("KP").is_none());
    }
}
