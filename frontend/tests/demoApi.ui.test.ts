import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoApi } from '../src/services/demoApi';

const fetchMock = vi.fn();

describe('demoApi scenario endpoints', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ running: false, frame_index: 0, scene_id: 'scene_001', fps: 10, available_scenarios: [] }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
  });

  it('lists the seeded scenario library', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ total: 16, items: [{ scenario_id: 'GP-08', name: '行人犹豫折返' }] }),
    });

    const result = await demoApi.list();

    expect(result.total).toBe(16);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scenarios',
      undefined,
    );
  });

  it('starts a selected scenario with fps and loop parameters', async () => {
    await demoApi.start('GP-08', 12, true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/demo/start?scenario_id=GP-08&fps=12&loop=true');
    expect(init.method).toBe('POST');
  });

  it('keeps legacy scenario aliases in the request', async () => {
    await demoApi.start('moderate', 10, false);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('scenario_id=moderate');
    expect(url).toContain('scenario=moderate');
  });
});
