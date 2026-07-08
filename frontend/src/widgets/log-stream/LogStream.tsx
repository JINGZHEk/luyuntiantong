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

const levelDotStyle = (color: string): React.CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: color,
  display: 'inline-block',
  flexShrink: 0,
  boxShadow: `0 0 6px ${color}80`,
});

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
      className="glass-card tech-border scan-line"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#00d4ff',
              display: 'inline-block',
              boxShadow: '0 0 6px #00d4ff80',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
            实时日志流
          </span>
          <span
            style={{
              fontSize: 10,
              color: colors.textSecondary,
              fontFamily: "'JetBrains Mono', monospace",
              marginLeft: 4,
            }}
          >
            [{filtered.length}]
          </span>
        </div>
      }
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
          ['--scan-height' as any]: '180px',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
            暂无日志
          </div>
        ) : (
          filtered.map((log) => {
            const levelColor = LOG_LEVEL_COLORS[log.level];
            const isError = log.level === 'error';
            return (
              <div
                key={log.id}
                className="fade-in"
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '2px 4px',
                  borderRadius: 2,
                  borderLeft: isError ? `2px solid ${levelColor}` : '2px solid transparent',
                  background: isError ? 'rgba(255, 77, 79, 0.04)' : 'transparent',
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    color: colors.textSecondary,
                    flexShrink: 0,
                    width: 85,
                    opacity: 0.7,
                  }}
                >
                  {log.timestamp.split(' ')[1]?.substring(0, 12)}
                </span>
                {/* Level dot + text */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    width: 55,
                  }}
                >
                  <span style={levelDotStyle(levelColor)} />
                  <span style={{ color: levelColor, fontSize: 10 }}>
                    {log.level.toUpperCase()}
                  </span>
                </span>
                {/* Source */}
                <span
                  style={{
                    color: '#00d4ff',
                    flexShrink: 0,
                    width: 80,
                    opacity: 0.8,
                  }}
                >
                  [{log.source}]
                </span>
                {/* Message */}
                <span style={{ color: colors.text, flex: 1, minWidth: 0 }}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};
