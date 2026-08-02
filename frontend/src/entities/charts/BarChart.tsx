import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { CHART_COLORS } from '@/constants/colors';
import * as echarts from 'echarts/core';

interface BarChartProps {
  categories: string[];
  series: { name: string; data: number[]; color?: string }[];
  title?: string;
  height?: number | string;
  horizontal?: boolean;
}

export const BarChart: React.FC<BarChartProps> = ({
  categories,
  series,
  title,
  height = 300,
  horizontal = false,
}) => {
  const option = useMemo(
    () => {
      const defaultColors = [
        CHART_COLORS.primary,
        CHART_COLORS.secondary,
        CHART_COLORS.tertiary,
        CHART_COLORS.quaternary,
        CHART_COLORS.quinary,
      ];

      return {
        title: title ? { text: title, textStyle: { fontSize: 14 }, left: 'center' } : undefined,
        tooltip: { trigger: 'axis' as const },
        legend: {
          bottom: 0,
          textStyle: { fontSize: 11 },
          data: series.map((s) => s.name),
        },
        xAxis: horizontal
          ? { type: 'value' as const }
          : { type: 'category' as const, data: categories, axisLabel: { rotate: 30, fontSize: 10 } },
        yAxis: horizontal
          ? { type: 'category' as const, data: categories }
          : { type: 'value' as const, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: series.map((s, i) => ({
          name: s.name,
          type: 'bar' as const,
          data: s.data,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: s.color || defaultColors[i % defaultColors.length] },
              { offset: 1, color: 'rgba(0, 0, 0, 0.08)' },
            ]),
            borderRadius: horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0],
          },
          barMaxWidth: 40,
        })),
      };
    },
    [categories, series, title, horizontal],
  );

  return <BaseChart option={option} height={height} />;
};
