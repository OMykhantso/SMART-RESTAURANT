-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'DELIVERY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERING';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COURIER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "type" "OrderType" NOT NULL DEFAULT 'DINE_IN',
ALTER COLUMN "reservation_id" DROP NOT NULL,
ALTER COLUMN "table_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "fee" INTEGER NOT NULL,
    "min_order" INTEGER NOT NULL,
    "free_from" INTEGER,
    "travel_min" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "street" VARCHAR(120) NOT NULL,
    "house" VARCHAR(20) NOT NULL,
    "apartment" VARCHAR(20),
    "entrance" VARCHAR(10),
    "floor" VARCHAR(10),
    "comment" VARCHAR(255),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "order_id" INTEGER NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "courier_id" INTEGER,
    "recipient_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "street" VARCHAR(120) NOT NULL,
    "house" VARCHAR(20) NOT NULL,
    "apartment" VARCHAR(20),
    "entrance" VARCHAR(10),
    "floor" VARCHAR(10),
    "comment" VARCHAR(255),
    "fee" INTEGER NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "change_from" INTEGER,
    "eta_at" TIMESTAMPTZ(3),
    "assigned_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_name_key" ON "delivery_zones"("name");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE INDEX "deliveries_courier_id_idx" ON "deliveries"("courier_id");

-- CreateIndex
CREATE INDEX "deliveries_zone_id_idx" ON "deliveries"("zone_id");

-- CreateIndex
CREATE INDEX "orders_type_status_created_at_idx" ON "orders"("type", "status", "created_at");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Доставка: обмеження цілісності, які неможливо описати засобами Prisma Schema
-- ═══════════════════════════════════════════════════════════════════════════

-- Замовлення в залі завжди привʼязане до візиту і столика, доставка — ні
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_type_consistency" CHECK (
    ("type" = 'DINE_IN' AND "reservation_id" IS NOT NULL AND "table_id" IS NOT NULL)
    OR ("type" = 'DELIVERY' AND "reservation_id" IS NULL AND "table_id" IS NULL)
  );

ALTER TABLE "delivery_zones"
  ADD CONSTRAINT "delivery_zones_fee_non_negative" CHECK ("fee" >= 0),
  ADD CONSTRAINT "delivery_zones_min_order_non_negative" CHECK ("min_order" >= 0),
  ADD CONSTRAINT "delivery_zones_free_from_positive" CHECK ("free_from" IS NULL OR "free_from" > 0),
  ADD CONSTRAINT "delivery_zones_travel_range" CHECK ("travel_min" BETWEEN 5 AND 180);

-- У клієнта може бути лише одна адреса за замовчуванням
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" ("user_id") WHERE "is_default";

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_fee_non_negative" CHECK ("fee" >= 0),
  ADD CONSTRAINT "deliveries_phone_format" CHECK ("phone" ~ '^\+380[0-9]{9}$'),
  ADD CONSTRAINT "deliveries_change_only_cash" CHECK ("change_from" IS NULL OR ("payment_method" = 'CASH' AND "change_from" > 0)),
  ADD CONSTRAINT "deliveries_timeline_order" CHECK (
    ("picked_up_at" IS NULL OR "assigned_at" IS NULL OR "picked_up_at" >= "assigned_at")
    AND ("delivered_at" IS NULL OR ("picked_up_at" IS NOT NULL AND "delivered_at" >= "picked_up_at"))
  );

-- Рядок доставки можна створити лише для замовлення типу DELIVERY
CREATE FUNCTION "deliveries_check_order_type"() RETURNS trigger AS $$
BEGIN
  IF (SELECT "type" FROM "orders" WHERE "id" = NEW."order_id") IS DISTINCT FROM 'DELIVERY' THEN
    RAISE EXCEPTION 'deliveries.order_id must reference an order of type DELIVERY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "deliveries_order_type"
  BEFORE INSERT OR UPDATE OF "order_id" ON "deliveries"
  FOR EACH ROW EXECUTE FUNCTION "deliveries_check_order_type"();
