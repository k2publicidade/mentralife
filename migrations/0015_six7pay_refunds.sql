ALTER TABLE six7pay_orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE six7pay_orders ADD COLUMN refund_amount INTEGER;
CREATE INDEX six7pay_orders_paid ON six7pay_orders(paid_at, refunded_at);
