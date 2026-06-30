import React, { useMemo } from 'react';
import { BaseChart } from './BaseChart';
import { TimeSeriesPoint } from '@/types/common';
import { CHART_COLORS } from '@/constants/colors';

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
    () => ({
      title: title ? { text: title, textStyle: { fontSize: 14 }, left: 'center' } : undefined,
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: data.map((d) => d.time),
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        name: yAxisName,
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      series: [
        {
          type: 'line' as const,
          data: data.map((d) => d.value),
          smooth,
          symbol: 'none',
          lineStyle: { color, width: 2 },
          areaStyle: { color: areaColor },
        },
      ],
    }),
    [data, title, color, areaColor, yAxisName, smooth],
  );

  return <BaseChart option={option} height={height} />;
};
