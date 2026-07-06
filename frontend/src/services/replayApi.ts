import dayjs from 'dayjs';
import { ReplayEvent, ReplayFrame, ReplayPedestrian, ReplayVehicle } from '@/types/event';
import { RiskLevel } from '@/types/common';
import { DecisionPayload, PerceptionPayload, VehicleStatusPayload } from '@/types/realtime';
import { buildApiUrl } from './runtimeConfig';

interface CloudEventRow {
  event_id: string;
  timestamp: number;
  event_type: string;
  severity: string;
  scene_id: string;
  min_ttc: number;
  outcome: string;
  description: string;
  involved_objects: string;
  replay_start_frame: number | null;
  replay_end_frame: number | null;
}

interface CloudFrameRow {
  frame_id: number;
  timestamp: number;
  scene_id: string;
  perception_data?: PerceptionPayload;
  decision_data?: DecisionPayload;
  vehicle_status?: VehicleStatusPayload;
}

function riskFromSeverity(severity: string): RiskLevel {
  return severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium';
}

function riskFromDecision(level?: string): RiskLevel {
  if (level === 'EMERGENCY') return 'critical';
  if (level === 'DANGER') return 'high';
  if (level === 'WARNING') return 'medium';
  return 'low';
}

export function cloudEventToReplayEvent(event: CloudEventRow): ReplayEvent {
  const start = event.replay_start_frame ?? 0;
  const end = event.replay_end_frame ?? start;
  return {
    eventId: event.event_id,
    timestamp: dayjs(event.timestamp).format('YYYY-MM-DD HH:mm:ss'),
    type: event.event_type,
    riskLevel: riskFromSeverity(event.severity),
    duration: Math.max(1, Math.round((end - start) / 10)),
    location: event.scene_id,
    description: event.description || event.event_type,
    frameCount: Math.max(1, end - start + 1),
  };
}

function vehicleFromFrame(frame: CloudFrameRow): ReplayVehicle {
  const status = frame.vehicle_status || {};
  const pos = status.position || [0, 0];
  const speed = status.speed ?? 0;
  const vx = status.velocity?.[0] ?? -speed;
  const path = Array.from({ length: 5 }, (_, i) => ({
    x: (pos[0] ?? 0) + vx * 0.1 * (i + 1),
    y: 0,
    z: pos[1] ?? 0,
  }));
  return {
    id: status.vehicle_id || 'vehicle_001',
    position: { x: pos[0] ?? 0, y: 0, z: pos[1] ?? 0 },
    heading: status.heading ?? 180,
    speed,
    predictedPath: path,
  };
}

function pedestriansFromFrame(frame: CloudFrameRow): ReplayPedestrian[] {
  const decision = frame.decision_data || {};
  const riskLevel = riskFromDecision(decision.risk_level);
  return (frame.perception_data?.objects || [])
    .filter((obj) => obj.class === 'person')
    .map((obj) => ({
      id: String(obj.track_id),
      position: { x: obj.world_pos?.[0] ?? 0, y: 0, z: obj.world_pos?.[1] ?? 0 },
      heading: 0,
      speed: Math.abs(obj.velocity?.[1] ?? 0),
      isOccluded: (obj.occlusion_level ?? 0) > 0,
      riskLevel,
    }));
}

export function cloudFrameToReplayFrame(frame: CloudFrameRow, index: number): ReplayFrame {
  const decision = frame.decision_data || {};
  return {
    frameIndex: index,
    timestamp: dayjs(frame.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS'),
    vehicles: [vehicleFromFrame(frame)],
    pedestrians: pedestriansFromFrame(frame),
    obstacles: [
      {
        id: 'parked-car-001',
        position: { x: 15, y: 0, z: 3 },
        size: { width: 4, height: 2, depth: 2 },
        type: 'parked_car',
      },
    ],
    riskScore: decision.collision_prob ?? 0,
    ttc: decision.ttc ?? 10,
    brakeActive: (decision.brake_decel ?? 0) > 0,
  };
}

async function requestJson<T>(path: string): Promise<T> {
  const res = await fetch(buildApiUrl(path));
  if (!res.ok) throw new Error(`Replay API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const replayApi = {
  async listEvents(): Promise<ReplayEvent[]> {
    const data = await requestJson<{ events: CloudEventRow[] }>('/events?limit=100');
    return data.events.map(cloudEventToReplayEvent);
  },

  async getEventFrames(eventId: string): Promise<ReplayFrame[]> {
    const data = await requestJson<CloudEventRow & { replay_frames?: CloudFrameRow[] }>(`/events/${eventId}`);
    return (data.replay_frames || []).map(cloudFrameToReplayFrame);
  },
};
