-- v0.16.5 — head_sha column on jobs.
--
-- Sprint 2: when a deploy preview (Vercel/Netlify/CF) finishes after our
-- council review, GH fires a `check_run` webhook with the head sha of
-- the PR commit. To map that webhook back to the job we already ran we
-- need head_sha indexed on the jobs row. completeJob writes it in from
-- the container callback's `headSha` field.

ALTER TABLE jobs ADD COLUMN head_sha TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_head_sha ON jobs(head_sha);
