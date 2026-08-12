CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interaction_type VARCHAR(32) NOT NULL,
  day_key DATE,
  context_version VARCHAR(160),
  question TEXT,
  response_text TEXT,
  response_json JSONB,
  provider VARCHAR(32) NOT NULL DEFAULT 'deepseek',
  model VARCHAR(120) NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_created
  ON ai_interactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_summary
  ON ai_interactions(user_id, interaction_type, day_key, created_at DESC);
