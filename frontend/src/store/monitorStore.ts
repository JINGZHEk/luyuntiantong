import { create } from 'zustand';
import { MonitorMessage } from '@/mock/monitorMock';
import { RoadsidePerception } from '@/types/roadside';
import { VehicleState } from '@/types/vehicle';
import { CloudEvent } from '@/types/cloud';
import { Position } from '@/types/common';
import {
  generateInitialRoadsideData,
  generateInitialVehicleData,
  generateInitialCloudEvents,
} from '@/mock/monitorMock';
import { MESSAGE_MAX_ENTRIES, MQTT_TOPICS } from '@/constants/config';
import { buildWebSocketUrl } from '@/services/runtimeConfig';
import { wsService } from '@/services/websocketService';
import {
  CloudObjectPayload,
  CloudEventPayload,
  DecisionPayload,
  PerceptionPayload,
  CoordinateStatus,
  PredictionStatus,
  VehicleStatusPayload,
} from '@/types/realtime';

function normalizeCoordinateStatus(value: unknown): CoordinateStatus {
  if (value === 'valid' || value === 'invalid') return value;
  return 'unknown';
}

function normalizePredictionStatus(value: unknown, fallback: PredictionStatus = 'unknown'): PredictionStatus {
  if (
    value === 'ready'
    || value === 'fallback'
    || value === 'deferred'
    || value === 'invalid_coordinate'
    || value === 'local'
  ) {
    return value;
  }
  return fallback;
}

function pairToPosition(pair: number[] | undefined): Position | null {
  if (!pair || pair.length < 2 || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) {
    return null;
  }
  return { x: pair[0], y: 0, z: pair[1] };
}

interface ConnectionState {
  connected: boolean;
  broker: string;
  clientId: string;
  uptime: number;
  source: 'live' | 'mock';
}

interface TopicSubscription {
  topic: string;
  active: boolean;
  messageCount: number;
}

