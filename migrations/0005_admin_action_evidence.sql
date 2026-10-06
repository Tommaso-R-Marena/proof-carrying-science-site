-- Immutable supporting evidence for administrative actions.
-- Binary data is chunked as base64 TEXT so no new R2/billing setup is required.

CREATE TABLE IF NOT EXISTS admin_evidence_files (
  id TEXT PRIMARY KEY,
  uploader_user_id TEXT NOT NULL,
  uploader_email TEXT NOT NULL DEFAULT '',
  uploader_name TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  subject_user_id TEXT,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(uploader_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_admin_evidence_uploader ON admin_evidence_files(uploader_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_evidence_subject ON admin_evidence_files(subject_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_evidence_sha ON admin_evidence_files(sha256_hex);

CREATE TABLE IF NOT EXISTS admin_evidence_chunks (
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  PRIMARY KEY(file_id,chunk_index),
  FOREIGN KEY(file_id) REFERENCES admin_evidence_files(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS admin_evidence_files_no_update
BEFORE UPDATE ON admin_evidence_files
BEGIN
  SELECT RAISE(ABORT,'PCS admin evidence metadata is immutable');
END;

CREATE TRIGGER IF NOT EXISTS admin_evidence_files_no_delete
BEFORE DELETE ON admin_evidence_files
BEGIN
  SELECT RAISE(ABORT,'PCS admin evidence files cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS admin_evidence_chunks_no_update
BEFORE UPDATE ON admin_evidence_chunks
BEGIN
  SELECT RAISE(ABORT,'PCS admin evidence chunks are immutable');
END;

CREATE TRIGGER IF NOT EXISTS admin_evidence_chunks_no_delete
BEFORE DELETE ON admin_evidence_chunks
BEGIN
  SELECT RAISE(ABORT,'PCS admin evidence chunks cannot be deleted');
END;
