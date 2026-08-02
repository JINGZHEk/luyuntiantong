import React from 'react';
import { Card, Badge, Button, Descriptions, Space, Tag } from 'antd';
import {
  LinkOutlined,
  DisconnectOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useMonitorStore } from '@/store/monitorStore';
import { wsService } from '@/services/websocketService';
import styles from './ConnectionPanel.module.css';

export const ConnectionPanel: React.FC = () => {
  const connection = useMonitorStore((state) => state.connection);
  const toggleConnection = useMonitorStore((state) => state.toggleConnection);

  return (
    <Card className="glass-card" title="WebSocket 连接面板" size="small">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">
          <Badge
            status={connection.connected ? 'success' : 'error'}
            text={connection.connected ? 'Cloud API 已连接' : 'Mock fallback'}
          />
        </Descriptions.Item>
        <Descriptions.Item label="数据源">
          <Tag color={connection.source === 'live' ? 'green' : 'gold'}>
            {connection.source === 'live' ? '实时 WebSocket' : '本地模拟'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Broker">
          <Tag color="blue">{connection.broker}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Client ID">
          <span className={styles.clientId}>{connection.clientId}</span>
        </Descriptions.Item>
      </Descriptions>
      <Space className={styles.actions} wrap>
        <Button
          type={connection.connected ? 'default' : 'primary'}
          danger={connection.connected}
          icon={connection.connected ? <DisconnectOutlined /> : <LinkOutlined />}
          onClick={toggleConnection}
        >
          {connection.connected ? '断开连接' : '建立连接'}
        </Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => wsService.connect()}
        >
          重新连接
        </Button>
      </Space>
    </Card>
  );
};