interface MonitorState {
  connection: ConnectionState;
  topics: TopicSubscription[];
  messages: MonitorMessage[];
  roadsideData: RoadsidePerception;
  vehicleData: VehicleState;
  cloudEvents: CloudEvent[];
  pageState: { loading: boolean; error: string | null };
  toggleConnection: () => void;
  toggleTopic: (topic: string) => void;
  addMessage: (msg: MonitorMessage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCloudConnected: (connected: boolean) => void;
  updateFromPerception: (payload: PerceptionPayload) => void;
  updateFromVehicleStatus: (payload: VehicleStatusPayload) => void;
  updateFromDecision: (payload: DecisionPayload) => void;
  addCloudEvent: (payload: CloudEventPayload) => void;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  connection: {
    connected: true,
    broker: 'ws://localhost:9001',
    clientId: 'v2x-platform-demo',
    uptime: 3600,
    source: 'mock',
  },
  topics: Object.values(MQTT_TOPICS).map((topic) => ({
    topic,
    active: true,
    messageCount: 0,
  })),
  messages: [],
  roadsideData: generateInitialRoadsideData(),
  vehicleData: generateInitialVehicleData(),
  cloudEvents: generateInitialCloudEvents(),
  pageState: { loading: false, error: null },

  toggleConnection: () => {
    const state = get();
    if (state.connection.connected) {
      wsService.disconnect();
    } else {
      wsService.connect();
    }
    // 连接状态由 wsService 的 onConnectionChange 回调更新
  },

  toggleTopic: (topic) =>
    set((state) => ({
      topics: state.topics.map((t) =>
        t.topic === topic ? { ...t, active: !t.active } : t,
      ),
    })),

  addMessage: (msg) =>
    set((state) => ({
      messages: [msg, ...state.messages].slice(0, MESSAGE_MAX_ENTRIES),
      topics: state.topics.map((t) =>
        t.topic === msg.topic ? { ...t, messageCount: t.messageCount + 1 } : t,
      ),
    })),

  setLoading: (loading) => set((state) => ({ pageState: { ...state.pageState, loading } })),
  setError: (error) => set((state) => ({ pageState: { ...state.pageState, error } })),
  setCloudConnected: (connected) =>
    set((state) => ({
      connection: {
        ...state.connection,
        connected,
        broker: buildWebSocketUrl(),
        source: connected ? 'live' : 'mock',
      },
    })),
  updateFromPerception: (payload) =>
    set((state) => {
      const topLevelStatus = normalizePredictionStatus(payload.prediction?.status, 'deferred');
      const prediction = {
        location: payload.prediction?.location || 'unknown',
        backend: payload.prediction?.backend || 'unknown',
        status: topLevelStatus,
        model_path: payload.prediction?.model_path ?? null,
        latency_ms: payload.prediction?.latency_ms ?? null,
        reason: payload.prediction?.reason ?? null,
      };

      return {
        roadsideData: {
          ...state.roadsideData,
          sensorId: payload.node_id || state.roadsideData.sensorId,
          timestamp: new Date(payload.timestamp || Date.now()).toISOString(),
          source: payload.source,
          coordinateFrame: payload.coordinate_frame,
          prediction,
          objects: (payload.objects || []).map((obj: CloudObjectPayload) => {
            const position = pairToPosition(obj.world_pos);
            const predictedTrajectory = (obj.predicted_traj || [])
              .map((point) => pairToPosition(point))
              .filter((point): point is Position => point !== null);
            return {
              id: String(obj.track_id),
              type: obj.class === 'person' ? 'pedestrian' : obj.class === 'truck' ? 'truck' : 'vehicle',
              position: position || { x: 0, y: 0, z: 0 },
              velocity: { vx: obj.velocity?.[0] ?? 0, vy: obj.velocity?.[1] ?? 0 },
              heading: 0,
              confidence: obj.confidence ?? 0,
              isOccluded: (obj.occlusion_level ?? 0) > 0,
              riskLevel: (obj.occlusion_level ?? 0) >= 2 ? 'high' : (obj.occlusion_level ?? 0) === 1 ? 'medium' : 'low',
              ttc: null,
              bbox: obj.bbox,
              coordinateStatus: normalizeCoordinateStatus(obj.coordinate_status),
              coordinateReason: obj.coordinate_reason ?? null,
              predictionStatus: normalizePredictionStatus(obj.prediction_status, topLevelStatus),
              predictionReason: obj.prediction_reason ?? null,
              predictedTrajectory,
            };
          }),
          occlusionZones: state.roadsideData.occlusionZones,
          trafficState: state.roadsideData.trafficState,
        },
      };
    }),
  updateFromVehicleStatus: (payload) =>
    set((state) => ({
      vehicleData: {
        ...state.vehicleData,
        vehicleId: payload.vehicle_id || state.vehicleData.vehicleId,
        timestamp: new Date(payload.timestamp || Date.now()).toISOString(),
        position: { x: payload.position?.[0] ?? 0, y: 0, z: payload.position?.[1] ?? 0 },
        velocity: { vx: payload.velocity?.[0] ?? 0, vy: payload.velocity?.[1] ?? 0 },
        speed: payload.speed ?? state.vehicleData.speed,
        heading: payload.heading ?? state.vehicleData.heading,
      },
    })),
  updateFromDecision: (payload) =>
    set((state) => {
      const riskMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
        SAFE: 'low',
        WARNING: 'medium',
        DANGER: 'high',
        EMERGENCY: 'critical',
      };
      const riskLevel = riskMap[payload.risk_level ?? ''] || 'low';
      return {
        vehicleData: {
          ...state.vehicleData,
          decisionInfo: {
            ...state.vehicleData.decisionInfo,
            riskLevel,
            riskScore: payload.collision_prob ?? state.vehicleData.decisionInfo.riskScore,
            ttc: payload.ttc ?? state.vehicleData.decisionInfo.ttc,
            suggestedAction:
              payload.risk_level === 'EMERGENCY'
                ? 'emergency_stop'
                : payload.risk_level === 'DANGER'
                  ? 'brake'
                  : payload.risk_level === 'WARNING'
                    ? 'warn'
                    : 'none',
            targetId: payload.target_object?.track_id ? String(payload.target_object.track_id) : null,
          },
          brakeStatus: {
            isActive: (payload.brake_decel ?? 0) > 0,
            intensity: Math.min(1, (payload.brake_decel ?? 0) / 8),
            triggerSource: (payload.brake_decel ?? 0) > 0 ? 'v2x' : 'none',
            triggerTime: (payload.brake_decel ?? 0) > 0 ? new Date(payload.timestamp || Date.now()).toISOString() : null,
          },
        },
      };
    }),
  addCloudEvent: (payload) =>
    set((state) => {
      const eventTypeMap: Record<string, 'ghost_probe' | 'near_miss' | 'collision_warning' | 'brake_trigger'> = {
        ghost_probe: 'ghost_probe',
        near_miss: 'near_miss',
        collision_warning: 'collision_warning',
        brake_trigger: 'brake_trigger',
      };
      const riskLevel: 'high' | 'critical' = payload.severity === 'critical' ? 'critical' : 'high';
      return {
        cloudEvents: [
          {
            eventId: payload.event_id || `evt_${Date.now()}`,
            timestamp: new Date(payload.timestamp || Date.now()).toISOString(),
            type: payload.event_type ? eventTypeMap[payload.event_type] || 'ghost_probe' : 'ghost_probe',
            riskLevel,
            vehicleId: payload.involved_objects?.[0]?.id || 'vehicle_001',
            pedestrianId: payload.involved_objects?.[1]?.track_id ? String(payload.involved_objects[1].track_id) : null,
            location: 'intersection-demo',
            ttc: payload.min_ttc ?? 0,
            riskScore: riskLevel === 'critical' ? 0.95 : 0.78,
            resolved: payload.outcome === 'avoided',
            description: payload.description || 'Ghost-probe event',
          },
          ...state.cloudEvents,
        ].slice(0, 20),
      };
    }),
}));
