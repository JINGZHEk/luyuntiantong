import { Position, Velocity, RiskLevel } from './common';

export interface RoadsidePerception {
  sensorId: string;
  timestamp: string;
  objects: DetectedObject[];
  occlusionZones: OcclusionZone[];
  trafficState: TrafficState;
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
