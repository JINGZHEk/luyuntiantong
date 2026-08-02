import React from 'react';
import { render, screen } from '@testing-library/react';
import { GaugeChart } from '@/entities/charts/GaugeChart';

vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: { series: Array<{ data: Array<{ value: number }> }> } }) => {
    const value = option.series[0]?.data[0]?.value ?? 0;
    return <div data-testid="echarts-container" data-gauge-value={value} />;
  },
}));

describe('GaugeChart', () => {
  it('renders a chart container for an equal min/max range', () => {
    render(<GaugeChart value={2} min={2} max={2} title="风险分" />);

    expect(screen.getByTestId('echarts-container')).toHaveAttribute('data-gauge-value', '2');
  });

  it('clamps values above the configured range', () => {
    render(<GaugeChart value={20} min={0} max={10} />);

    expect(screen.getByTestId('echarts-container')).toHaveAttribute('data-gauge-value', '10');
  });
});
