import { create } from 'zustand';
import { SystemMetrics } from '@/types/metrics';
import { LogEntry, TimeSeriesPoint } from '@/types/common';
import { RiskItem, generateInitialTrend } from '@/mock/dashboardMock';
import { LOG_MAX_ENTRIES } from '@/constants/config';
import {
  DashboardDataSource,
  nextDashboardSource,
  shouldAcceptDashboardUpdate,
} from './dashboardDataSource';

interface DashboardState {
  metrics: SystemMetrics;
  riskItems: RiskItem[];
  trendTtc: TimeSeriesPoint[];
  trendRisk: TimeSeriesPoint[];
  trendBrake: TimeSeriesPoint[];
  logs: LogEntry[];
  logFilter: LogEntry['level'] | 'all';
  source: DashboardDataSource;
  pageState: { loading: boolean; error: string | null };
  update: (
    metrics: Partial<SystemMetrics>,
    riskItems: RiskItem[],
    trend: { ttc: TimeSeriesPoint; risk: TimeSeriesPoint; brake: TimeSeriesPoint },
    source?: DashboardDataSource,
    cloudConnected?: boolean,
  ) => void;
  addLog: (log: LogEntry) => void;
  setLogFilter: (filter: LogEntry['level'] | 'all') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialTrend = generateInitialTrend(30);

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: {
    onlineDevices: 15,
    avgLatency: 32.5,
    packetLossRate: 0.012,
    todayHighRiskEvents: 8,
    cpuUsage: 0.45,
    memoryUsage: 0.62,
    networkBandwidth: 850,
  },
  riskItems: [],
  trendTtc: initialTrend.ttc,
  trendRisk: initialTrend.risk,
  trendBrake: initialTrend.brake,
  logs: [],
  logFilter: 'all',
  source: 'mock',
  pageState: { loading: false, error: null },

  update: (metrics, riskItems, trend, source = 'mock', cloudConnected = false) =>
    set((state) => {
      if (!shouldAcceptDashboardUpdate(state.source, source, cloudConnected)) {
        return state;
      }

      return {
        metrics: { ...state.metrics, ...metrics },
        riskItems,
        trendTtc: [...state.trendTtc.slice(-59), trend.ttc],
        trendRisk: [...state.trendRisk.slice(-59), trend.risk],
        trendBrake: [...state.trendBrake.slice(-59), trend.brake],
        source: nextDashboardSource(state.source, source),
      };
    }),

  addLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs].slice(0, LOG_MAX_ENTRIES),
    })),

  setLogFilter: (logFilter) => set({ logFilter }),
  setLoading: (loading) => set((state) => ({ pageState: { ...state.pageState, loading } })),
  setError: (error) => set((state) => ({ pageState: { ...state.pageState, error } })),
}));
