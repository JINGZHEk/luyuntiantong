import { fetchEvaluationReport, fetchEvaluationReports } from '../src/services/evaluationApi.js';

type FetchCall = {
  input: string;
};

const calls: FetchCall[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  calls.push({ input: String(input) });
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => {
      if (String(input).includes('/evaluation/reports')) {
        return {
          reports: [
            {
              key: 'stgnn_checkpoint',
              label: 'OccAware-STGNN Checkpoint',
              available: true,
              source: 'stgnn_checkpoint_offline',
              sample_count: 23,
            },
          ],
        };
      }
      return {
        source: 'stgnn_checkpoint_offline',
        scene_id: 'demo_dair_001',
        sample_count: 23,
        event_count: 0,
        high_risk_frames: 23,
        min_ttc: null,
        metrics: { ade: 0.4, fde: 0.7, avgLatency: 2, fps: 12 },
        baselines: [],
        ablations: [],
      };
    },
  } as Response;
}) as typeof fetch;

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

const reports = await fetchEvaluationReports('scene_001', 'http://localhost:8000/api/v1');
assertEqual(reports[0].key, 'stgnn_checkpoint');
assertEqual(calls[0].input, 'http://localhost:8000/api/v1/evaluation/reports?scene_id=scene_001');

const report = await fetchEvaluationReport('scene_001', 'stgnn_checkpoint', 'http://localhost:8000/api/v1');
assertEqual(report.source, 'stgnn_checkpoint_offline');
assertEqual(
  calls[1].input,
  'http://localhost:8000/api/v1/evaluation?scene_id=scene_001&report=stgnn_checkpoint',
);
