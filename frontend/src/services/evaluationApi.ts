import type { EvaluationReport, EvaluationReportDescriptor } from '../types/metrics.js';
import { buildApiUrl } from './runtimeConfig.js';

export async function fetchEvaluationReport(
  sceneId = 'scene_001',
  reportKey?: string | null,
  baseUrl?: string | null,
): Promise<EvaluationReport> {
  const params = new URLSearchParams({ scene_id: sceneId });
  if (reportKey) {
    params.set('report', reportKey);
  }
  const response = await fetch(buildApiUrl(`/evaluation?${params.toString()}`, baseUrl));

  if (!response.ok) {
    throw new Error(`Failed to load evaluation report: ${response.status}`);
  }

  return response.json();
}

export async function fetchEvaluationReports(
  sceneId = 'scene_001',
  baseUrl?: string | null,
): Promise<EvaluationReportDescriptor[]> {
  const params = new URLSearchParams({ scene_id: sceneId });
  const response = await fetch(buildApiUrl(`/evaluation/reports?${params.toString()}`, baseUrl));

  if (!response.ok) {
    throw new Error(`Failed to load evaluation report list: ${response.status}`);
  }

  const payload = await response.json();
  return payload.reports ?? [];
}
