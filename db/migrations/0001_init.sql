-- Affylitics core schema. All money is integer USD cents.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('publisher', 'advertiser', 'admin');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'closed');

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           citext NOT NULL UNIQUE,
    email_verified  boolean NOT NULL DEFAULT false,
    password_hash   text NOT NULL,
    role            user_role NOT NULL,
    display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
    country         char(2) NOT NULL,
    kyc_tier        smallint NOT NULL DEFAULT 0 CHECK (kyc_tier BETWEEN 0 AND 3),
    status          user_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    token_hash  bytea PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    ip_hash     bytea,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE email_tokens (
    token_hash  bytea PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     text NOT NULL CHECK (purpose IN ('verify', 'reset')),
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz
);

-- Advertiser brands. postback_secret signs server-to-server conversions.
CREATE TABLE brands (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         uuid NOT NULL REFERENCES users(id),
    name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    website          text NOT NULL,
    postback_secret  bytea NOT NULL,
    verified         boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brands_owner_idx ON brands(owner_id);

CREATE TYPE payout_model AS ENUM ('cpa', 'cps', 'cpl');
CREATE TYPE offer_status AS ENUM ('draft', 'active', 'paused', 'archived');

CREATE TABLE offers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           uuid NOT NULL REFERENCES brands(id),
    slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title              text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
    description        text NOT NULL DEFAULT '',
    category           text NOT NULL DEFAULT 'general',
    landing_url        text NOT NULL CHECK (landing_url ~ '^https://'),
    model              payout_model NOT NULL,
    -- cpa/cpl: fixed cents per conversion. cps: basis points of the sale amount.
    payout_cents       bigint CHECK (payout_cents IS NULL OR payout_cents > 0),
    payout_bps         integer CHECK (payout_bps IS NULL OR payout_bps BETWEEN 1 AND 9000),
    platform_fee_bps   integer NOT NULL DEFAULT 2000,
    hold_days          integer NOT NULL DEFAULT 30 CHECK (hold_days BETWEEN 0 AND 120),
    cookie_days        integer NOT NULL DEFAULT 30 CHECK (cookie_days BETWEEN 1 AND 120),
    -- NULL means every country is welcome.
    allowed_countries  char(2)[],
    status             offer_status NOT NULL DEFAULT 'draft',
    created_at         timestamptz NOT NULL DEFAULT now(),
    CHECK ((model = 'cps' AND payout_bps IS NOT NULL) OR (model <> 'cps' AND payout_cents IS NOT NULL))
);
CREATE INDEX offers_status_idx ON offers(status, created_at DESC);

CREATE TABLE links (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    publisher_id  uuid NOT NULL REFERENCES users(id),
    offer_id      uuid NOT NULL REFERENCES offers(id),
    sub_id        text CHECK (sub_id IS NULL OR char_length(sub_id) <= 64),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (publisher_id, offer_id, sub_id)
);

CREATE TABLE clicks (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id      uuid NOT NULL REFERENCES links(id),
    ip_hash      bytea NOT NULL,
    ua_hash      bytea NOT NULL,
    country      char(2),
    referer_host text,
    fraud_score  real,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clicks_link_time_idx ON clicks(link_id, created_at DESC);
CREATE INDEX clicks_unscored_idx ON clicks(created_at) WHERE fraud_score IS NULL;

CREATE TYPE conversion_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE conversions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    click_id          uuid NOT NULL REFERENCES clicks(id),
    offer_id          uuid NOT NULL REFERENCES offers(id),
    publisher_id      uuid NOT NULL REFERENCES users(id),
    external_ref      text NOT NULL,
    sale_cents        bigint,
    commission_cents  bigint NOT NULL CHECK (commission_cents > 0),
    fee_cents         bigint NOT NULL CHECK (fee_cents >= 0),
    status            conversion_status NOT NULL DEFAULT 'pending',
    fraud_score       real,
    matures_at        timestamptz NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (offer_id, external_ref)
);
CREATE INDEX conversions_publisher_idx ON conversions(publisher_id, created_at DESC);
CREATE INDEX conversions_maturing_idx ON conversions(matures_at) WHERE status = 'pending';

