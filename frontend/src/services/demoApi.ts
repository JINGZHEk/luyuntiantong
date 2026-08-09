import { buildApiUrl } from './runtimeConfig';
import { DemoRunStatus, ScenarioSummary } from '@/types/realtime';

export type DemoStatus = DemoRunStatus;

async function requestDemo<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), init);
  if (!res.ok) {
    throw new Error(`Demo API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const demoApi = {
  list: () => requestDemo<{ total: number; items: ScenarioSummary[] }>('/scenarios'),
  status: () => requestDemo<DemoStatus>('/demo/status'),
  start: (scenarioId = 'GP-01', fps = 10, loop = false) => {
    const params = new URLSearchParams({
      scenario_id: scenarioId,
      fps: String(fps),
      loop: String(loop),
    });
    if (scenarioId === 'light' || scenarioId === 'moderate' || scenarioId === 'heavy') {
      params.set('scenario', scenarioId);
    }
    return requestDemo<DemoStatus>(`/demo/start?${params.toString()}`, { method: 'POST' });
  },
  stop: () => requestDemo<DemoStatus>('/demo/stop', { method: 'POST' }),
  step: (scenarioId = 'GP-01') => {
    const params = new URLSearchParams({ scenario_id: scenarioId });
    if (scenarioId === 'light' || scenarioId === 'moderate' || scenarioId === 'heavy') {
      params.set('scenario', scenarioId);
    }
    return requestDemo<DemoStatus>(`/demo/step?${params.toString()}`, { method: 'POST' });
  },
};
