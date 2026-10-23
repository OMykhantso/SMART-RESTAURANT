-- Геолокація: центр і радіус зони доставки, щоб визначати район за координатами клієнта
ALTER TABLE "delivery_zones"
  ADD COLUMN "center_lat" DOUBLE PRECISION,
  ADD COLUMN "center_lng" DOUBLE PRECISION,
  ADD COLUMN "radius_km" DOUBLE PRECISION;

ALTER TABLE "delivery_zones"
  -- координати задаються лише разом
  ADD CONSTRAINT "delivery_zones_center_pair" CHECK (("center_lat" IS NULL) = ("center_lng" IS NULL)),
  ADD CONSTRAINT "delivery_zones_center_range" CHECK (
    "center_lat" IS NULL OR ("center_lat" BETWEEN -90 AND 90 AND "center_lng" BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT "delivery_zones_radius_range" CHECK ("radius_km" IS NULL OR "radius_km" BETWEEN 0.5 AND 50);
