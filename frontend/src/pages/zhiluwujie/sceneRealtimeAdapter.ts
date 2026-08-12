import {
  CloudEventPayload,
  DataMode,
  DecisionPayload,
  PerceptionPayload,
  PredictionPayload,
  PooledObjectState,
  PredictionMeta,
  RealtimePayload,
  VehicleStatusPayload,
} from '@/types/realtime';
import {
  DEFAULT_SCENE_COORDINATES,
  SceneCoordinateConfig,
} from './sceneCoordinates';
import { SceneObjectPool } from './sceneObjectPool';

export interface SceneRealtimeSnapshot {
  dataMode: DataMode;
  objects: PooledObjectState[];
  ego: VehicleStatusPayload | null;
  decision: DecisionPayload | null;
  lastEvent: CloudEventPayload | null;
  lastFrameId: number | null;
  lastMessageAt: number | null;
  scenarioId: string | null;
  runId: string | null;
  prediction: PredictionMeta | null;
  predictionMetrics: PredictionMetricSnapshot;
}

export interface PredictionMetricSnapshot {
  ade: number | null;
  fde: number | null;
  adeHistory: number[];
  fdeHistory: number[];
}

export interface SceneRealtimeAdapter {
  onMessage(type: string, data: RealtimePayload): void;
  onConnectionChange(connected: boolean): void;
  tick(): void;
  snapshot(): SceneRealtimeSnapshot;
  clear(): void;
}

export interface SceneRealtimeAdapterOptions {
  now?: () => number;
  coordinateConfig?: SceneCoordinateConfig;
  objectPool?: SceneObjectPool;
  ttlMs?: number;
  staleAfterMs?: number;
  fallbackAfterMs?: number;
}

