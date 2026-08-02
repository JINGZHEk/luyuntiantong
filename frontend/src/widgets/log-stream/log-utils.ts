import { LogEntry } from '@/types/common';

export type LogFilter = LogEntry['level'] | 'all';

export function filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
  return filter === 'all' ? logs : logs.filter((log) => log.level === filter);
}
