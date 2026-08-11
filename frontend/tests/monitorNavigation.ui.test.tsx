import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MonitorPage from '@/pages/monitor/MonitorPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  list: vi.fn(),
  status: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  step: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/services/demoApi', () => ({
  demoApi: mocks,
}));

vi.mock('@/store/monitorStore', () => ({
  useMonitorStore: () => ({
    messages: [],
    pageState: { loading: false, error: null },
    setError: vi.fn(),
  }),
}));

vi.mock('@/widgets/connection-panel/ConnectionPanel', () => ({ ConnectionPanel: () => <div /> }));
vi.mock('@/widgets/topic-manager/TopicManager', () => ({ TopicManager: () => <div /> }));
vi.mock('@/widgets/perception-cards/PerceptionCards', () => ({ PerceptionCards: () => <div /> }));
vi.mock('@/widgets/message-panel/MessagePanel', () => ({ MessagePanel: () => <div /> }));
vi.mock('@/shared/components/PageLoading', () => ({ PageLoading: () => <div /> }));
vi.mock('@/shared/components/PageHeader', () => ({ PageHeader: () => <div /> }));

describe('Monitor scenario navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ total: 16, items: [] });
    mocks.status.mockResolvedValue({
      running: false,
      scene_id: 'scene_001',
      scenario_id: 'GP-01',
      frame_index: 0,
      fps: 10,
      available_scenarios: [],
    });
    mocks.start.mockResolvedValue({
      running: true,
      scene_id: 'scene_001',
      scenario_id: 'GP-01',
      frame_index: 0,
      fps: 10,
      loop: false,
      available_scenarios: [],
    });
  });

  it('opens the selected scenario in the 3D screen after start succeeds', async () => {
    render(<MonitorPage />);

    fireEvent.click(screen.getByRole('button', { name: /启动演示/ }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('GP-01', 10, false));
    expect(mocks.navigate).toHaveBeenCalledWith('/zhiluwujie?scenario=GP-01&loop=false');
  });
});
