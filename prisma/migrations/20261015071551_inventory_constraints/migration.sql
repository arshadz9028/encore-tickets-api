
ALTER TABLE "tiers"
  ADD CONSTRAINT "tiers_price_nonnegative"
    CHECK ("price" >= 0),
  ADD CONSTRAINT "tiers_inventory_nonnegative"
    CHECK ("total_inventory" >= 0);

ALTER TABLE "holds"
  ADD CONSTRAINT "holds_quantity_positive"
    CHECK ("quantity" > 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_quantity_positive"
    CHECK ("quantity" IS NULL OR "quantity" > 0),
  ADD CONSTRAINT "orders_amount_total_nonnegative"
    CHECK ("amount_total" IS NULL OR "amount_total" >= 0),
  ADD CONSTRAINT "orders_amount_refunded_nonnegative"
    CHECK ("amount_refunded" >= 0);
