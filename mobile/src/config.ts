import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { storage } from './lib/storage';

const OVERRIDE_KEY = 'sr.apiUrl';
const DELIVERY_OVERRIDE_KEY = 'sr.deliveryUrl';

/**
 * Застосунок працює з ДВОМА окремими системами на одній базі даних:
 *  - Restaurant API (порт 4000) — меню, бронювання, QR check-in, замовлення за столиком, вхід;
 *  - Delivery API (порт 4100) — доставка, адреси, курʼєри.
 * Адреси визначаються автоматично: у режимі розробки Expo знає IP компʼютера, на якому запущено Metro (hostUri).
 * Можна перевизначити через EXPO_PUBLIC_API_URL / EXPO_PUBLIC_DELIVERY_URL або в Профілі → «Сервер».
 */
function detectDefault(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:4000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

/** Delivery API живе на тому ж хості, що й Restaurant API, але на порту 4100. */
function deriveDelivery(restaurantUrl: string): string {
  const env = process.env.EXPO_PUBLIC_DELIVERY_URL;
  if (env) return env.replace(/\/$/, '');
  const m = restaurantUrl.match(/^(https?:\/\/[^/:]+)(?::\d+)?/);
  return m ? `${m[1]}:4100` : 'http://localhost:4100';
}

let baseUrl = detectDefault();
let deliveryOverride: string | null = null;

export const apiConfig = {
  get baseUrl() {
    return baseUrl;
  },
  get deliveryUrl() {
    return deliveryOverride ?? deriveDelivery(baseUrl);
  },
  get deliveryIsCustom() {
    return deliveryOverride !== null;
  },
  defaultUrl: detectDefault(),
  async load() {
    const saved = await storage.get(OVERRIDE_KEY);
    if (saved) baseUrl = saved;
    deliveryOverride = await storage.get(DELIVERY_OVERRIDE_KEY);
  },
  async set(url: string | null) {
    if (url) {
      baseUrl = url.replace(/\/$/, '');
      await storage.set(OVERRIDE_KEY, baseUrl);
    } else {
      baseUrl = detectDefault();
      await storage.remove(OVERRIDE_KEY);
    }
  },
  async setDelivery(url: string | null) {
    if (url && url.replace(/\/$/, '') !== deriveDelivery(baseUrl)) {
      deliveryOverride = url.replace(/\/$/, '');
      await storage.set(DELIVERY_OVERRIDE_KEY, deliveryOverride);
    } else {
      deliveryOverride = null;
      await storage.remove(DELIVERY_OVERRIDE_KEY);
    }
  },
};
