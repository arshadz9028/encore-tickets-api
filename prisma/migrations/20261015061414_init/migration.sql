-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('active', 'expired', 'converted');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('paid', 'refunded', 'partially_refunded');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "total_inventory" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holds" (
    "id" TEXT NOT NULL,
    "tier_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'active',
    "order_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tier_id" TEXT,
    "quantity" INTEGER,
    "status" "OrderStatus" NOT NULL,
    "amount_total" INTEGER,
    "amount_refunded" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tiers_event_id_idx" ON "tiers"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "holds_order_id_key" ON "holds"("order_id");

-- CreateIndex
CREATE INDEX "holds_tier_id_status_expires_at_idx" ON "holds"("tier_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "orders_tier_id_status_idx" ON "orders"("tier_id", "status");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");

-- AddForeignKey
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holds" ADD CONSTRAINT "holds_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
