-- B0.4b: keep sub-cent costs. numeric(10,4) rounded small calls to $0.0000 (one Claude Haiku 5.5
-- call costs about $0.00001), so the ledger under-reported spend. Six decimal places matches the
-- worker's cost table. Widening the scale keeps every existing value.
alter table ledger_entries alter column cost_usd type numeric(12, 6);
alter table builds alter column cost_usd type numeric(12, 6);
