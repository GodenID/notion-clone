-- 004_oauth.sql — link external identity providers to local accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email           TEXT NOT NULL DEFAULT '',
  access_token    TEXT NOT NULL DEFAULT '',
  refresh_token   TEXT NOT NULL DEFAULT '',
  expires_at      INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS oauth_accounts_user ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS oauth_accounts_provider ON oauth_accounts(provider, provider_user_id);