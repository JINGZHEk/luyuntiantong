import { Position, RiskLevel } from './common';

export interface ReplayEvent {
  eventId: string;
  timestamp: string;
  type: string;
  riskLevel: RiskLevel;
  duration: number;
  location: string;
  description: string;
  frameCount: number;
}

export interface ReplayFrame {
  frameIndex: number;
  timestamp: string;
  vehicles: ReplayVehicle[];
  pedestrians: ReplayPedestrian[];
  obstacles: ReplayObstacle[];
  riskScore: number;
  ttc: number;
  brakeActive: boolean;
}

export interface ReplayVehicle {
  id: string;
  position: Position;
  heading: number;
  speed: number;
  predictedPath: Position[];
}

export interface ReplayPedestrian {
  id: string;
  position: Position;
  heading: number;
  speed: number;
  isOccluded: boolean;
  riskLevel: RiskLevel;
}

export interface ReplayObstacle {
  id: string;
  position: Position;
  size: { width: number; height: number; depth: number };
  type: 'parked_car' | 'bus' | 'truck' | 'wall' | 'pillar';
}

export interface PlaybackState {
  isPlaying: boolean;
  speed: number;
  currentFrame: number;
  totalFrames: number;
  keyframes: number[];
}
