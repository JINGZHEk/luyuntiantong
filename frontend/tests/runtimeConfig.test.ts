import {
  DEFAULT_CLOUD_API_BASE_URL,
  buildApiUrl,
  buildWebSocketUrl,
  normalizeApiBaseUrl,
  resolveDefaultCloudApiBaseUrl,
} from '../src/services/runtimeConfig.js';

function assertEqual(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

assertEqual(DEFAULT_CLOUD_API_BASE_URL, 'http://localhost:8011/api/v1');

assertEqual(
  buildWebSocketUrl(),
  'ws://localhost:8011/api/v1/realtime/ws',
);

assertEqual(
  resolveDefaultCloudApiBaseUrl(' http://localhost:8015/api/v1/// '),
  'http://localhost:8015/api/v1',
);

assertEqual(
  resolveDefaultCloudApiBaseUrl(''),
  'http://localhost:8011/api/v1',
);

assertEqual(
  normalizeApiBaseUrl(' http://127.0.0.1:8010/api/v1/// '),
  'http://127.0.0.1:8010/api/v1',
);

assertEqual(
  buildApiUrl('/demo/status', 'http://127.0.0.1:8010/api/v1/'),
  'http://127.0.0.1:8010/api/v1/demo/status',
);

assertEqual(
  buildWebSocketUrl('http://127.0.0.1:8010/api/v1/'),
  'ws://127.0.0.1:8010/api/v1/realtime/ws',
);

assertEqual(
  buildWebSocketUrl('https://cloud.example.com/api/v1'),
  'wss://cloud.example.com/api/v1/realtime/ws',
);
