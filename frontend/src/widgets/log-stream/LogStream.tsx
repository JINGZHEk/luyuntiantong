import React, { useEffect, useRef } from 'react';
import { Card, Select, Switch } from 'antd';
import { LogEntry } from '@/types/common';
import { EmptyState } from '@/shared/components/EmptyState';
import { filterLogs, LogFilter } from './log-utils';
import styles from './LogStream.module.css';

interface LogStreamProps {
  logs: LogEntry[];
  filter: LogFilter;
  onFilterChange: (filter: LogFilter) => void;
  autoScroll?: boolean;
  onAutoScrollChange?: (value: boolean) => void;
}

const levelLabels: Record<LogEntry['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

const levelClassNames: Record<LogEntry['level'], string> = {
  info: styles.levelInfo,
  warn: styles.levelWarn,
  error: styles.levelError,
  debug: styles.levelDebug,
};

export const LogStream: React.FC<LogStreamProps> = ({
  logs,
  filter,
  onFilterChange,
  autoScroll = true,
  onAutoScrollChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const filtered = filterLogs(logs, filter);

  useEffect(() => {
    if (containerRef.current && autoScroll) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs.length, autoScroll]);

  return (
    <Card
      className={`glass-card tech-border scan-line ${styles.card}`}
      title={
        <div className={styles.title}>
          <span className={styles.titleDot} aria-hidden="true" />
          <span>实时日志流</span>
          <span className={styles.count}>[{filtered.length}]</span>
        </div>
      }
      size="small"
      extra={
        <Select
          size="small"
          value={filter}
          onChange={onFilterChange}
          className={styles.filter}
          aria-label="日志级别筛选"
          options={[
            { label: '全部', value: 'all' },
            { label: 'INFO', value: 'info' },
            { label: 'WARN', value: 'warn' },
            { label: 'ERROR', value: 'error' },
            { label: 'DEBUG', value: 'debug' },
          ]}
        />
      }
    >
      <div ref={containerRef} className={styles.viewport} role="log" aria-live="polite">
        {filtered.length === 0 ? (
          <EmptyState title="暂无日志" description="调整筛选条件或等待新的数据链路消息" />
        ) : (
          filtered.map((log) => {
            const isError = log.level === 'error';
            return (
              <div
                key={log.id}
                className={`${styles.row} ${isError ? styles.errorRow : ''} fade-in`}
                data-log-level={log.level}
              >
                <time className={styles.timestamp}>{log.timestamp.split(' ')[1]?.substring(0, 12)}</time>
                <span className={`${styles.level} ${levelClassNames[log.level]}`}>
                  <span className={styles.levelDot} aria-hidden="true" />
                  {levelLabels[log.level]}
                </span>
                <span className={styles.source}>[{log.source}]</span>
                <span className={styles.message}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.footer}>
        <span>{filtered.length} 条日志</span>
        <span className={styles.footerDivider} aria-hidden="true" />
        <span>过滤：{filter === 'all' ? '全部级别' : levelLabels[filter]}</span>
        <label className={styles.autoScroll}>
          <Switch
            size="small"
            checked={autoScroll}
            onChange={onAutoScrollChange}
            aria-label="自动滚动日志"
          />
          <span>自动滚动</span>
        </label>
      </div>
    </Card>
  );
};
