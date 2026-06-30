import React, { useRef, useEffect } from 'react';
import { Card, Select, Tag } from 'antd';
import { LogEntry } from '@/types/common';
import { LOG_LEVEL_COLORS } from '@/constants/colors';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface LogStreamProps {
  logs: LogEntry[];
  filter: LogEntry['level'] | 'all';
  onFilterChange: (filter: LogEntry['level'] | 'all') => void;
}

export const LogStream: React.FC<LogStreamProps> = ({ logs, filter, onFilterChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  return (
    <Card
      className="glass-card"
      title="实时日志流"
      size="small"
      extra={
        <Select
          size="small"
          value={filter}
          onChange={onFilterChange}
          style={{ width: 90 }}
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
      <div
        ref={containerRef}
        style={{
          height: 180,
          overflow: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 11,
          lineHeight: 1.8,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
            暂无日志
          </div>
        ) : (
          filtered.map((log) => (
            <div key={log.id} className="fade-in" style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: colors.textSecondary, flexShrink: 0, width: 85 }}>
                {log.timestamp.split(' ')[1]?.substring(0, 12)}
              </span>
              <Tag
                color={LOG_LEVEL_COLORS[log.level]}
                style={{
                  fontSize: 10,
                  lineHeight: '18px',
                  padding: '0 4px',
                  flexShrink: 0,
                }}
              >
                {log.level.toUpperCase()}
              </Tag>
              <span style={{ color: colors.accent, flexShrink: 0, width: 80 }}>
                [{log.source}]
              </span>
              <span style={{ color: colors.text }}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
