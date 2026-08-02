import React, { useState } from 'react';
import { Card, Tag, Empty } from 'antd';
import { MonitorMessage } from '@/mock/monitorMock';
import styles from './MessagePanel.module.css';

interface MessagePanelProps {
  messages: MonitorMessage[];
}

const topicTagColors: Record<string, string> = {
  'v2x/roadside/perception': 'cyan',
  'v2x/vehicle/state': 'green',
  'v2x/cloud/event': 'gold',
  'v2x/cloud/fusion': 'purple',
};

export const MessagePanel: React.FC<MessagePanelProps> = ({ messages }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card className="glass-card" title="原始消息面板" size="small">
      <div className={styles.viewport}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <Empty description="等待消息..." />
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.item} fade-in`}
              data-topic={msg.topic}
              onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
            >
              <div className={styles.header}>
                <Tag
                  color={topicTagColors[msg.topic] || 'blue'}
                  className={styles.tag}
                >
                  {msg.topic}
                </Tag>
                <span className={styles.timestamp}>
                  {msg.timestamp.split(' ')[1]}
                </span>
              </div>
              <pre
                className={`${styles.payload} ${expanded === msg.id ? styles.payloadExpanded : ''}`}
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
