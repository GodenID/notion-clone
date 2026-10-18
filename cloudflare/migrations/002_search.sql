-- 002_search.sql — full text search over pages and blocks
CREATE VIRTUAL TABLE IF NOT EXISTS page_search USING fts5(
  title,
  body,
  page_id UNINDEXED,
  owner_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS search_meta (
  page_id     TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  indexed_at  INTEGER NOT NULL
);