-- B7.2a: a percent or amount off must say how much. A missing value made the check "unknown",
-- which Postgres lets through; compare against a value that is always there instead.
alter table public.offers drop constraint offers_price;
alter table public.offers add constraint offers_price check (
  (price_change = 'none' and price_value is null)
  or (price_change = 'percent' and coalesce(price_value, 0) > 0 and price_value < 100)
  or (price_change = 'amount' and coalesce(price_value, 0) > 0)
);
