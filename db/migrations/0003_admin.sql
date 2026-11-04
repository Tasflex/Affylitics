-- Staff access and the reason publishers see when a conversion is rejected.

-- Separate from role, so a staff member can also be a publisher or advertiser.
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE conversions ADD COLUMN reject_reason text;

ALTER TABLE users ADD COLUMN suspended_reason text;

-- Websites a user has claimed, proven by a meta tag on the site's home page.
CREATE TABLE sites (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url              text NOT NULL,
    host             text NOT NULL,
    token            text NOT NULL,
    verified_at      timestamptz,
    last_checked_at  timestamptz,
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, host)
);
CREATE INDEX sites_host_verified_idx ON sites(host) WHERE verified_at IS NOT NULL;
