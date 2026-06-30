import { Position, Velocity, RiskLevel } from './common';

export interface VehicleState {
  vehicleId: string;
  timestamp: string;
  position: Position;
  velocity: Velocity;
  heading: number;
  speed: number;
  acceleration: number;
  brakeStatus: BrakeStatus;
  decisionInfo: DecisionInfo;
}

export interface BrakeStatus {
  isActive: boolean;
  intensity: number;
  triggerSource: 'driver' | 'v2x' | 'adas' | 'none';
  triggerTime: string | null;
}

export interface DecisionInfo {
  riskScore: number;
  riskLevel: RiskLevel;
  ttc: number;
  suggestedAction: 'none' | 'warn' | 'brake' | 'emergency_stop';
  predictedTrajectory: Position[];
  targetId: string | null;
}
