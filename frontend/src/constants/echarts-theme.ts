import * as echarts from 'echarts/core';

const V2X_THEME = {
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

let registered = false;

export function registerV2XTheme() {
  if (!registered) {
    echarts.registerTheme('v2x-dark', V2X_THEME as any);
    registered = true;
  }
}

export default V2X_THEME;
