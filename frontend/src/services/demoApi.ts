import { buildApiUrl } from './runtimeConfig';

export interface DemoStatus {
  running: boolean;
  frame_index: number;
  scene_id: string;
  scenario: string;
  available_scenarios: string[];
  fps: number;
}

async function requestDemo(path: string, init?: RequestInit): Promise<DemoStatus> {
  const res = await fetch(buildApiUrl(path), init);
  if (!res.ok) {
    throw new Error(`Demo API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const demoApi = {
  status: () => requestDemo('/demo/status'),
  start: (fps = 10, scenario = 'moderate') => {
    const params = new URLSearchParams({ fps: String(fps), scenario });
    return requestDemo(`/demo/start?${params.toString()}`, { method: 'POST' });
  },
  stop: () => requestDemo('/demo/stop', { method: 'POST' }),
  step: (scenario = 'moderate') => {
    const params = new URLSearchParams({ scenario });
    return requestDemo(`/demo/step?${params.toString()}`, { method: 'POST' });
  },
};