-- ── Ledger ────────────────────────────────────────────────────────────────
CREATE TYPE account_kind AS ENUM (
    'advertiser_escrow', 'publisher_pending', 'publisher_available',
    'payout_clearing', 'platform_revenue', 'external'
);

CREATE TABLE accounts (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id  uuid REFERENCES users(id),
    kind      account_kind NOT NULL,
    UNIQUE NULLS NOT DISTINCT (owner_id, kind)
);

-- Platform-level accounts have no owner.
INSERT INTO accounts (owner_id, kind) VALUES (NULL, 'platform_revenue'), (NULL, 'external');

CREATE TABLE ledger_txns (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL,
    reference        uuid,
    idempotency_key  text UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
    id           bigserial PRIMARY KEY,
    txn_id       uuid NOT NULL REFERENCES ledger_txns(id),
    account_id   uuid NOT NULL REFERENCES accounts(id),
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(account_id);
CREATE INDEX ledger_entries_txn_idx ON ledger_entries(txn_id);

-- Every transaction must balance to zero, checked at commit.
CREATE FUNCTION ledger_txn_balanced() RETURNS trigger AS $$
DECLARE total bigint;
BEGIN
    SELECT COALESCE(SUM(amount_cents), 0) INTO total FROM ledger_entries WHERE txn_id = NEW.txn_id;
    IF total <> 0 THEN
        RAISE EXCEPTION 'ledger txn % unbalanced by % cents', NEW.txn_id, total;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_balanced
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();

-- Ledger is append-only.
CREATE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger entries are append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

-- Escrow and available balances may never go negative.
CREATE FUNCTION ledger_non_negative() RETURNS trigger AS $$
DECLARE k account_kind; bal bigint;
BEGIN
    SELECT kind INTO k FROM accounts WHERE id = NEW.account_id;
    IF k IN ('advertiser_escrow', 'publisher_available', 'publisher_pending', 'payout_clearing') THEN
        SELECT COALESCE(SUM(amount_cents), 0) INTO bal FROM ledger_entries WHERE account_id = NEW.account_id;
        IF bal < 0 THEN
            RAISE EXCEPTION 'insufficient funds in % account', k USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_non_negative
    AFTER INSERT ON ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_non_negative();

-- ── Payouts ───────────────────────────────────────────────────────────────
CREATE TABLE payout_methods (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES users(id),
    rail               text NOT NULL,
    country            char(2) NOT NULL,
    currency           char(3) NOT NULL,
    details_encrypted  bytea NOT NULL,
    details_hint       text NOT NULL,
    is_default         boolean NOT NULL DEFAULT false,
    removed_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_methods_user_idx ON payout_methods(user_id) WHERE removed_at IS NULL;

CREATE TYPE payout_status AS ENUM ('requested', 'processing', 'paid', 'failed');

CREATE TABLE payouts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id),
    method_id        uuid NOT NULL REFERENCES payout_methods(id),
    amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
    fee_cents        bigint NOT NULL DEFAULT 0,
    local_currency   char(3),
    local_amount     numeric(20, 4),
    fx_rate          numeric(20, 8),
    status           payout_status NOT NULL DEFAULT 'requested',
    provider         text NOT NULL,
    provider_ref     text,
    failure_reason   text,
    idempotency_key  text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX payouts_status_idx ON payouts(status, created_at);

-- ── KYC ───────────────────────────────────────────────────────────────────
CREATE TYPE kyc_status AS ENUM ('started', 'pending', 'approved', 'rejected');

CREATE TABLE kyc_checks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id),
    provider      text NOT NULL,
    tier          smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
    status        kyc_status NOT NULL DEFAULT 'started',
    provider_ref  text,
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kyc_checks_user_idx ON kyc_checks(user_id, created_at DESC);

-- ── Audit ─────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    actor_id    uuid,
    action      text NOT NULL,
    target      text,
    meta        jsonb NOT NULL DEFAULT '{}',
    ip_hash     bytea,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_id, created_at DESC);
