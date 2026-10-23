/**
 * Геолокація доставки: визначення зони за координатами клієнта.
 *
 * Кожна зона має орієнтовний центр і радіус обслуговування. Точка належить зоні,
 * якщо відстань до центру не більша за радіус; якщо підходять кілька зон
 * (райони межують), обираємо ту, до центру якої точка відносно ближча (d / r).
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoZone {
  id: number;
  name: string;
  isActive: boolean;
  centerLat: number | null;
  centerLng: number | null;
  radiusKm: number | null;
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Відстань по поверхні Землі (формула гаверсинуса), км */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ZoneMatch<Z extends GeoZone> {
  zone: Z;
  distanceKm: number;
  /** відстань відносно радіуса зони: ≤ 1 — точка всередині */
  ratio: number;
}

/**
 * Зони, відсортовані від найбільш до найменш відповідної точці.
 * Зони без центру/радіуса не беруть участі; неактивні — лише якщо includeInactive.
 */
export function rankZones<Z extends GeoZone>(zones: Z[], point: GeoPoint, includeInactive = false): ZoneMatch<Z>[] {
  return zones
    .filter((z) => z.centerLat != null && z.centerLng != null && z.radiusKm && (includeInactive || z.isActive))
    .map((zone) => {
      const d = distanceKm(point, { lat: zone.centerLat!, lng: zone.centerLng! });
      return { zone, distanceKm: d, ratio: d / zone.radiusKm! };
    })
    .sort((a, b) => a.ratio - b.ratio);
}

/** Зона, що обслуговує точку, або null — точка поза всіма активними зонами */
export function locateZone<Z extends GeoZone>(zones: Z[], point: GeoPoint): ZoneMatch<Z> | null {
  const best = rankZones(zones, point)[0];
  return best && best.ratio <= 1 ? best : null;
}
