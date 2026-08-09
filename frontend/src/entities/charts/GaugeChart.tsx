import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { useSettingsStore } from '@/store/settingsStore';
import { getChartPalette, resolveChartColor } from '@/constants/echarts-theme';
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
  const theme = useSettingsStore((state) => state.theme);
  const palette = getChartPalette(theme);
  const range = normalizeGaugeRange(min, max);
  const safeValue = Math.min(range.max, Math.max(range.min, value));
  const defaultThresholds = thresholds || [
    { value: 0.4, color: palette.riskThresholds[0] },
    { value: 0.65, color: palette.riskThresholds[1] },
    { value: 0.85, color: palette.riskThresholds[2] },
    { value: 1.0, color: palette.riskThresholds[3] },
  ];
  const axisLineColors: [number, string][] = defaultThresholds.map((threshold) => [
    Math.min(1, Math.max(0, (threshold.value - range.min) / (range.max - range.min))),
    resolveChartColor(theme, threshold.color, threshold.color),
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
            ? { show: true, offsetCenter: [0, '62%'], color: palette.text, fontSize: 12 }
            : { show: false },
          detail: {
            valueAnimation: true,
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 22,
            fontWeight: 700,
            offsetCenter: [0, '10%'],
            formatter: (current: number) => current.toFixed(2),
            color: palette.primary,
          },
          data: [{ value: safeValue, name: title || '' }],
        },
      ],
    }),
    [axisLineColors, range.max, range.min, safeValue, title, palette],
  );

  return <BaseChart option={option} height={height} />;
};
