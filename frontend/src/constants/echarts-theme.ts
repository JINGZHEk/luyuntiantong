import * as echarts from 'echarts/core';

export const CHART_PALETTES = {
  dark: {
    series: ['#00d4ff', '#00ff88', '#a855f7', '#f97316', '#ec4899'],
    primary: '#00d4ff',
    threshold: '#f97316',
    axis: 'rgba(0, 212, 255, 0.15)',
    grid: 'rgba(0, 212, 255, 0.06)',
    axisLabel: '#8892a4',
    text: '#8892a4',
    textPrimary: '#e0e6f0',
    surface: 'rgba(10, 14, 26, 0.95)',
    border: 'rgba(0, 212, 255, 0.3)',
    area: 'rgba(0, 212, 255, 0.15)',
    gradientEnd: 'rgba(0, 0, 0, 0.08)',
    riskThresholds: ['#00ff88', '#faad14', '#f97316', '#ff4d4f'],
  },
  light: {
    series: ['#1D4ED8', '#15803D', '#6D28D9', '#B45309', '#B91C1C'],
    primary: '#1D4ED8',
    threshold: '#B45309',
    axis: '#CBD5E1',
    grid: '#E2E8F0',
    axisLabel: '#475569',
    text: '#334155',
    textPrimary: '#0F172A',
    surface: '#FFFFFF',
    border: '#CBD5E1',
    area: 'rgba(29, 78, 216, 0.15)',
    gradientEnd: 'rgba(255, 255, 255, 0)',
    riskThresholds: ['#15803D', '#B45309', '#C2410C', '#B91C1C'],
  },
} as const;

export function getChartPalette(mode: 'dark' | 'light') {
  return CHART_PALETTES[mode];
}

export function resolveChartColor(mode: 'dark' | 'light', color: string | undefined, fallback: string) {
  if (!color) return fallback;
  if (color === CHART_PALETTES.dark.area) return CHART_PALETTES[mode].area;
  const darkSeries: readonly string[] = CHART_PALETTES.dark.series;
  const darkIndex = darkSeries.indexOf(color);
  return darkIndex >= 0 ? CHART_PALETTES[mode].series[darkIndex] : color;
}

const V2X_THEME: Parameters<typeof echarts.registerTheme>[1] = {
  color: [...CHART_PALETTES.dark.series],
  backgroundColor: 'transparent',
  textStyle: { color: CHART_PALETTES.dark.text, fontSize: 12 },
  title: {
    textStyle: { color: CHART_PALETTES.dark.textPrimary, fontSize: 14, fontWeight: 600 },
    subtextStyle: { color: CHART_PALETTES.dark.text, fontSize: 12 },
  },
  legend: {
    textStyle: { color: CHART_PALETTES.dark.text, fontSize: 12 },
    inactiveColor: '#555',
  },
  tooltip: {
    backgroundColor: CHART_PALETTES.dark.surface,
    borderColor: CHART_PALETTES.dark.border,
    borderWidth: 1,
    textStyle: { color: CHART_PALETTES.dark.textPrimary, fontSize: 12 },
    extraCssText: 'backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-radius: 6px;',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: CHART_PALETTES.dark.axis } },
    axisTick: { lineStyle: { color: CHART_PALETTES.dark.axis } },
    axisLabel: { color: CHART_PALETTES.dark.axisLabel, fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: CHART_PALETTES.dark.axisLabel, fontSize: 11 },
    splitLine: { lineStyle: { color: CHART_PALETTES.dark.grid } },
  },
  grid: {
    top: 40,
    right: 20,
    bottom: 30,
    left: 50,
    containLabel: true,
  },
};

const V2X_LIGHT_THEME: Parameters<typeof echarts.registerTheme>[1] = {
  color: [...CHART_PALETTES.light.series],
  backgroundColor: 'transparent',
  textStyle: { color: CHART_PALETTES.light.text, fontSize: 12 },
  title: {
    textStyle: { color: CHART_PALETTES.light.textPrimary, fontSize: 14, fontWeight: 600 },
    subtextStyle: { color: CHART_PALETTES.light.text, fontSize: 12 },
  },
  legend: { textStyle: { color: CHART_PALETTES.light.text, fontSize: 12 }, inactiveColor: '#94A3B8' },
  tooltip: {
    backgroundColor: CHART_PALETTES.light.surface,
    borderColor: CHART_PALETTES.light.border,
    borderWidth: 1,
    textStyle: { color: CHART_PALETTES.light.textPrimary, fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 16px rgb(15 23 42 / 0.10); border-radius: 8px;',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: CHART_PALETTES.light.axis } },
    axisTick: { lineStyle: { color: CHART_PALETTES.light.axis } },
    axisLabel: { color: CHART_PALETTES.light.axisLabel, fontSize: 11 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: CHART_PALETTES.light.axisLabel, fontSize: 11 },
    splitLine: { lineStyle: { color: CHART_PALETTES.light.grid } },
  },
  grid: V2X_THEME.grid,
};

let registered = false;

export function registerV2XTheme() {
  if (registered) return;
  echarts.registerTheme('v2x-dark', V2X_THEME);
  echarts.registerTheme('v2x-light', V2X_LIGHT_THEME);
  registered = true;
}

export { V2X_THEME, V2X_LIGHT_THEME };
export default V2X_THEME;
