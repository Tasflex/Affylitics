//! Transactional email through Resend. Sending happens on a background task so a slow or failed
//! email never delays or fails the request that triggered it. Without RESEND_API_KEY, emails are
//! logged instead of sent.

use serde_json::json;

use crate::AppState;

pub struct Email {
    pub to: String,
    pub subject: String,
    pub html: String,
    pub text: String,
}

/// Queues an email and returns immediately.
pub fn send_later(state: &AppState, email: Email) {
    let state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = send(&state, &email).await {
            tracing::error!(error = ?e, subject = %email.subject, "email failed");
        }
    });
}

async fn send(state: &AppState, email: &Email) -> anyhow::Result<()> {
    let Some(key) = &state.cfg.resend_key else {
        tracing::info!(to = %email.to, subject = %email.subject, "email not sent (RESEND_API_KEY unset)");
        return Ok(());
    };
    let res = state
        .http
        .post("https://api.resend.com/emails")
        .bearer_auth(key)
        .json(&json!({
            "from": state.cfg.email_from,
            "to": [email.to],
            "subject": email.subject,
            "html": email.html,
            "text": email.text,
        }))
        .send()
        .await?;
    if !res.status().is_success() {
        anyhow::bail!("resend returned {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    Ok(())
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// A branded, accessible email: heading, paragraphs, optional button. Returns (html, text).
fn layout(heading: &str, paragraphs: &[String], cta: Option<(&str, &str)>, footer: &str) -> (String, String) {
    let paras_html: String = paragraphs
        .iter()
        .map(|p| format!(r#"<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2c2c3f">{}</p>"#, escape(p)))
        .collect();
    let button = cta
        .map(|(label, url)| {
            format!(
                r#"<p style="margin:24px 0"><a href="{url}" style="display:inline-block;background:#2463eb;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:10px">{label}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#565672">If the button doesn't work, copy this link into your browser:<br><a href="{url}" style="color:#2463eb;word-break:break-all">{url}</a></p>"#,
                url = escape(url),
                label = escape(label)
            )
        })
        .unwrap_or_default();
    let html = format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{h}</title></head>
<body style="margin:0;background:#f8faff;font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e1f5;border-radius:16px">
<tr><td style="padding:28px 32px 0"><span style="font-size:20px;font-weight:800;color:#29294e">Net<span style="color:#a65d00">Affil</span></span></td></tr>
<tr><td style="padding:20px 32px 28px">
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:26px;line-height:1.2;color:#29294e">{h}</h1>
{paras_html}{button}
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #e3e1f5;font-size:12px;color:#565672">{footer}</td></tr>
</table></td></tr></table></body></html>"#,
        h = escape(heading),
        footer = escape(footer),
    );
    let mut text = format!("{heading}\n\n{}\n", paragraphs.join("\n\n"));
    if let Some((label, url)) = cta {
        text.push_str(&format!("\n{label}: {url}\n"));
    }
    text.push_str(&format!("\n--\n{footer}\n"));
    (html, text)
}

const ACCOUNT_FOOTER: &str = "You're receiving this because you have a NetAffil account. NetAffil — the global affiliate marketplace.";

fn build(to: &str, subject: &str, heading: &str, paragraphs: Vec<String>, cta: Option<(&str, &str)>, footer: &str) -> Email {
    let (html, text) = layout(heading, &paragraphs, cta, footer);
    Email { to: to.to_string(), subject: subject.to_string(), html, text }
}

fn first_name(name: &str) -> &str {
    name.split_whitespace().next().unwrap_or("there")
}

pub fn verify_email(to: &str, name: &str, link: &str) -> Email {
    build(to, "Confirm your email for NetAffil", "Confirm your email",
        vec![format!("Hi {},", first_name(name)), "Please confirm this is your email address. The link works for 48 hours.".into()],
        Some(("Confirm email", link)),
        "If you didn't create a NetAffil account, you can ignore this email.")
}

pub fn reset_password(to: &str, name: &str, link: &str) -> Email {
    build(to, "Reset your NetAffil password", "Reset your password",
        vec![format!("Hi {},", first_name(name)), "We received a request to reset your password. The link works for one hour and can be used once.".into()],
        Some(("Choose a new password", link)),
        "If you didn't ask for this, ignore this email; your password stays the same.")
}

pub fn welcome(to: &str, name: &str, role: &str, origin: &str) -> Email {
    let (body, cta_label, path) = if role == "advertiser" {
        ("Your brand is set up. Next: create your first campaign, fund your escrow and connect tracking. Affiliates can start promoting as soon as the campaign is funded.", "Open your brand dashboard", "/dashboard/advertiser")
    } else {
        ("Your account is ready. Browse offers, grab your link and start sharing. You'll see every click and sale in your dashboard, and you can withdraw locally once commissions clear.", "Explore offers", "/offers")
    };
    let link = format!("{origin}{path}");
    build(to, "Welcome to NetAffil", &format!("Welcome, {}!", first_name(name)), vec![body.into()], Some((cta_label, &link)), ACCOUNT_FOOTER)
}

pub fn commission_earned(to: &str, name: &str, amount: &str, offer: &str, available_on: &str, origin: &str) -> Email {
    let link = format!("{origin}/dashboard");
    build(to, &format!("You earned {amount} on NetAffil"), &format!("You earned {amount}"),
        vec![format!("Nice work, {}! A sale from your link for {offer} was confirmed.", first_name(name)),
             format!("It's pending until {available_on}, after the brand's hold period, then it becomes available to withdraw.")],
        Some(("View your earnings", &link)), ACCOUNT_FOOTER)
}

pub fn payout_sent(to: &str, name: &str, amount: &str, method: &str, origin: &str) -> Email {
    let link = format!("{origin}/dashboard/payouts");
    build(to, &format!("Your {amount} payout is on its way"), "Payout sent",
        vec![format!("Hi {}, your withdrawal of {amount} has been sent to your {method}.", first_name(name)),
             "Depending on the method it can take from a few minutes to a couple of days to arrive.".into()],
        Some(("See payout history", &link)), ACCOUNT_FOOTER)
}

pub fn payout_failed(to: &str, name: &str, amount: &str, reason: &str, origin: &str) -> Email {
    let link = format!("{origin}/dashboard/payouts");
    build(to, "Your NetAffil payout didn't go through", "Payout didn't go through",
        vec![format!("Hi {}, we couldn't send your withdrawal of {amount}.", first_name(name)),
             format!("Reason: {reason}"),
             "The full amount is back in your available balance. Check your payout details and try again.".into()],
        Some(("Review payout details", &link)), ACCOUNT_FOOTER)
}

pub fn campaigns_paused(to: &str, name: &str, origin: &str) -> Email {
    let link = format!("{origin}/dashboard/advertiser");
    build(to, "Your NetAffil campaigns are paused", "Campaigns paused: escrow is low",
        vec![format!("Hi {}, your escrow balance can't cover the next commission, so your campaigns were paused automatically.", first_name(name)),
             "Top up your escrow and set them live again; your affiliates' links will start working straight away.".into()],
        Some(("Top up escrow", &link)), ACCOUNT_FOOTER)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_links_are_escaped() {
        let e = verify_email("a@b.co", "<script>x</script>", "https://netaffil.com/verify-email?token=a&b");
        assert!(!e.html.contains("<script>"));
        assert!(e.html.contains("token=a&amp;b"));
        assert!(e.text.contains("https://netaffil.com/verify-email?token=a&b"));
    }

    #[test]
    fn first_name_fallback() {
        assert_eq!(first_name("Wanjiru Kamau"), "Wanjiru");
        assert_eq!(first_name("  "), "there");
    }
}
