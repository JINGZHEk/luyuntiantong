export type NumericPair = number[];

export type DataMode = 'live' | 'stale' | 'fallback';
export type ScenarioCategory = 'ghost_probe' | 'non_motor' | 'intersection_conflict';

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  category: ScenarioCategory;
  duration_ms: number;
  default_fps: number;
  environment: Record<string, unknown>;
}

export interface DemoRunStatus {
  running: boolean;
  status?: 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
  run_id?: string | null;
  scene_id: string;
  scenario_id?: string | null;
  scenario?: string;
  frame_index: number;
  duration_ms?: number;
  fps: number;
  loop?: boolean;
  available_scenarios: string[];
}

export interface PooledObjectState {
  key: string;
  trackId: string | number;
  nodeId: string;
  class: string;
  modelType: 'person' | 'bicycle' | 'vehicle' | 'generic';
  position: { x: number; y: number; z: number };
  heading: number;
  velocity: NumericPair;
  confidence?: number;
  lastSeenAt: number;
  occlusionLevel: number;
  predictedTrajectory: Array<{ x: number; y: number; z: number }>;
}

export type CoordinateStatus = 'valid' | 'invalid' | 'unknown';
export type PredictionStatus = 'ready' | 'fallback' | 'deferred' | 'invalid_coordinate' | 'local' | 'unknown';

export interface PerceptionSource {
  device_type?: string;
  camera_id?: string;
  input_type?: string;
  detector?: string;
  tracker?: string;
  [key: string]: unknown;
}

export interface PredictionMeta {
  location?: string;
  backend?: string;
  status?: PredictionStatus | string;
  model_path?: string | null;
  latency_ms?: number | null;
  reason?: string | null;
}

export interface CloudObjectPayload {
  track_id?: string | number;
  class?: string;
  bbox?: NumericPair;
  occlusion_level?: number;
  world_pos?: NumericPair;
  velocity?: NumericPair;
  heading?: number;
  confidence?: number;
  coordinate_status?: CoordinateStatus | string;
  coordinate_reason?: string | null;
  prediction_status?: PredictionStatus | string;
  prediction_reason?: string | null;
  predicted_traj?: NumericPair[];
}

export interface TargetObjectPayload {
  track_id?: string | number;
  class?: string;
}

export interface PerceptionPayload {
  schema_version?: number;
  message_type?: string;
  timestamp?: number | string;
  frame_id?: number;
  node_id?: string;
  scene_id?: string;
  source?: PerceptionSource;
  coordinate_frame?: string;
  scenario?: string;
  scenario_id?: string;
  run_id?: string;
  processing_time_ms?: number;
  prediction?: PredictionMeta;
  objects?: CloudObjectPayload[];
}

export interface DecisionPayload {
  schema_version?: number;
  message_type?: string;
  timestamp?: number | string;
  frame_id?: number;
  scene_id?: string;
  scenario?: string;
  scenario_id?: string;
  run_id?: string;
  vehicle_id?: string;
  risk_level?: string;
  ttc?: number;
  collision_prob?: number;
  brake_decel?: number;
  target_object?: TargetObjectPayload;
  mode?: string;
  fusion_weight?: number;
  scenario_event?: Record<string, unknown> | null;
  source?: PerceptionSource;
}

export interface VehicleStatusPayload {
  schema_version?: number;
  message_type?: string;
  timestamp?: number | string;
  frame_id?: number;
  scene_id?: string;
  scenario?: string;
  scenario_id?: string;
  run_id?: string;
  vehicle_id?: string;
  position?: NumericPair;
  velocity?: NumericPair;
  heading?: number;
  speed?: number;
  risk_level?: string;
  mode?: string;
  source?: PerceptionSource;
}

export interface EventObjectPayload {
  type?: string;
  id?: string;
  track_id?: string | number;
}

export interface CloudEventPayload {
  event_id?: string;
  timestamp?: number | string;
  event_type?: string;
  severity?: string;
  scene_id?: string;
  scenario_id?: string;
  run_id?: string;
  min_ttc?: number;
  outcome?: string;
  description?: string;
  involved_objects?: Array<EventObjectPayload | string>;
}

export type RealtimePayload =
  | PerceptionPayload
  | DecisionPayload
  | VehicleStatusPayload
  | CloudEventPayload
  | Record<string, unknown>;
