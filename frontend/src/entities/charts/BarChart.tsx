import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { useSettingsStore } from '@/store/settingsStore';
import { getChartPalette, resolveChartColor } from '@/constants/echarts-theme';
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
  const theme = useSettingsStore((state) => state.theme);
  const palette = getChartPalette(theme);

  const option = useMemo(
    () => {
      return {
        title: title ? {
          text: title,
          textStyle: { color: palette.textPrimary, fontSize: 14 },
          left: 'center',
        } : undefined,
        tooltip: { trigger: 'axis' as const },
        legend: {
          bottom: 0,
          textStyle: { color: palette.text, fontSize: 12 },
          data: series.map((s) => s.name),
        },
        xAxis: horizontal
          ? { type: 'value' as const }
          : {
            type: 'category' as const,
            data: categories,
            axisLabel: { color: palette.axisLabel, rotate: 30, fontSize: 11 },
          },
        yAxis: horizontal
          ? { type: 'category' as const, data: categories, axisLabel: { color: palette.axisLabel, fontSize: 11 } }
          : {
            type: 'value' as const,
            axisLabel: { color: palette.axisLabel, fontSize: 11 },
            splitLine: { lineStyle: { color: palette.grid } },
          },
        series: series.map((s, i) => ({
          name: s.name,
          type: 'bar' as const,
          data: s.data,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: resolveChartColor(theme, s.color, palette.series[i % palette.series.length]) },
              { offset: 1, color: palette.gradientEnd },
            ]),
            borderRadius: horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0],
          },
          barMaxWidth: 40,
        })),
      };
    },
    [categories, series, title, horizontal, palette, theme],
  );

  return <BaseChart option={option} height={height} />;
};
