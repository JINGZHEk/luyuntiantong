import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainLayout } from '@/app/layout/MainLayout';
import { PerceptionCards } from '@/widgets/perception-cards/PerceptionCards';
import { useMonitorStore } from '@/store/monitorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { generateInitialRoadsideData } from '@/mock/monitorMock';

const livePayload = {
  node_id: 'pc_roadside_001',
  source: {
    device_type: 'pc_replay',
    input_type: 'video',
    detector: 'yolo',
    tracker: 'deepsort',
  },
  prediction: {
    location: 'cloud',
    backend: 'stgnn',
    status: 'fallback',
    model_path: null,
    latency_ms: null,
    reason: 'checkpoint not found',
  },
  objects: [
    {
      track_id: 7,
      class: 'car',
      bbox: [420, 210, 96, 80],
      velocity: [4.1, 0.2],
      confidence: 0.91,
      coordinate_status: 'invalid',
      prediction_status: 'invalid_coordinate',
      prediction_reason: 'valid world_pos is required for STGNN',
    },
  ],
};

describe('light theme processing status semantics', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'light' });
    useMonitorStore.setState({ roadsideData: generateInitialRoadsideData() });
  });

  it('shows a readable live processing chain in light mode', () => {
    useMonitorStore.getState().updateFromPerception(livePayload);
    render(<PerceptionCards />);

    expect(screen.getByText('YOLO + DeepSORT')).toBeInTheDocument();
    expect(screen.getByText('STGNN Cloud')).toBeInTheDocument();
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.getByText('坐标无效')).toBeInTheDocument();
  });

  it('keeps shell icon controls keyboard-discoverable in light mode', () => {
    render(
      <MemoryRouter>
        <MainLayout />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '切换到深色主题' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '收起导航菜单' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收起侧边导航' })).toBeInTheDocument();
  });
});