function frameIdOf(data: RealtimePayload): number | null {
  const frameId = Number((data as { frame_id?: unknown }).frame_id);
  return Number.isFinite(frameId) ? frameId : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function clonePayload<T extends object>(payload: T | null): T | null {
  return payload ? { ...payload } : null;
}

export function createSceneRealtimeAdapter(
  options: SceneRealtimeAdapterOptions = {},
): SceneRealtimeAdapter {
  const now = options.now || (() => Date.now());
  const staleAfterMs = options.staleAfterMs ?? 1000;
  const fallbackAfterMs = options.fallbackAfterMs ?? 3000;
  const pool = options.objectPool || new SceneObjectPool({
    coordinateConfig: options.coordinateConfig || DEFAULT_SCENE_COORDINATES,
    ttlMs: options.ttlMs ?? 1000,
  });

  let connected = true;
  let dataMode: DataMode = 'fallback';
  let lastFrameId: number | null = null;
  let lastMessageAt: number | null = null;
  let ego: VehicleStatusPayload | null = null;
  let decision: DecisionPayload | null = null;
  let lastEvent: CloudEventPayload | null = null;
  let scenarioId: string | null = null;
  let runId: string | null = null;
  let prediction: PredictionMeta | null = null;
  const pendingPredictions = new Map<string, { createdAt: number; points: Array<{ x: number; y: number; t: number }>; errors: number[] }>();
  const adeHistory: number[] = [];
  const fdeHistory: number[] = [];

  const pushMetric = (target: number[], value: number) => {
    if (!Number.isFinite(value)) return;
    target.push(value);
    if (target.length > 100) target.shift();
  };

  const updatePredictionMetrics = (payload: PerceptionPayload, receivedAt: number) => {
    const timestamp = Number(payload.timestamp);
    const actualTimestamp = Number.isFinite(timestamp) ? timestamp : receivedAt;
    for (const object of payload.objects || []) {
      const trackId = object.track_id;
      if (trackId === undefined || !object.world_pos || object.world_pos.length < 2) continue;
      const nodeId = payload.node_id || 'unknown';
      const pending = pendingPredictions.get(`${nodeId}:${String(trackId)}`);
      if (!pending) continue;
      const step = Math.round((actualTimestamp - pending.createdAt) / 100) - 1;
      if (step < 0 || step >= pending.points.length) continue;
      const target = pending.points[step];
      const dx = Number(object.world_pos[0]) - target.x;
      const dy = Number(object.world_pos[1]) - target.y;
      const error = Math.hypot(dx, dy);
      pending.errors[step] = error;
      pushMetric(adeHistory, error);
      if (step === pending.points.length - 1) {
        pushMetric(fdeHistory, error);
        pendingPredictions.delete(`${nodeId}:${String(trackId)}`);
      }
    }
  };

  const predictionMetricSnapshot = (): PredictionMetricSnapshot => ({
    ade: adeHistory.length ? adeHistory.reduce((sum, value) => sum + value, 0) / adeHistory.length : null,
    fde: fdeHistory.length ? fdeHistory.reduce((sum, value) => sum + value, 0) / fdeHistory.length : null,
    adeHistory: [...adeHistory],
    fdeHistory: [...fdeHistory],
  });

  const acceptFrame = (data: RealtimePayload): boolean => {
    const incomingRunId = stringOrNull((data as { run_id?: unknown }).run_id);
    if (incomingRunId && runId && incomingRunId !== runId) {
      lastFrameId = null;
    }
    const frameId = frameIdOf(data);
    const isLoopReset =
      frameId === 0 &&
      lastFrameId !== null &&
      lastFrameId > 0 &&
      incomingRunId !== null &&
      incomingRunId === runId;
    if (frameId !== null && lastFrameId !== null && frameId < lastFrameId && !isLoopReset) {
      return false;
    }
    if (frameId !== null && (lastFrameId === null || frameId > lastFrameId || isLoopReset)) {
      lastFrameId = frameId;
    }
    lastMessageAt = now();
    dataMode = 'live';
    return true;
  };

  const onMessage = (type: string, data: RealtimePayload): void => {
    if (!data || typeof data !== 'object') return;
    if (type === 'prediction') {
      const payload = data as PredictionPayload;
      const timestamp = Number(payload.timestamp);
      const createdAt = Number.isFinite(timestamp) ? timestamp : now();
      const nodeId = payload.node_id || 'unknown';
      for (const item of payload.predictions || []) {
        pendingPredictions.set(`${nodeId}:${String(item.track_id)}`, {
          createdAt,
          points: item.future_traj || [],
          errors: [],
        });
      }
      lastMessageAt = now();
      dataMode = 'live';
      return;
    }
    if (!['perception', 'vehicle_status', 'decision', 'event'].includes(type)) return;
    if (!acceptFrame(data)) return;

    if (type === 'perception') {
      const payload = data as PerceptionPayload;
      const nodeId = payload.node_id || 'unknown';
      const source = payload.source || {};
      if (source.clear === true) pool.clear();
      for (const object of payload.objects || []) {
        pool.upsert(nodeId, object, lastMessageAt || now());
      }
      updatePredictionMetrics(payload, lastMessageAt || now());
      scenarioId = stringOrNull(payload.scenario_id || payload.scenario);
      runId = stringOrNull(payload.run_id);
      prediction = clonePayload(payload.prediction || null);
      return;
    }

    if (type === 'vehicle_status') {
      ego = clonePayload(data as VehicleStatusPayload);
      scenarioId = stringOrNull(ego?.scenario_id || ego?.scenario) || scenarioId;
      runId = stringOrNull(ego?.run_id) || runId;
      return;
    }

    if (type === 'decision') {
      decision = clonePayload(data as DecisionPayload);
      scenarioId = stringOrNull(decision?.scenario_id || decision?.scenario) || scenarioId;
      runId = stringOrNull(decision?.run_id) || runId;
      return;
    }

    lastEvent = clonePayload(data as CloudEventPayload);
    scenarioId = stringOrNull(lastEvent?.scenario_id) || scenarioId;
    runId = stringOrNull(lastEvent?.run_id) || runId;
  };

  return {
    onMessage,

    onConnectionChange(nextConnected: boolean): void {
      connected = nextConnected;
      if (!connected) dataMode = 'fallback';
    },

    tick(): void {
      const current = now();
      pool.tick(current);
      if (!connected || lastMessageAt === null) {
        dataMode = 'fallback';
        return;
      }
      const elapsed = current - lastMessageAt;
      if (elapsed > fallbackAfterMs) dataMode = 'fallback';
      else if (elapsed > staleAfterMs) dataMode = 'stale';
      else dataMode = 'live';
    },

    snapshot(): SceneRealtimeSnapshot {
      return {
        dataMode,
        objects: pool.snapshot(),
        ego: clonePayload(ego),
        decision: clonePayload(decision),
        lastEvent: clonePayload(lastEvent),
        lastFrameId,
        lastMessageAt,
        scenarioId,
        runId,
        prediction: clonePayload(prediction),
        predictionMetrics: predictionMetricSnapshot(),
      };
    },

    clear(): void {
      pool.clear();
      ego = null;
      decision = null;
      lastEvent = null;
      lastFrameId = null;
      lastMessageAt = null;
      scenarioId = null;
      runId = null;
      prediction = null;
      pendingPredictions.clear();
      adeHistory.length = 0;
      fdeHistory.length = 0;
      dataMode = 'fallback';
    },
  };
}
