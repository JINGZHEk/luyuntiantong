import { RiskItem } from '@/mock/dashboardMock';
import { MonitorMessage } from '@/mock/monitorMock';
import { SystemMetrics } from '@/types/metrics';
import { TimeSeriesPoint, LogEntry } from '@/types/common';
import dayjs from 'dayjs';

const WS_URL = 'ws://localhost:8000/api/v1/realtime/ws';
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

type MessageHandler = (type: string, data: any) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private _connected = false;

  constructor(url: string = WS_URL) {
    this.url = url;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectAttempts = 0;
        console.log('[WS] Connected to cloud API');
        this.ws?.send(JSON.stringify({ action: 'subscribe', topics: ['perception', 'decision', 'event', 'vehicle_status', 'heartbeat'] }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handlers.forEach((handler) => handler(msg.type, msg.data));
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        console.log('[WS] Disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch (e) {
      this._connected = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, RECONNECT_INTERVAL);
  }
}

export const wsService = new WebSocketService();

// ─── Data transformation helpers ───

export function perceptionToRiskItems(data: any): RiskItem[] {
  const objects = data?.objects || [];
  return objects
    .filter((obj: any) => obj.class === 'person' || obj.occlusion_level >= 1)
    .map((obj: any) => {
      const riskScore = obj.occlusion_level >= 2 ? 0.8 : obj.occlusion_level >= 1 ? 0.5 : 0.3;
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (riskScore > 0.85) riskLevel = 'critical';
      else if (riskScore > 0.65) riskLevel = 'high';
      else if (riskScore > 0.4) riskLevel = 'medium';

      return {
        id: `obj_${obj.track_id}`,
        target: `${obj.class.toUpperCase()}-${obj.track_id}`,
        type: obj.class === 'person' ? 'pedestrian' : obj.class === 'bicycle' ? 'bicycle' : 'vehicle',
        riskLevel,
        riskScore: parseFloat(riskScore.toFixed(2)),
        ttc: 5.0,
        location: `(${obj.world_pos?.[0]?.toFixed(1)}, ${obj.world_pos?.[1]?.toFixed(1)})`,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      } as RiskItem;
    });
}

export function decisionToMetrics(data: any, prev: SystemMetrics): Partial<SystemMetrics> {
  return {
    avgLatency: data.ttc != null ? Math.min(99, Math.max(10, 100 - data.ttc * 10)) : prev.avgLatency,
    todayHighRiskEvents: data.risk_level === 'DANGER' || data.risk_level === 'EMERGENCY'
      ? prev.todayHighRiskEvents + 1
      : prev.todayHighRiskEvents,
  };
}

export function decisionToTrendPoint(data: any): { ttc: TimeSeriesPoint; risk: TimeSeriesPoint; brake: TimeSeriesPoint } {
  const now = dayjs().format('HH:mm:ss');
  const riskMap: Record<string, number> = { SAFE: 0.1, WARNING: 0.4, DANGER: 0.7, EMERGENCY: 0.95 };
  return {
    ttc: { time: now, value: Math.min(data.ttc ?? 10, 10) },
    risk: { time: now, value: riskMap[data.risk_level] ?? 0.1 },
    brake: { time: now, value: data.brake_decel ?? 0 },
  };
}

export function toLogEntry(type: string, data: any): LogEntry {
  let message = '';
  let level: LogEntry['level'] = 'info';
  let source = 'CloudCore';

  if (type === 'perception') {
    const n = data?.objects?.length ?? 0;
    message = `路侧感知: 检测到 ${n} 个目标`;
    source = data?.node_id || 'RSU-001';
  } else if (type === 'decision') {
    message = `车端决策: risk=${data.risk_level} TTC=${data.ttc?.toFixed(1)}s brake=${data.brake_decel?.toFixed(1)}m/s²`;
    source = data?.vehicle_id || 'OBU-V01';
    if (data.risk_level === 'DANGER' || data.risk_level === 'EMERGENCY') level = 'warn';
  } else if (type === 'event') {
    message = `高危事件: ${data.description || data.event_type}`;
    level = 'error';
    source = 'EventDetector';
  }

  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
    level,
    source,
    message,
  };
}

export function toMonitorMessage(type: string, data: any): MonitorMessage {
  const topicMap: Record<string, string> = {
    perception: 'v2x/roadside/perception',
    decision: 'v2x/vehicle/decision',
    vehicle_status: 'v2x/vehicle/state',
    event: 'v2x/cloud/event',
    heartbeat: 'v2x/roadside/heartbeat',
  };
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: dayjs().format('HH:mm:ss.SSS'),
    topic: topicMap[type] || `v2x/${type}`,
    payload: JSON.stringify(data).slice(0, 500),
  };
}
