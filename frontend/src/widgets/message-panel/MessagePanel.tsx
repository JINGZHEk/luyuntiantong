import React, { useState } from 'react';
import { Card, Tag, Empty } from 'antd';
import { MonitorMessage } from '@/mock/monitorMock';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface MessagePanelProps {
  messages: MonitorMessage[];
}

const topicColors: Record<string, string> = {
  'v2x/roadside/perception': '#00d4ff',
  'v2x/vehicle/state': '#00ff88',
  'v2x/cloud/event': '#faad14',
  'v2x/cloud/fusion': '#a855f7',
};

export const MessagePanel: React.FC<MessagePanelProps> = ({ messages }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  return (
    <Card className="glass-card" title="原始消息面板" size="small">
      <div style={{ height: 400, overflow: 'auto' }}>
        {messages.length === 0 ? (
          <Empty description="等待消息..." />
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="fade-in"
              style={{
                padding: '6px 8px',
                marginBottom: 4,
                borderRadius: 4,
                background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                cursor: 'pointer',
                borderLeft: `3px solid ${topicColors[msg.topic] || colors.accent}`,
              }}
              onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 2,
                }}
              >
                <Tag
                  color={topicColors[msg.topic] || 'blue'}
                  style={{ fontSize: 10, margin: 0 }}
                >
                  {msg.topic}
                </Tag>
                <span style={{ fontSize: 10, color: colors.textSecondary }}>
                  {msg.timestamp.split(' ')[1]}
                </span>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: colors.text,
                  maxHeight: expanded === msg.id ? 300 : 36,
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.payload}
              </pre>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
