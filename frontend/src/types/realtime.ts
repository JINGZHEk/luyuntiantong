export type NumericPair = number[];

export interface CloudObjectPayload {
  track_id?: string | number;
  class?: string;
  occlusion_level?: number;
  world_pos?: NumericPair;
  velocity?: NumericPair;
  confidence?: number;
}

export interface TargetObjectPayload {
  track_id?: string | number;
  class?: string;
}

export interface PerceptionPayload {
  timestamp?: number | string;
  frame_id?: number;
  node_id?: string;
  scenario?: string;
  processing_time_ms?: number;
  objects?: CloudObjectPayload[];
}

export interface DecisionPayload {
  timestamp?: number | string;
  frame_id?: number;
  vehicle_id?: string;
  risk_level?: string;
  ttc?: number;
  collision_prob?: number;
  brake_decel?: number;
  target_object?: TargetObjectPayload;
}

export interface VehicleStatusPayload {
  timestamp?: number | string;
  frame_id?: number;
  vehicle_id?: string;
  position?: NumericPair;
  velocity?: NumericPair;
  heading?: number;
  speed?: number;
  risk_level?: string;
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
  min_ttc?: number;
  outcome?: string;
  description?: string;
  involved_objects?: EventObjectPayload[];
}

export type RealtimePayload =
  | PerceptionPayload
  | DecisionPayload
  | VehicleStatusPayload
  | CloudEventPayload
  | Record<string, unknown>;
