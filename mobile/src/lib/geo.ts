import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { dapi } from '../api/client';
import type { LocateResult } from '../api/types';

export interface MyLocation {
  locate: LocateResult;
  /** вулиця й номер будинку з геокодера телефона (на web недоступно) */
  street: string | null;
  house: string | null;
}

/**
 * Геолокація клієнта для доставки:
 * дозвіл → координати GPS → Delivery API визначає район (POST /delivery/locate) →
 * геокодер телефона підказує вулицю й будинок.
 */
export async function locateMe(): Promise<MyLocation> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Дозвольте доступ до геолокації в налаштуваннях, щоб визначити адресу автоматично');
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { latitude: lat, longitude: lng } = pos.coords;
  const locate = await dapi.post<LocateResult>('/delivery/locate', { lat, lng });

  let street: string | null = null;
  let house: string | null = null;
  if (Platform.OS !== 'web') {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      street = place?.street ?? null;
      house = place?.streetNumber ?? null;
    } catch {
      // геокодер недоступний (немає мережі / сервісів Google) — адресу користувач уведе сам
    }
  }
  return { locate, street, house };
}

/** Людський опис результату для підказки під кнопкою */
export function locateSummary(r: LocateResult): { text: string; ok: boolean } {
  const km = (v: number) => `${v.toFixed(1).replace('.', ',')} км`;
  if (r.covered && r.zone) return { ok: true, text: `Район: ${r.zone.name} · ${km(r.fromRestaurantKm)} від ресторану` };
  if (r.reason === 'ZONE_INACTIVE' && r.nearest) return { ok: false, text: `${r.nearest.name}: доставка тимчасово не працює` };
  return { ok: false, text: `Ви поза зонами доставки (${km(r.fromRestaurantKm)} від ресторану)` };
}
