import { SystemMetrics, ModelMetrics } from '@/types/metrics';
import { LogEntry, RiskLevel, TimeSeriesPoint } from '@/types/common';
import { randomBetween, randomId, randomInt, pickRandom } from '@/shared/utils/helpers';
import dayjs from 'dayjs';

export interface RiskItem {
  id: string;
  target: string;
  type: 'pedestrian' | 'vehicle' | 'bicycle';
  riskLevel: RiskLevel;
  riskScore: number;
  ttc: number;
  location: string;
  timestamp: string;
}

export interface DashboardUpdate {
  metrics: Partial<SystemMetrics>;
  riskItems: RiskItem[];
  trendPoint: { ttc: TimeSeriesPoint; risk: TimeSeriesPoint; brake: TimeSeriesPoint };
  log: LogEntry | null;
}

const locations = ['路口A-东侧', '路口A-西侧', '路口B-南侧', '路口B-北侧', '路口C-中央'];
const logMessages = [
  '路侧感知数据融合完成',
  '检测到遮挡区域行人',
  'V2X消息广播成功',
  '车端收到预警信息',
  '风险评估更新: TTC={ttc}s',
  '制动信号已触发',
  '云端融合延迟: {latency}ms',
  '设备心跳检测正常',
  '传感器校准完成',
  '数据链路状态检查通过',
];
const logSources = ['RSU-001', 'OBU-V01', 'CloudCore', 'FusionEngine', 'RiskEval'];

function generateRiskItems(count: number): RiskItem[] {
  return Array.from({ length: count }, () => {
    const riskScore = randomBetween(0.1, 1.0);
    let riskLevel: RiskLevel = 'low';
    if (riskScore > 0.85) riskLevel = 'critical';
    else if (riskScore > 0.65) riskLevel = 'high';
    else if (riskScore > 0.4) riskLevel = 'medium';
    return {
      id: randomId(),
      target: `PED-${randomInt(100, 999)}`,
      type: pickRandom(['pedestrian', 'vehicle', 'bicycle'] as const),
      riskLevel,
      riskScore: parseFloat(riskScore.toFixed(2)),
      ttc: parseFloat(randomBetween(0.5, 8.0).toFixed(1)),
      location: pickRandom(locations),
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    };
  });
}

export function generateDashboardUpdate(): DashboardUpdate {
  const now = dayjs().format('HH:mm:ss');
  const shouldLog = Math.random() > 0.3;
  let log: LogEntry | null = null;
  if (shouldLog) {
    const level = pickRandom(['info', 'info', 'info', 'warn', 'error', 'debug'] as const);
    let msg = pickRandom(logMessages);
    msg = msg.replace('{ttc}', randomBetween(1, 5).toFixed(1));
    msg = msg.replace('{latency}', randomInt(10, 80).toString());
    log = {
      id: randomId(),
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      level,
      source: pickRandom(logSources),
      message: msg,
    };
  }

  return {
    metrics: {
      onlineDevices: randomInt(12, 18),
      avgLatency: parseFloat(randomBetween(15, 65).toFixed(1)),
      packetLossRate: parseFloat(randomBetween(0.001, 0.05).toFixed(3)),
      todayHighRiskEvents: randomInt(3, 25),
    },
    riskItems: generateRiskItems(randomInt(4, 8)),
    trendPoint: {
      ttc: { time: now, value: parseFloat(randomBetween(1.5, 6.0).toFixed(2)) },
      risk: { time: now, value: parseFloat(randomBetween(0.2, 0.9).toFixed(2)) },
      brake: { time: now, value: randomInt(0, 3) },
    },
    log,
  };
}

export function generateInitialTrend(count: number) {
  const ttc: TimeSeriesPoint[] = [];
  const risk: TimeSeriesPoint[] = [];
  const brake: TimeSeriesPoint[] = [];
  for (let i = count; i >= 0; i--) {
    const time = dayjs().subtract(i * 2, 'second').format('HH:mm:ss');
    ttc.push({ time, value: parseFloat(randomBetween(1.5, 6.0).toFixed(2)) });
    risk.push({ time, value: parseFloat(randomBetween(0.2, 0.9).toFixed(2)) });
    brake.push({ time, value: randomInt(0, 3) });
  }
  return { ttc, risk, brake };
}
