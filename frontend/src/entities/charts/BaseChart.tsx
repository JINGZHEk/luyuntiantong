import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

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
    <ReactECharts
      option={mergedOption}
      style={{ height, width: '100%', ...style }}
      opts={{ renderer: 'canvas' }}
      showLoading={loading}
      theme={theme === 'dark' ? 'dark' : undefined}
    />
  );
};
