import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { TimeSeriesPoint } from '@/types/common';
import { CHART_COLORS } from '@/constants/colors';
import * as echarts from 'echarts/core';

interface LineChartProps {
  data: TimeSeriesPoint[];
  title?: string;
  color?: string;
  areaColor?: string;
  height?: number | string;
  yAxisName?: string;
  smooth?: boolean;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  title,
  color = CHART_COLORS.primary,
  areaColor = CHART_COLORS.area,
  height = 200,
  yAxisName,
  smooth = true,
}) => {
  const option = useMemo(
    () => {
      const hexColor = color.startsWith('#') ? color : CHART_COLORS.primary;

      return {
        title: title ? { text: title, textStyle: { fontSize: 13, fontWeight: 600 }, left: 'center' } : undefined,
        tooltip: {
          trigger: 'axis' as const,
          axisPointer: {
            type: 'line' as const,
            lineStyle: { color: 'rgba(0, 212, 255, 0.3)', type: 'dashed' as const },
          },
        },
        xAxis: {
          type: 'category' as const,
          data: data.map((d) => d.time),
          axisLabel: { fontSize: 10 },
        },
        yAxis: {
          type: 'value' as const,
          name: yAxisName,
          splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.06)' } },
        },
        series: [
          {
            type: 'line' as const,
            data: data.map((d) => d.value),
            smooth,
            symbol: 'none',
            lineStyle: { color, width: 2.5, shadowColor: color, shadowBlur: 8 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${hexColor}40` },
                { offset: 1, color: `${hexColor}00` },
              ]),
            },
            emphasis: {
              lineStyle: { width: 3 },
            },
          },
        ],
      };
    },
    [data, title, color, areaColor, yAxisName, smooth],
  );

  return <BaseChart option={option} height={height} />;
};
