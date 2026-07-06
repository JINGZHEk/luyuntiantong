import { BaselineComparison, AblationResult, ModelMetrics, TargetStatus } from '@/types/metrics';

export function getModelMetrics(): ModelMetrics {
  return {
    precision: 0.934,
    recall: 0.912,
    f1Score: 0.923,
    ade: 0.42,
    fde: 0.87,
    avgLatency: 23.5,
    e2eLatency: 42.0,
    leadTime: 2.1,
    fps: 42.3,
  };
}

export function getBaselineComparisons(): BaselineComparison[] {
  return [
    { model: 'Ours (V2X-Ghost)', precision: 0.934, recall: 0.912, f1Score: 0.923, ade: 0.42, fde: 0.87, latency: 23.5 },
    { model: 'YOLOv8 + DeepSORT', precision: 0.876, recall: 0.854, f1Score: 0.865, ade: 0.68, fde: 1.23, latency: 31.2 },
    { model: 'CenterPoint', precision: 0.891, recall: 0.867, f1Score: 0.879, ade: 0.55, fde: 1.05, latency: 28.7 },
    { model: 'PointPillars', precision: 0.845, recall: 0.823, f1Score: 0.834, ade: 0.72, fde: 1.35, latency: 35.1 },
    { model: 'BEVFusion', precision: 0.908, recall: 0.889, f1Score: 0.898, ade: 0.48, fde: 0.95, latency: 26.3 },
    { model: 'Vehicle-Only', precision: 0.812, recall: 0.789, f1Score: 0.800, ade: 0.85, fde: 1.52, latency: 18.9 },
  ];
}

export function getAblationResults(): AblationResult[] {
  return [
    { variant: 'Full Model', f1Score: 0.923, ade: 0.42, fde: 0.87, description: '完整模型（路侧+车端+云端融合）' },
    { variant: 'w/o Cloud Fusion', f1Score: 0.878, ade: 0.58, fde: 1.12, description: '去除云端融合模块' },
    { variant: 'w/o Occlusion', f1Score: 0.856, ade: 0.65, fde: 1.28, description: '去除遮挡推理模块' },
    { variant: 'w/o V2X Comm', f1Score: 0.812, ade: 0.78, fde: 1.45, description: '去除V2X通信（仅车端）' },
    { variant: 'w/o Trajectory', f1Score: 0.901, ade: 0.52, fde: 1.02, description: '去除轨迹预测模块' },
    { variant: 'w/o Attention', f1Score: 0.889, ade: 0.55, fde: 1.08, description: '去除注意力机制' },
  ];
}

export function getTargetStatus(): TargetStatus[] {
  return [
    { key: 'ade', metric: 'ADE', value: 0.42, target: '< 1 m', status: 'pass', pass: true, unit: 'm' },
    { key: 'fde', metric: 'FDE', value: 0.87, target: '< 2 m', status: 'pass', pass: true, unit: 'm' },
    { key: 'occAde', metric: 'Occ-ADE', value: null, target: '< 1.5 m', status: 'unknown', pass: null, unit: 'm' },
    { key: 'occAcc', metric: 'Occ-Acc', value: null, target: '>= 70%', status: 'unknown', pass: null, unit: 'ratio' },
    { key: 'fps', metric: 'FPS', value: 42.3, target: '>= 10 fps', status: 'pass', pass: true, unit: 'fps' },
    { key: 'e2eLatency', metric: 'E2E-Lat', value: 42.0, target: '< 100 ms', status: 'pass', pass: true, unit: 'ms' },
    { key: 'leadTime', metric: 'Lead-Time', value: 2.1, target: '>= 1.5 s', status: 'pass', pass: true, unit: 's' },
  ];
}

export function getConfusionMatrixData() {
  return {
    labels: ['Safe', 'Low Risk', 'Medium Risk', 'High Risk', 'Critical'],
    matrix: [
      [245, 8, 2, 0, 0],
      [5, 189, 12, 3, 0],
      [1, 10, 176, 15, 2],
      [0, 2, 8, 156, 6],
      [0, 0, 1, 4, 98],
    ],
  };
}
