import { RiskLevel } from './common';

export interface CloudEvent {
  eventId: string;
  timestamp: string;
  type: 'ghost_probe' | 'near_miss' | 'collision_warning' | 'brake_trigger';
  riskLevel: RiskLevel;
  vehicleId: string;
  pedestrianId: string | null;
  location: string;
  ttc: number;
  riskScore: number;
  resolved: boolean;
  description: string;
}
