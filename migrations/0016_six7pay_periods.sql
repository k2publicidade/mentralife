-- Each order records what was decided at checkout: days granted and whether the promotional
-- first-period price was used. Older orders have days NULL and are read as 30 days.
ALTER TABLE six7pay_orders ADD COLUMN days INTEGER CHECK(days IS NULL OR (days BETWEEN 1 AND 730));
ALTER TABLE six7pay_orders ADD COLUMN promotional INTEGER NOT NULL DEFAULT 0 CHECK(promotional IN (0,1));
