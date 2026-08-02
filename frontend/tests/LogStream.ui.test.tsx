import { render, screen } from '@testing-library/react';
import { LogStream } from '@/widgets/log-stream/LogStream';
import { LogEntry } from '@/types/common';

const logs: LogEntry[] = [
  {
    id: 'log-1',
    timestamp: '2026-08-02 10:00:00.000',
    level: 'info',
    source: 'RSU-001',
    message: '链路正常',
  },
  {
    id: 'log-2',
    timestamp: '2026-08-02 10:00:01.000',
    level: 'error',
    source: 'RiskEval',
    message: '检测到高危目标',
  },
];

describe('LogStream', () => {
  it('renders the selected log entries and footer state', () => {
    render(<LogStream logs={logs} filter="all" onFilterChange={() => undefined} />);

    expect(screen.getByRole('log')).toHaveTextContent('链路正常');
    expect(screen.getByRole('log')).toHaveTextContent('检测到高危目标');
    expect(screen.getByText('2 条日志')).toBeInTheDocument();
  });

  it('renders an empty state when the active filter has no entries', () => {
    render(<LogStream logs={logs} filter="debug" onFilterChange={() => undefined} />);

    expect(screen.getByText('暂无日志')).toBeInTheDocument();
    expect(screen.getByText('调整筛选条件或等待新的数据链路消息')).toBeInTheDocument();
  });
});
