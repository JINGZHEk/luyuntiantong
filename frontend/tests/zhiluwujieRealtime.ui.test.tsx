import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ZhiluWujiePage from '../src/pages/zhiluwujie/ZhiluWujiePage';

const realtimeMocks = vi.hoisted(() => ({
  messageHandlers: [] as Array<(type: string, data: Record<string, unknown>) => void>,
  connectionHandlers: [] as Array<(connected: boolean) => void>,
}));

vi.mock('../src/services/websocketService', () => ({
  wsService: {
    connect: vi.fn(),
    onMessage: (handler: (type: string, data: Record<string, unknown>) => void) => {
      realtimeMocks.messageHandlers.push(handler);
      return () => {
        realtimeMocks.messageHandlers = realtimeMocks.messageHandlers.filter((item) => item !== handler);
      };
    },
    onConnectionChange: (handler: (connected: boolean) => void) => {
      realtimeMocks.connectionHandlers.push(handler);
      handler(true);
      return () => {
        realtimeMocks.connectionHandlers = realtimeMocks.connectionHandlers.filter((item) => item !== handler);
      };
    },
  },
}));

vi.mock('../src/pages/zhiluwujie/scene', () => {
  class MockScene {
    frame = 0;
    scenarioTime = 0;
    metrics = { cpu: 70, nodes: 142, fps: 28, latency: 12, inferMs: 28, gpuUtil: 62, decisionMs: 5, lossRate: 0.2 };
    trafficMetrics = { vehicles: 0, avgSpeed: 0, density: '0', congestion: 0, flowHistory: [40], laneStats: [] };
    rsuData = [];
    onLog?: (message: string, type: string) => void;
    init = vi.fn();
    start = vi.fn();
    dispose = vi.fn();
    enterScene = vi.fn();
    setDataMode = vi.fn();
    applyPerception = vi.fn();
    applyVehicleStatus = vi.fn();
    applyDecision = vi.fn();
    applyEvent = vi.fn();
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

describe('ZhiluWujie realtime data source', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    realtimeMocks.messageHandlers = [];
    realtimeMocks.connectionHandlers = [];
  });

  it('shows LIVE for realtime data and FALLBACK after the timeout', () => {
    render(<ZhiluWujiePage />);
    act(() => vi.advanceTimersByTime(3300));
    fireEvent.click(screen.getByRole('button', { name: '接入孪生系统' }));

    act(() => {
      realtimeMocks.messageHandlers.forEach((handler) => handler('perception', {
        frame_id: 1,
        timestamp: 1000,
        scene_id: 'scene_001',
        scenario_id: 'GP-01',
        run_id: 'run-001',
        node_id: 'roadside-001',
        objects: [],
        prediction: { status: 'deferred' },
      }));
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('GP-01')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4100));
    expect(screen.getByText('FALLBACK')).toBeInTheDocument();
  });

  it('keeps throughput bars deterministic and rolls the latest traffic flow sample', () => {
    render(<ZhiluWujiePage />);
    act(() => vi.advanceTimersByTime(3300));
    fireEvent.click(screen.getByRole('button', { name: '接入孪生系统' }));

    const throughputLabel = screen.getByText('全网数据吞吐量');
    const initialBars = throughputLabel.parentElement?.querySelectorAll('[style*="height"]');
    expect(initialBars).toHaveLength(25);
    expect(initialBars?.[0]).toHaveStyle({ height: '42%' });
    expect(initialBars?.[24]).toHaveStyle({ height: '96%' });
    expect(initialBars?.[24]).toHaveStyle({ background: 'rgba(var(--hud-accent-rgb), 0.55)' });

    act(() => vi.advanceTimersByTime(250));

    const bars = throughputLabel.parentElement?.querySelectorAll('[style*="height"]');
    expect(bars).toHaveLength(25);
    expect(bars?.[24]).toHaveStyle({ height: '100%' });
  });
});
