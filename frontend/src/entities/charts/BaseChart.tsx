import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import {
  BarChart as EChartsBarChart,
  GaugeChart as EChartsGaugeChart,
  LineChart as EChartsLineChart,
  RadarChart as EChartsRadarChart,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

echarts.use([
  EChartsBarChart,
  EChartsGaugeChart,
  EChartsLineChart,
  EChartsRadarChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface BaseChartProps {
  option: EChartsOption;
  height?: number | string;
  loading?: boolean;
  style?: React.CSSProperties;
}

export const BaseChart: React.FC<BaseChartProps> = ({
  option,
  height = 300,
  loading = false,
  style,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const mergedOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      textStyle: { color: colors.textSecondary, fontSize: 12 },
      grid: { top: 40, right: 20, bottom: 30, left: 50, containLabel: true },
      ...option,
    }),
    [option, colors],
  );

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={mergedOption}
      style={{ height, width: '100%', ...style }}
      opts={{ renderer: 'canvas' }}
      showLoading={loading}
      theme={theme === 'dark' ? 'dark' : undefined}
    />
  );
};
