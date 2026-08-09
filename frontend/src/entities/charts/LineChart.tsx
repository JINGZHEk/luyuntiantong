import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { TimeSeriesPoint } from '@/types/common';
import { useSettingsStore } from '@/store/settingsStore';
import { getChartPalette, resolveChartColor } from '@/constants/echarts-theme';
import * as echarts from 'echarts/core';

interface LineChartProps {
  data: TimeSeriesPoint[];
  title?: string;
  color?: string;
  areaColor?: string;
  height?: number | string;
  yAxisName?: string;
  smooth?: boolean;
  threshold?: number;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  title,
  color,
  areaColor,
  height = 200,
  yAxisName,
  smooth = true,
  threshold,
}) => {
  const theme = useSettingsStore((state) => state.theme);
  const palette = getChartPalette(theme);
  const lineColor = resolveChartColor(theme, color, palette.primary);
  const fillColor = resolveChartColor(theme, areaColor, palette.area);

  const option = useMemo(
    () => {
      return {
        title: title ? {
          text: title,
          textStyle: { color: palette.textPrimary, fontSize: 13, fontWeight: 600 },
          left: 'center',
        } : undefined,
        tooltip: {
          trigger: 'axis' as const,
          axisPointer: {
            type: 'line' as const,
            lineStyle: { color: palette.axis, type: 'dashed' as const },
          },
        },
        xAxis: {
          type: 'category' as const,
          data: data.map((d) => d.time),
          axisLabel: { color: palette.axisLabel, fontSize: 11 },
        },
        yAxis: {
          type: 'value' as const,
          name: yAxisName,
          axisLabel: { color: palette.axisLabel, fontSize: 11 },
          splitLine: { lineStyle: { color: palette.grid } },
        },
        series: [
          {
            type: 'line' as const,
            data: data.map((d) => d.value),
            smooth,
            showSymbol: false,
            symbol: 'circle',
            lineStyle: {
              color: lineColor,
              width: 2,
              shadowColor: theme === 'dark' ? lineColor : 'transparent',
              shadowBlur: theme === 'dark' ? 8 : 0,
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: fillColor },
                { offset: 1, color: palette.gradientEnd },
              ]),
            },
            emphasis: {
              scale: true,
              itemStyle: { borderWidth: 2, borderColor: palette.surface },
              lineStyle: { width: 3 },
            },
            markLine: threshold === undefined ? undefined : {
              silent: true,
              symbol: 'none',
              lineStyle: { color: palette.threshold, type: 'dashed' as const },
              label: { color: palette.text, formatter: `阈值 ${threshold}` },
              data: [{ yAxis: threshold }],
            },
          },
        ],
      };
    },
    [data, title, lineColor, fillColor, yAxisName, smooth, threshold, palette, theme],
  );

  return <BaseChart option={option} height={height} />;
};
