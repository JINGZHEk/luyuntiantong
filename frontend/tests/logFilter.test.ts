import { describe, expect, it } from 'vitest';
import { filterLogs } from '@/widgets/log-stream/log-utils';
import { LogEntry } from '@/types/common';

const logs: LogEntry[] = [
  { id: '1', timestamp: '2026-08-02 10:00:00.000', level: 'info', source: 'RSU-001', message: 'ok' },
  { id: '2', timestamp: '2026-08-02 10:00:01.000', level: 'error', source: 'RiskEval', message: 'danger' },
];

describe('log filtering', () => {
  it('returns every entry for the all filter', () => {
    expect(filterLogs(logs, 'all')).toEqual(logs);
  });

  it('returns only entries matching the selected level', () => {
    expect(filterLogs(logs, 'error')).toEqual([logs[1]]);
  });
});
