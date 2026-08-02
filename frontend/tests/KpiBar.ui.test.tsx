import { render, screen } from '@testing-library/react';
import { KpiBar } from '@/widgets/kpi-bar/KpiBar';
import { SystemMetrics } from '@/types/metrics';

const metrics: SystemMetrics = {
  onlineDevices: 12,
  avgLatency: 24.5,
  packetLossRate: 0.012,
  todayHighRiskEvents: 3,
  cpuUsage: 0.42,
  memoryUsage: 0.56,
  networkBandwidth: 120,
};

describe('KpiBar', () => {
  it('renders the four realtime KPI values and labels', () => {
    render(<KpiBar metrics={metrics} />);

    expect(screen.getByText('在线设备数')).toBeInTheDocument();
    expect(screen.getByText('平均时延')).toBeInTheDocument();
    expect(screen.getByText('丢包率')).toBeInTheDocument();
    expect(screen.getByText('今日高危事件')).toBeInTheDocument();
    expect(screen.getByText('12台')).toBeInTheDocument();
    expect(screen.getByText('24.5ms')).toBeInTheDocument();
    expect(screen.getByText('1.20%')).toBeInTheDocument();
    expect(screen.getByText('3次')).toBeInTheDocument();
  });
});
