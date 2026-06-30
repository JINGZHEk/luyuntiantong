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

export function useMockRealtime() {
  const refreshInterval = useSettingsStore((s) => s.refreshInterval);
  const updateDashboard = useDashboardStore((s) => s.update);
  const addLog = useDashboardStore((s) => s.addLog);
  const addMessage = useMonitorStore((s) => s.addMessage);
  const metricsRef = useRef(useDashboardStore.getState().metrics);
  const wsConnected = useRef(false);

  // Try to connect to real backend WebSocket
  useEffect(() => {
    wsService.connect();

    const unsubscribe = wsService.onMessage((type, data) => {
      wsConnected.current = true;

      // Update dashboard from real data
      if (type === 'perception') {
        const riskItems = perceptionToRiskItems(data);
        if (riskItems.length > 0) {
          const trendPoint = {
            ttc: { time: new Date().toLocaleTimeString(), value: 5.0 },
            risk: { time: new Date().toLocaleTimeString(), value: 0.3 },
            brake: { time: new Date().toLocaleTimeString(), value: 0 },
          };
          updateDashboard({}, riskItems, trendPoint);
        }
      }

      if (type === 'decision') {
        const metrics = decisionToMetrics(data, metricsRef.current);
        const trendPoint = decisionToTrendPoint(data);
        const riskItems = useDashboardStore.getState().riskItems;
        updateDashboard(metrics, riskItems, trendPoint);
        metricsRef.current = { ...metricsRef.current, ...metrics };
      }

      // Always add logs and monitor messages from real data
      const log = toLogEntry(type, data);
      if (log.message) addLog(log);

      const monMsg = toMonitorMessage(type, data);
      addMessage(monMsg);
    });

    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  }, [updateDashboard, addLog, addMessage]);

  // Fallback to mock data when WebSocket is not connected
  useInterval(() => {
    if (wsConnected.current && wsService.connected) return;

    const data = generateDashboardUpdate();
    updateDashboard(data.metrics, data.riskItems, data.trendPoint);
    if (data.log) {
      addLog(data.log);
    }
    const msg = generateMonitorUpdate();
    addMessage(msg);
  }, refreshInterval);

  // Initial data load
  useEffect(() => {
    const data = generateDashboardUpdate();
    updateDashboard(data.metrics, data.riskItems, data.trendPoint);
  }, [updateDashboard]);
}
