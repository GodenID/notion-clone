-- 001_init.sql — core workspace schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#2383e2',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS teamspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🚀',
  color       TEXT NOT NULL DEFAULT '#2f6b4f',
  description TEXT NOT NULL DEFAULT '',
  slug        TEXT NOT NULL UNIQUE,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teamspace_members (
  teamspace_id TEXT NOT NULL REFERENCES teamspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (teamspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  title        TEXT NOT NULL DEFAULT '',
  icon         TEXT NOT NULL DEFAULT '📄',
  cover        INTEGER,
  section      TEXT NOT NULL DEFAULT 'private',
  teamspace_id TEXT REFERENCES teamspaces(id) ON DELETE SET NULL,
  parent_id    TEXT REFERENCES pages(id) ON DELETE SET NULL,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite     INTEGER NOT NULL DEFAULT 0,
  locked       INTEGER NOT NULL DEFAULT 0,
  full_width   INTEGER NOT NULL DEFAULT 0,
  small_text   INTEGER NOT NULL DEFAULT 0,
  font         TEXT NOT NULL DEFAULT 'default',
  slug         TEXT NOT NULL,
  trashed_at   INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_owner ON pages(owner_id, trashed_at);
CREATE INDEX IF NOT EXISTS pages_teamspace ON pages(teamspace_id);
CREATE INDEX IF NOT EXISTS pages_parent ON pages(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_unique ON pages(workspace_id, slug);

CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blocks_page ON blocks(page_id, position);

CREATE TABLE IF NOT EXISTS page_options (
  page_id      TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  payload      TEXT NOT NULL DEFAULT '{}',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  page_id     TEXT REFERENCES pages(id) ON DELETE CASCADE,
  teamspace_id TEXT REFERENCES teamspaces(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  anchor      TEXT,
  replies     TEXT NOT NULL DEFAULT '[]',
  reactions   TEXT NOT NULL DEFAULT '{}',
  resolved    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_page ON comments(page_id);
CREATE INDEX IF NOT EXISTS comments_teamspace ON comments(teamspace_id);

CREATE TABLE IF NOT EXISTS uploads (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  ext         TEXT NOT NULL DEFAULT '',
  mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
  size        INTEGER NOT NULL DEFAULT 0,
  sha256      TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads(owner_id);