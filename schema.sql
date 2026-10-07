CREATE TABLE IF NOT EXISTS votes (
  item_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_item ON votes(item_id);
