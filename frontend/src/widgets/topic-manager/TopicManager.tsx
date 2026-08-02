import React from 'react';
import { Card, List, Switch, Badge, Typography } from 'antd';
import { useMonitorStore } from '@/store/monitorStore';
import styles from './TopicManager.module.css';

const { Text } = Typography;

export const TopicManager: React.FC = () => {
  const topics = useMonitorStore((state) => state.topics);
  const toggleTopic = useMonitorStore((state) => state.toggleTopic);

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
                  className={styles.topic}
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
                  className={item.active ? styles.badgeActive : styles.badgeInactive}
                />
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};
