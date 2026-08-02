import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { CHART_COLORS, RISK_COLORS } from '@/constants/colors';
import { normalizeGaugeRange } from './gauge-utils';

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
  const range = normalizeGaugeRange(min, max);
  const safeValue = Math.min(range.max, Math.max(range.min, value));
  const defaultThresholds = thresholds || [
    { value: 0.4, color: RISK_COLORS.low },
    { value: 0.65, color: RISK_COLORS.medium },
    { value: 0.85, color: RISK_COLORS.high },
    { value: 1.0, color: RISK_COLORS.critical },
  ];
  const axisLineColors: [number, string][] = defaultThresholds.map((threshold) => [
    Math.min(1, Math.max(0, (threshold.value - range.min) / (range.max - range.min))),
    threshold.color,
  ]);

  const option = useMemo(
    () => ({
      series: [
        {
          type: 'gauge' as const,
          min: range.min,
          max: range.max,
          startAngle: 215,
          endAngle: -35,
          progress: { show: true, width: 10, roundCap: true },
          axisLine: { lineStyle: { width: 10, color: axisLineColors } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: title
            ? { show: true, offsetCenter: [0, '62%'], color: '#8892a4', fontSize: 12 }
            : { show: false },
          detail: {
            valueAnimation: true,
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            offsetCenter: [0, '10%'],
            formatter: (current: number) => current.toFixed(2),
            color: CHART_COLORS.primary,
          },
          data: [{ value: safeValue, name: title || '' }],
        },
      ],
    }),
    [axisLineColors, range.max, range.min, safeValue, title],
  );

  return <BaseChart option={option} height={height} />;
};
