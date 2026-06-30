import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { CHART_COLORS, RISK_COLORS } from '@/constants/colors';

interface GaugeChartProps {
  value: number;
  title?: string;
  min?: number;
  max?: number;
  height?: number | string;
  thresholds?: { value: number; color: string }[];
}

export const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  title,
  min = 0,
  max = 1,
  height = 200,
  thresholds,
}) => {
  const defaultThresholds = thresholds || [
    { value: 0.4, color: RISK_COLORS.low },
    { value: 0.65, color: RISK_COLORS.medium },
    { value: 0.85, color: RISK_COLORS.high },
    { value: 1.0, color: RISK_COLORS.critical },
  ];

  const axisLineColors: [number, string][] = defaultThresholds.map((t) => [
    (t.value - min) / (max - min),
    t.color,
  ]);

  const option = useMemo(
    () => ({
      series: [
        {
          type: 'gauge' as const,
          min,
          max,
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12, color: axisLineColors } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { width: 2, color: '#999' } },
          axisLabel: { distance: 18, fontSize: 10 },
          pointer: { itemStyle: { color: CHART_COLORS.primary } },
          title: title
            ? { show: true, offsetCenter: [0, '70%'], fontSize: 13 }
            : { show: false },
          detail: {
            valueAnimation: true,
            fontSize: 22,
            offsetCenter: [0, '40%'],
            formatter: (v: number) => v.toFixed(2),
            color: CHART_COLORS.primary,
          },
          data: [{ value, name: title || '' }],
        },
      ],
    }),
    [value, title, min, max, axisLineColors],
  );

  return <BaseChart option={option} height={height} />;
};
