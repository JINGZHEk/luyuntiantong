import { useEffect, useRef } from 'react';
import { useInterval } from './useInterval';
import { useDashboardStore } from '@/store/dashboardStore';
import { useMonitorStore } from '@/store/monitorStore';
import { generateDashboardUpdate } from '@/mock/dashboardMock';
import { generateMonitorUpdate } from '@/mock/monitorMock';
import { useSettingsStore } from '@/store/settingsStore';
import {
  wsService,
  perceptionToRiskItems,
  decisionToMetrics,
  decisionToTrendPoint,
  toLogEntry,
  toMonitorMessage,
} from '@/services/websocketService';
import { buildWebSocketUrl } from '@/services/runtimeConfig';

export function useMockRealtime() {
  const refreshInterval = useSettingsStore((s) => s.refreshInterval);
  const cloudApiBaseUrl = useSettingsStore((s) => s.cloudApiBaseUrl);
  const updateDashboard = useDashboardStore((s) => s.update);
  const addLog = useDashboardStore((s) => s.addLog);
  const addMessage = useMonitorStore((s) => s.addMessage);
  const setCloudConnected = useMonitorStore((s) => s.setCloudConnected);
  const updateFromPerception = useMonitorStore((s) => s.updateFromPerception);
  const updateFromVehicleStatus = useMonitorStore((s) => s.updateFromVehicleStatus);
  const updateFromDecision = useMonitorStore((s) => s.updateFromDecision);
  const addCloudEvent = useMonitorStore((s) => s.addCloudEvent);
  const metricsRef = useRef(useDashboardStore.getState().metrics);
  const wsConnected = useRef(false);

  // Try to connect to real backend WebSocket
  useEffect(() => {
    wsService.connect(buildWebSocketUrl(cloudApiBaseUrl));

    const unsubscribeConnection = wsService.onConnectionChange((connected) => {
      wsConnected.current = connected;
      setCloudConnected(connected);
    });

    const unsubscribe = wsService.onMessage((type, data) => {
      wsConnected.current = true;

      // Update dashboard from real data
      if (type === 'perception') {
        updateFromPerception(data);
        const riskItems = perceptionToRiskItems(data);
        if (riskItems.length > 0) {
          const trendPoint = {
            ttc: { time: new Date().toLocaleTimeString(), value: 5.0 },
            risk: { time: new Date().toLocaleTimeString(), value: 0.3 },
            brake: { time: new Date().toLocaleTimeString(), value: 0 },
          };
          updateDashboard({}, riskItems, trendPoint, 'live', true);
        }
      }

      if (type === 'decision') {
        updateFromDecision(data);
        const metrics = decisionToMetrics(data, metricsRef.current);
        const trendPoint = decisionToTrendPoint(data);
        const riskItems = useDashboardStore.getState().riskItems;
        updateDashboard(metrics, riskItems, trendPoint, 'live', true);
        metricsRef.current = { ...metricsRef.current, ...metrics };
      }

      if (type === 'vehicle_status') {
        updateFromVehicleStatus(data);
      }

      if (type === 'event') {
        addCloudEvent(data);
      }

      // Always add logs and monitor messages from real data
      const log = toLogEntry(type, data);
      if (log.message) addLog(log);

      const monMsg = toMonitorMessage(type, data);
      addMessage(monMsg);
    });

    return () => {
      unsubscribe();
      unsubscribeConnection();
      wsService.disconnect();
    };
  }, [
    updateDashboard,
    addLog,
    addMessage,
    setCloudConnected,
    updateFromPerception,
    updateFromVehicleStatus,
    updateFromDecision,
    addCloudEvent,
    cloudApiBaseUrl,
  ]);

  // Fallback to mock data when WebSocket is not connected
  useInterval(() => {
    if (wsConnected.current && wsService.connected) return;

    const data = generateDashboardUpdate();
    updateDashboard(data.metrics, data.riskItems, data.trendPoint, 'mock', wsService.connected);
    if (data.log) {
      addLog(data.log);
    }
    const msg = generateMonitorUpdate();
    addMessage(msg);
  }, refreshInterval);

  // Initial data load
  useEffect(() => {
    const data = generateDashboardUpdate();
    updateDashboard(data.metrics, data.riskItems, data.trendPoint, 'mock', wsService.connected);
  }, [updateDashboard]);
}
