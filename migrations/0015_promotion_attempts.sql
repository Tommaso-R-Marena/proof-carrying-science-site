-- Non-destructive promotion retry: a fresh branch, PR and CI for every attempt.
-- Previous decisions remain in the append-only audit archive.
ALTER TABLE production_promotions
  ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt BETWEEN 1 AND 50);
