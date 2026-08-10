const BUILTIN_CLOUD_API_BASE_URL = 'http://localhost:8011/api/v1';
const SETTINGS_STORAGE_KEY = 'v2x-settings';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveDefaultCloudApiBaseUrl(envValue?: string | null): string {
  return normalizeApiBaseUrl(envValue || BUILTIN_CLOUD_API_BASE_URL);
}

const viteEnv = (import.meta as ImportMeta & {
  env?: { VITE_CLOUD_API_BASE_URL?: string };
}).env;

export const DEFAULT_CLOUD_API_BASE_URL = resolveDefaultCloudApiBaseUrl(
  viteEnv?.VITE_CLOUD_API_BASE_URL,
);

export function normalizeApiBaseUrl(value?: string | null): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return BUILTIN_CLOUD_API_BASE_URL;
  return trimTrailingSlash(trimmed);
}

export function buildApiUrl(path: string, baseUrl?: string | null): string {
  const base = normalizeApiBaseUrl(baseUrl ?? getCloudApiBaseUrl());
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function buildWebSocketUrl(baseUrl?: string | null): string {
  const normalized = normalizeApiBaseUrl(baseUrl ?? getCloudApiBaseUrl());
  const wsBase = normalized
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://');
  return `${wsBase}/realtime/ws`;
}

export function getCloudApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_CLOUD_API_BASE_URL;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLOUD_API_BASE_URL;
    const parsed = JSON.parse(raw) as { state?: { cloudApiBaseUrl?: string } };
    return normalizeApiBaseUrl(parsed.state?.cloudApiBaseUrl);
  } catch {
    return DEFAULT_CLOUD_API_BASE_URL;
  }
}
