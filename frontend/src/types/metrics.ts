export interface SystemMetrics {
  onlineDevices: number;
  avgLatency: number;
  packetLossRate: number;
  todayHighRiskEvents: number;
  cpuUsage: number;
  memoryUsage: number;
  networkBandwidth: number;
}

export interface ModelMetrics {
  precision: number;
  recall: number;
  f1Score: number;
  ade: number;
  fde: number;
  occAde?: number;
  occAcc?: number;
  avgLatency: number;
  e2eLatency?: number;
  leadTime?: number;
  fps: number;
}

export interface BaselineComparison {
  model: string;
  precision: number;
  recall: number;
  f1Score: number;
  ade: number;
  fde: number;
  latency: number;
}

export interface AblationResult {
  variant: string;
  f1Score: number;
  ade: number;
  fde: number;
  description: string;
}

export interface TargetStatus {
  key: string;
  metric: string;
  value: number | null;
  target: string;
  status: 'pass' | 'fail' | 'unknown';
  pass: boolean | null;
  unit: string;
}

export interface EvaluationReport {
  source: string;
  scene_id: string;
  sample_count: number;
  event_count: number;
  high_risk_frames: number;
  min_ttc: number | null;
  metrics: ModelMetrics;
  targetStatus?: TargetStatus[];
  baselines: BaselineComparison[];
  ablations: AblationResult[];
}

export interface EvaluationReportDescriptor {
  key: string;
  label: string;
  path?: string;
  available: boolean;
  source: string | null;
  scene_id?: string | null;
  sample_count: number;
}
