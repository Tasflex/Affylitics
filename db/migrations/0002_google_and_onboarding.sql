-- Sign in with Google, and the onboarding flow.

-- Google users may have no password, and pick their role and country during onboarding.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;
ALTER TABLE users ALTER COLUMN country DROP NOT NULL;

-- NULL until the user finishes onboarding. Everyone who signed up before this existed counts as done.
ALTER TABLE users ADD COLUMN onboarded_at timestamptz;
UPDATE users SET onboarded_at = created_at;

-- Answers from onboarding: channels, niches, audience size, target markets.
ALTER TABLE users ADD COLUMN profile jsonb NOT NULL DEFAULT '{}';

CREATE TABLE user_identities (
    provider    text NOT NULL,
    subject     text NOT NULL,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       citext,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
CREATE INDEX user_identities_user_idx ON user_identities(user_id);
