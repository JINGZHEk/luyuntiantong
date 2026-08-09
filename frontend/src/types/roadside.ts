import { Position, Velocity, RiskLevel } from './common';
import {
  CoordinateStatus,
  PerceptionSource,
  PredictionMeta,
  PredictionStatus,
} from './realtime';

export interface RoadsidePerception {
  sensorId: string;
  timestamp: string;
  objects: DetectedObject[];
  occlusionZones: OcclusionZone[];
  trafficState: TrafficState;
  source?: PerceptionSource;
  coordinateFrame?: string;
  prediction?: PredictionMeta;
}

export interface DetectedObject {
  id: string;
  type: 'vehicle' | 'pedestrian' | 'bicycle' | 'truck';
  position: Position;
  velocity: Velocity;
  heading: number;
  confidence: number;
  isOccluded: boolean;
  riskLevel: RiskLevel;
  ttc: number | null;
  bbox?: number[];
  coordinateStatus?: CoordinateStatus;
  coordinateReason?: string | null;
  predictionStatus?: PredictionStatus;
  predictionReason?: string | null;
  predictedTrajectory?: Position[];
}

export interface OcclusionZone {
  id: string;
  vertices: Position[];
  severity: RiskLevel;
  potentialPedestrians: number;
}

export interface TrafficState {
  phase: 'red' | 'yellow' | 'green';
  countdown: number;
  crosswalkActive: boolean;
}
