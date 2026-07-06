import { fetchSceneConfig, saveSceneConfig } from '../src/services/settingsApi.js';

type FetchCall = {
  input: string;
  init?: RequestInit;
};

const calls: FetchCall[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ input: String(input), init });
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      scene_id: 'scene_001',
      riskThreshold: 0.8,
      ttcThreshold: 1.8,
      refreshInterval: 5000,
      cloudApiBaseUrl: 'http://localhost:8001/api/v1',
    }),
  } as Response;
}) as typeof fetch;

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

const loaded = await fetchSceneConfig('scene_001', 'http://localhost:8000/api/v1');
assertEqual(loaded.riskThreshold, 0.8);
assertEqual(calls[0].input, 'http://localhost:8000/api/v1/config/scene_001');

await saveSceneConfig(
  'scene_001',
  {
    riskThreshold: 0.75,
    ttcThreshold: 2.5,
    refreshInterval: 1000,
    cloudApiBaseUrl: 'http://localhost:8002/api/v1',
  },
  'http://localhost:8000/api/v1',
);

assertEqual(calls[1].input, 'http://localhost:8000/api/v1/config/scene_001');
assertEqual(calls[1].init?.method, 'PUT');
assertEqual(calls[1].init?.headers instanceof Headers, false);
assertEqual((calls[1].init?.headers as Record<string, string>)['Content-Type'], 'application/json');
assertEqual(
  calls[1].init?.body as string,
  JSON.stringify({
    riskThreshold: 0.75,
    ttcThreshold: 2.5,
    refreshInterval: 1000,
    cloudApiBaseUrl: 'http://localhost:8002/api/v1',
  }),
);
