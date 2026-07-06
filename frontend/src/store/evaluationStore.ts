import { create } from 'zustand';
import {
  ModelMetrics,
  BaselineComparison,
  AblationResult,
  TargetStatus,
  EvaluationReportDescriptor,
} from '@/types/metrics';
import { getModelMetrics, getBaselineComparisons, getAblationResults, getTargetStatus } from '@/mock/evaluationMock';
import { fetchEvaluationReport, fetchEvaluationReports } from '@/services/evaluationApi';

interface EvaluationState {
  metrics: ModelMetrics;
  baselines: BaselineComparison[];
  ablations: AblationResult[];
  targetStatus: TargetStatus[];
  reports: EvaluationReportDescriptor[];
  selectedReportKey: string;
  source: 'mock' | 'live';
  summary: {
    sampleCount: number;
    eventCount: number;
    highRiskFrames: number;
    minTtc: number | null;
  };
  pageState: { loading: boolean; error: string | null };
  loadData: (reportKey?: string | null) => Promise<void>;
  selectReport: (reportKey: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const toNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const normalizeMetrics = (metrics: Partial<ModelMetrics>): ModelMetrics => ({
  precision: toNumber(metrics.precision),
  recall: toNumber(metrics.recall),
  f1Score: toNumber(metrics.f1Score),
  ade: toNumber(metrics.ade),
  fde: toNumber(metrics.fde),
  occAde: typeof metrics.occAde === 'number' ? metrics.occAde : undefined,
  occAcc: typeof metrics.occAcc === 'number' ? metrics.occAcc : undefined,
  avgLatency: toNumber(metrics.avgLatency),
  e2eLatency: typeof metrics.e2eLatency === 'number' ? metrics.e2eLatency : undefined,
  leadTime: typeof metrics.leadTime === 'number' ? metrics.leadTime : undefined,
  fps: toNumber(metrics.fps),
});

const normalizeBaselines = (baselines: BaselineComparison[]): BaselineComparison[] => baselines.map((baseline) => ({
  model: baseline.model,
  precision: toNumber(baseline.precision),
  recall: toNumber(baseline.recall),
  f1Score: toNumber(baseline.f1Score),
  ade: toNumber(baseline.ade),
  fde: toNumber(baseline.fde),
  latency: toNumber(baseline.latency),
}));

const normalizeAblations = (ablations: AblationResult[]): AblationResult[] => ablations.map((ablation) => ({
  variant: ablation.variant,
  f1Score: toNumber(ablation.f1Score),
  ade: toNumber(ablation.ade),
  fde: toNumber(ablation.fde),
  description: ablation.description,
}));

export const useEvaluationStore = create<EvaluationState>((set) => ({
  metrics: getModelMetrics(),
  baselines: [],
  ablations: [],
  targetStatus: getTargetStatus(),
  reports: [],
  selectedReportKey: 'mini_split',
  source: 'mock',
  summary: {
    sampleCount: 0,
    eventCount: 0,
    highRiskFrames: 0,
    minTtc: null,
  },
  pageState: { loading: false, error: null },

  loadData: async (reportKey) => {
    set({ pageState: { loading: true, error: null } });
    try {
      const reports = await fetchEvaluationReports();
      const selectedReportKey = reportKey
        ?? reports.find((item) => item.key === 'mini_split' && item.available)?.key
        ?? reports.find((item) => item.available)?.key
        ?? 'mini_split';
      const report = await fetchEvaluationReport('scene_001', selectedReportKey);
      set({
        metrics: normalizeMetrics(report.metrics),
        baselines: normalizeBaselines(report.baselines),
        ablations: normalizeAblations(report.ablations),
        targetStatus: report.targetStatus ?? [],
        reports,
        selectedReportKey,
        source: 'live',
        summary: {
          sampleCount: report.sample_count,
          eventCount: report.event_count,
          highRiskFrames: report.high_risk_frames,
          minTtc: report.min_ttc,
        },
        pageState: { loading: false, error: null },
      });
    } catch (error) {
      set({
        metrics: getModelMetrics(),
        baselines: getBaselineComparisons(),
        ablations: getAblationResults(),
        targetStatus: getTargetStatus(),
        reports: [],
        selectedReportKey: 'mini_split',
        source: 'mock',
        summary: {
          sampleCount: 0,
          eventCount: 0,
          highRiskFrames: 0,
          minTtc: null,
        },
        pageState: { loading: false, error: null },
      });
    }
  },

  selectReport: async (reportKey) => {
    await useEvaluationStore.getState().loadData(reportKey);
  },
  setLoading: (loading) => set((s) => ({ pageState: { ...s.pageState, loading } })),
  setError: (error) => set((s) => ({ pageState: { ...s.pageState, error } })),
}));
