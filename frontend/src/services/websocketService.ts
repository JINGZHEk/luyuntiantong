import { RiskItem } from '@/mock/dashboardMock';
import { MonitorMessage } from '@/mock/monitorMock';
import { SystemMetrics } from '@/types/metrics';
import { TimeSeriesPoint, LogEntry } from '@/types/common';
import {
  CloudEventPayload,
  DecisionPayload,
  PerceptionPayload,
  RealtimePayload,
} from '@/types/realtime';
import dayjs from 'dayjs';
import { buildWebSocketUrl } from './runtimeConfig';

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

type MessageHandler = (type: string, data: RealtimePayload) => void;
type ConnectionHandler = (connected: boolean) => void;
interface WebSocketEnvelope {
  type?: string;
  data?: RealtimePayload;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private _connected = false;
  private intentionalClose = false;

  constructor(url: string = buildWebSocketUrl()) {
    this.url = url;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(url: string = buildWebSocketUrl()): void {
    if (url !== this.url) {
      this.disconnect();
      this.url = url;
    }
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.intentionalClose = false;
      this.ws = new WebSocket(this.url);
      const socket = this.ws;

      this.ws.onopen = () => {
        if (this.ws !== socket) return;
        this._connected = true;
        this.notifyConnection();
        this.reconnectAttempts = 0;
        console.log('[WS] Connected to cloud API');
        this.ws?.send(JSON.stringify({ action: 'subscribe', topics: ['perception', 'prediction', 'decision', 'event', 'vehicle_status', 'heartbeat'] }));
      };

      this.ws.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const msg = JSON.parse(event.data) as WebSocketEnvelope;
          if (typeof msg.type === 'string' && msg.data) {
            this.handlers.forEach((handler) => handler(msg.type as string, msg.data as RealtimePayload));
          }
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        if (this.ws !== socket) return;
        this._connected = false;
        this.notifyConnection();
        console.log('[WS] Disconnected');
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        if (this.ws !== socket) return;
        this._connected = false;
        this.notifyConnection();
      };
    } catch (e) {
      this._connected = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.notifyConnection();
  }

  getUrl(): string {
    return this.url;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    handler(this._connected);
    return () => this.connectionHandlers.delete(handler);
  }

  private notifyConnection(): void {
    this.connectionHandlers.forEach((handler) => handler(this._connected));
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

export function perceptionToRiskItems(data: PerceptionPayload): RiskItem[] {
  const objects = data?.objects || [];
  return objects
    .filter((obj) => obj.class === 'person' || (obj.occlusion_level ?? 0) >= 1)
    .map((obj) => {
      const occlusionLevel = obj.occlusion_level ?? 0;
      const riskScore = occlusionLevel >= 2 ? 0.8 : occlusionLevel >= 1 ? 0.5 : 0.3;
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (riskScore > 0.85) riskLevel = 'critical';
      else if (riskScore > 0.65) riskLevel = 'high';
      else if (riskScore > 0.4) riskLevel = 'medium';
      const objectClass = obj.class || 'object';

      return {
        id: `obj_${obj.track_id}`,
        target: `${objectClass.toUpperCase()}-${obj.track_id}`,
        type: obj.class === 'person' ? 'pedestrian' : obj.class === 'bicycle' ? 'bicycle' : 'vehicle',
        riskLevel,
        riskScore: parseFloat(riskScore.toFixed(2)),
        ttc: 5.0,
        location: `(${obj.world_pos?.[0]?.toFixed(1)}, ${obj.world_pos?.[1]?.toFixed(1)})`,
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      } as RiskItem;
    });
}

export function decisionToMetrics(data: DecisionPayload, prev: SystemMetrics): Partial<SystemMetrics> {
  return {
    avgLatency: data.ttc != null ? Math.min(99, Math.max(10, 100 - data.ttc * 10)) : prev.avgLatency,
    todayHighRiskEvents: data.risk_level === 'DANGER' || data.risk_level === 'EMERGENCY'
      ? prev.todayHighRiskEvents + 1
      : prev.todayHighRiskEvents,
  };
}

export function decisionToTrendPoint(data: DecisionPayload): { ttc: TimeSeriesPoint; risk: TimeSeriesPoint; brake: TimeSeriesPoint } {
  const now = dayjs().format('HH:mm:ss');
  const riskMap: Record<string, number> = { SAFE: 0.1, WARNING: 0.4, DANGER: 0.7, EMERGENCY: 0.95 };
  const riskKey = data.risk_level ?? '';
  return {
    ttc: { time: now, value: Math.min(data.ttc ?? 10, 10) },
    risk: { time: now, value: riskMap[riskKey] ?? 0.1 },
    brake: { time: now, value: data.brake_decel ?? 0 },
  };
}

export function toLogEntry(type: string, data: RealtimePayload): LogEntry {
  let message = '';
  let level: LogEntry['level'] = 'info';
  let source = 'CloudCore';

  if (type === 'perception') {
    const payload = data as PerceptionPayload;
    const n = payload.objects?.length ?? 0;
    message = `路侧感知: 检测到 ${n} 个目标`;
    source = payload.node_id || 'RSU-001';
  } else if (type === 'decision') {
    const payload = data as DecisionPayload;
    message = `车端决策: risk=${payload.risk_level} TTC=${payload.ttc?.toFixed(1)}s brake=${payload.brake_decel?.toFixed(1)}m/s²`;
    source = payload.vehicle_id || 'OBU-V01';
    if (payload.risk_level === 'DANGER' || payload.risk_level === 'EMERGENCY') level = 'warn';
  } else if (type === 'event') {
    const payload = data as CloudEventPayload;
    message = `高危事件: ${payload.description || payload.event_type}`;
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

export function toMonitorMessage(type: string, data: RealtimePayload): MonitorMessage {
  const topicMap: Record<string, string> = {
    perception: 'v2x/roadside/perception',
    decision: 'v2x/vehicle/decision',
    vehicle_status: 'v2x/vehicle/state',
    event: 'v2x/cloud/event',
    prediction: 'v2x/cloud/prediction',
    heartbeat: 'v2x/roadside/heartbeat',
  };
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: dayjs().format('HH:mm:ss.SSS'),
    topic: topicMap[type] || `v2x/${type}`,
    payload: JSON.stringify(data).slice(0, 500),
  };
}
