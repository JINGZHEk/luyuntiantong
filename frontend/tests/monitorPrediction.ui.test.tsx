import { render, screen } from '@testing-library/react';
import { PerceptionCards } from '@/widgets/perception-cards/PerceptionCards';
import { useMonitorStore } from '@/store/monitorStore';
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
    status: 'ready',
    model_path: 'models/occaware_stgnn.ts',
    latency_ms: 8.4,
    reason: null,
  },
  objects: [
    {
      track_id: 7,
      class: 'car',
      bbox: [420, 210, 96, 80],
      world_pos: [12.4, 3.8],
      velocity: [4.1, 0.2],
      confidence: 0.91,
      coordinate_status: 'valid',
      prediction_status: 'ready',
      predicted_traj: [[13, 3.8], [14, 3.9]],
    },
  ],
};

describe('perception prediction status', () => {
  beforeEach(() => {
    useMonitorStore.setState({ roadsideData: generateInitialRoadsideData() });
  });

  it('keeps cloud prediction metadata and renders the live processing chips', () => {
    useMonitorStore.getState().updateFromPerception(livePayload);

    const roadsideData = useMonitorStore.getState().roadsideData;
    expect(roadsideData.prediction?.status).toBe('ready');
    expect(roadsideData.objects[0].predictionStatus).toBe('ready');
    expect(roadsideData.objects[0].predictedTrajectory).toHaveLength(2);

    render(<PerceptionCards />);

    expect(screen.getByText('YOLO + DeepSORT')).toBeInTheDocument();
    expect(screen.getByText('STGNN Cloud')).toBeInTheDocument();
    expect(screen.getByText('8.4 ms')).toBeInTheDocument();
    expect(screen.getByText('models/occaware_stgnn.ts')).toBeInTheDocument();
  });

  it('exposes fallback reason and invalid coordinate state', () => {
    useMonitorStore.getState().updateFromPerception({
      ...livePayload,
      prediction: {
        ...livePayload.prediction,
        status: 'fallback',
        latency_ms: null,
        reason: 'checkpoint not found',
      },
      objects: [{
        ...livePayload.objects[0],
        world_pos: undefined,
        coordinate_status: 'invalid',
        prediction_status: 'invalid_coordinate',
        prediction_reason: 'valid world_pos is required for STGNN',
        predicted_traj: [],
      }],
    });

    render(<PerceptionCards />);

    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.getByText('坐标无效')).toBeInTheDocument();
    expect(screen.getByText('checkpoint not found')).toBeInTheDocument();
  });
});
