import React from 'react';
import { Card, List, Switch, Badge, Typography } from 'antd';
import { useMonitorStore } from '@/store/monitorStore';

const { Text } = Typography;

export const TopicManager: React.FC = () => {
  const { topics, toggleTopic } = useMonitorStore();

  return (
    <Card className="glass-card" title="Topic 订阅管理" size="small">
      <List
        size="small"
        dataSource={topics}
        renderItem={(item) => (
          <List.Item
            extra={
              <Switch
                size="small"
                checked={item.active}
                onChange={() => toggleTopic(item.topic)}
              />
            }
          >
            <List.Item.Meta
              title={
                <Text
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  type={item.active ? undefined : 'secondary'}
                >
                  {item.topic}
                </Text>
              }
              description={
                <Badge
                  count={item.messageCount}
                  overflowCount={999}
                  size="small"
                  style={{ backgroundColor: item.active ? '#52c41a' : '#999' }}
                />
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};
