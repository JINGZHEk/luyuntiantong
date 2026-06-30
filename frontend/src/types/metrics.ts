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
  avgLatency: number;
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
