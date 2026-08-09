import { describe, expect, it } from 'vitest';
import { mapRoadHeading, mapRoadPoint } from './sceneCoordinates';
import { createSceneRealtimeAdapter } from './sceneRealtimeAdapter';

function perceptionPayload(frameId: number, timestamp = frameId * 100): Record<string, unknown> {
  return {
    frame_id: frameId,
    timestamp,
    scene_id: 'scene_001',
    scenario_id: 'GP-01',
    run_id: 'run-001',
    node_id: 'roadside-001',
    objects: [
      {
        track_id: 100,
        class: 'unknown-obstacle',
        world_pos: [10, 4],
        velocity: [1, 0],
        heading: 90,
        occlusion_level: 2,
        predicted_traj: [[11, 4]],
      },
    ],
    prediction: { location: 'cloud', backend: 'stgnn', status: 'deferred' },
  };
}

describe('scene coordinate mapping', () => {
  it('uses the single road-coordinate mapping', () => {
    expect(mapRoadPoint([10, 4], {
      originX: 2,
      originZ: -3,
      scale: 2,
      rotationDeg: 0,
    })).toEqual({ x: 10, y: 0, z: 17 });
    expect(mapRoadHeading(90, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('scene realtime adapter', () => {
  it('drops older frames and creates unknown-class objects safely', () => {
    let current = 1000;
    const adapter = createSceneRealtimeAdapter({ now: () => current });

    adapter.onMessage('perception', perceptionPayload(8) as never);
    adapter.onMessage('perception', perceptionPayload(7, 900) as never);

    const snapshot = adapter.snapshot();
    expect(snapshot.lastFrameId).toBe(8);
    expect(snapshot.lastMessageAt).toBe(1000);
    expect(snapshot.objects).toHaveLength(1);
    expect(snapshot.objects[0].key).toBe('roadside-001:100');
    expect(snapshot.objects[0].modelType).toBe('generic');
    expect(snapshot.objects[0].position).toEqual({ x: 4, y: 0, z: 10 });
    expect(snapshot.prediction?.status).toBe('deferred');

    current = 2201;
    adapter.tick();
    expect(adapter.snapshot().dataMode).toBe('stale');
    current = 4101;
    adapter.tick();
    expect(adapter.snapshot().dataMode).toBe('fallback');
  });

  it('retains an object for the TTL and then removes it', () => {
    let current = 1000;
    const adapter = createSceneRealtimeAdapter({ now: () => current, ttlMs: 1000 });
    adapter.onMessage('perception', perceptionPayload(1) as never);

    current = 1950;
    adapter.tick();
    expect(adapter.snapshot().objects).toHaveLength(1);
    current = 2101;
    adapter.tick();
    expect(adapter.snapshot().objects).toHaveLength(0);
  });

  it('recovers live mode after a disconnected websocket reconnects', () => {
    const current = 1000;
    const adapter = createSceneRealtimeAdapter({ now: () => current });
    adapter.onConnectionChange(false);
    expect(adapter.snapshot().dataMode).toBe('fallback');
    adapter.onConnectionChange(true);
    adapter.onMessage('perception', perceptionPayload(1) as never);
    expect(adapter.snapshot().dataMode).toBe('live');
  });
});
