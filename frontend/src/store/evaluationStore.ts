import { create } from 'zustand';
import { ModelMetrics, BaselineComparison, AblationResult } from '@/types/metrics';
import { getModelMetrics, getBaselineComparisons, getAblationResults } from '@/mock/evaluationMock';

interface EvaluationState {
  metrics: ModelMetrics;
  baselines: BaselineComparison[];
  ablations: AblationResult[];
  pageState: { loading: boolean; error: string | null };
  loadData: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useEvaluationStore = create<EvaluationState>((set) => ({
  metrics: getModelMetrics(),
  baselines: [],
  ablations: [],
  pageState: { loading: false, error: null },

  loadData: () => {
    set({ pageState: { loading: true, error: null } });
    setTimeout(() => {
      set({
        baselines: getBaselineComparisons(),
        ablations: getAblationResults(),
        pageState: { loading: false, error: null },
      });
    }, 800);
  },

  setLoading: (loading) => set((s) => ({ pageState: { ...s.pageState, loading } })),
  setError: (error) => set((s) => ({ pageState: { ...s.pageState, error } })),
}));
