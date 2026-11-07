-- B4.2: a store's Theme Access password (D121), for editable pages in Shopify.
--
-- Shopify refuses theme-file writes to apps without an exemption (D90), so editable pages' theme
-- files go up with the store owner's Theme Access password (Shopify's free app) through Shopify
-- CLI. Like the store's other secret it lives in Vault: the row keeps only its id and its last
-- four characters. Written by the worker (service role); members read their org's rows as before.

alter table store_connections
  add column theme_secret_id uuid,
  add column theme_last4     text;
