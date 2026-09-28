import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { storage } from './lib/storage';

const OVERRIDE_KEY = 'sr.apiUrl';

/**
 * Адреса backend визначається автоматично: у режимі розробки Expo знає IP комп'ютера,
 * на якому запущено Metro (hostUri) — backend працює на тому ж комп'ютері на порту 4000.
 * Можна перевизначити через EXPO_PUBLIC_API_URL або в Профілі → «Сервер».
 */
function detectDefault(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:4000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

let baseUrl = detectDefault();

export const apiConfig = {
  get baseUrl() {
    return baseUrl;
  },
  defaultUrl: detectDefault(),
  async load() {
    const saved = await storage.get(OVERRIDE_KEY);
    if (saved) baseUrl = saved;
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
};
