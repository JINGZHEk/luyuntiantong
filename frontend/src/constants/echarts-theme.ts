import * as echarts from 'echarts/core';

const V2X_THEME: Parameters<typeof echarts.registerTheme>[1] = {
  color: ['#00d4ff', '#00ff88', '#a855f7', '#f97316', '#ec4899'],
  backgroundColor: 'transparent',
  textStyle: { color: '#8892a4', fontSize: 11 },
  title: {
    textStyle: { color: '#e0e6f0', fontSize: 13, fontWeight: 600 },
    subtextStyle: { color: '#8892a4', fontSize: 11 },
  },
  legend: {
    textStyle: { color: '#8892a4', fontSize: 11 },
    inactiveColor: '#555',
  },
  tooltip: {
    backgroundColor: 'rgba(10, 14, 26, 0.95)',
    borderColor: 'rgba(0, 212, 255, 0.3)',
    borderWidth: 1,
    textStyle: { color: '#e0e6f0', fontSize: 12 },
    extraCssText: 'backdrop-filter: blur(12px); box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-radius: 6px;',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.15)' } },
    axisTick: { lineStyle: { color: 'rgba(0, 212, 255, 0.15)' } },
    axisLabel: { color: '#8892a4', fontSize: 10 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8892a4', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.06)' } },
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
  color: ['#1677ff', '#389e0d', '#722ed1', '#d46b08', '#c41d7f'],
  backgroundColor: 'transparent',
  textStyle: { color: '#595959', fontSize: 11 },
  title: {
    textStyle: { color: '#1f1f1f', fontSize: 13, fontWeight: 600 },
    subtextStyle: { color: '#8c8c8c', fontSize: 11 },
  },
  legend: { textStyle: { color: '#595959', fontSize: 11 }, inactiveColor: '#bfbfbf' },
  tooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: '#b7d7ff',
    borderWidth: 1,
    textStyle: { color: '#1f1f1f', fontSize: 12 },
    extraCssText: 'box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 6px;',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisTick: { lineStyle: { color: '#d9d9d9' } },
    axisLabel: { color: '#8c8c8c', fontSize: 10 },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8c8c8c', fontSize: 10 },
    splitLine: { lineStyle: { color: '#f0f0f0' } },
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
