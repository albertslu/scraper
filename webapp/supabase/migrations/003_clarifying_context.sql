-- Migration 003: Add clarifying_context to scraping_jobs to persist clarification state

ALTER TABLE scraping_jobs 
ADD COLUMN IF NOT EXISTS clarifying_context JSONB;

-- Optional: comment for clarity
COMMENT ON COLUMN scraping_jobs.clarifying_context IS 'Stores clarifying questions and related context (e.g., testResult) when a job requires user clarification.';


