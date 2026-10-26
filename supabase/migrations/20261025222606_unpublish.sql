-- Unpublish (D89): taking a page down is recorded as a publication of its own, so the history
-- keeps both the publish and the unpublish. A build is live on Vercel when its newest Vercel
-- publication (succeeded or unpublished) succeeded.
alter type publish_status add value if not exists 'unpublished';
