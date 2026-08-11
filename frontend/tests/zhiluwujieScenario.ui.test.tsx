import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ZhiluWujiePage from '../src/pages/zhiluwujie/ZhiluWujiePage';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

vi.mock('../src/services/demoApi', () => ({
  demoApi: mocks,
}));

vi.mock('../src/services/websocketService', () => ({
  wsService: {
    connect: vi.fn(),
    onMessage: vi.fn(() => () => undefined),
    onConnectionChange: vi.fn(() => () => undefined),
  },
}));

vi.mock('../src/pages/zhiluwujie/scene', () => {
  class MockScene {
    frame = 0;
    scenarioTime = 0;
    metrics = { cpu: 70, nodes: 142, fps: 28, latency: 12, inferMs: 28, gpuUtil: 62, decisionMs: 5, lossRate: 0.2 };
    trafficMetrics = { vehicles: 0, avgSpeed: 0, density: '0', congestion: 0, flowHistory: [], laneStats: [] };
    rsuData = [];
    init = vi.fn();
    start = vi.fn();
    dispose = vi.fn();
    enterScene = vi.fn();
    setScenarioVisual = vi.fn();
    setDataMode = vi.fn();
    getScenarioMetrics = vi.fn(() => ({
      egoSpeed: 45,
      ttc: '> 5.0s',
      riskLevel: 0,
      phase: 'CRUISE',
      isDanger: false,
      decisionMode: 'cooperative',
      fusionWeight: '1.00',
      brakeDecel: '0.0 m/s²',
      collisionProb: '0.02',
    }));
    getTrafficSignalData = vi.fn(() => []);
    setMode = vi.fn();
    setBloomStrength = vi.fn();
  }
  return { ZhiluWujieScene: MockScene };
});

describe('3D screen scenario linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ running: true, scenario_id: 'NM-02', loop: false });
  });

  it('renders the query scenario and switches the URL and demo together', async () => {
    render(
      <MemoryRouter initialEntries={['/zhiluwujie?scenario=GP-06&loop=false']}>
        <ZhiluWujiePage autoEnter />
        <LocationProbe />
      </MemoryRouter>,
    );

    const selector = screen.getByLabelText('3D场景选择');
    expect(selector).toHaveValue('GP-06');
    expect(screen.getByText('低照度路口由路侧红外感知发现突然横穿行人。')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'NM-02' } });

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('NM-02', 10, false));
    expect(screen.getByTestId('location-search')).toHaveTextContent('scenario=NM-02');
    expect(screen.getByText('外卖骑手沿相反方向横穿机动车道，TTC 快速下降。')).toBeInTheDocument();
  });
});
