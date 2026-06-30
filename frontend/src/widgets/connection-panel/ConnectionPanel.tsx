import React from 'react';
import { Card, Badge, Button, Descriptions, Space, Tag } from 'antd';
import {
  LinkOutlined,
  DisconnectOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useMonitorStore } from '@/store/monitorStore';

export const ConnectionPanel: React.FC = () => {
  const { connection, toggleConnection } = useMonitorStore();

  return (
    <Card className="glass-card" title="MQTT 连接面板" size="small">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">
          <Badge
            status={connection.connected ? 'success' : 'error'}
            text={connection.connected ? '已连接' : '已断开'}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Broker">
          <Tag color="blue">{connection.broker}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Client ID">
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{connection.clientId}</span>
        </Descriptions.Item>
      </Descriptions>
      <Space style={{ marginTop: 12 }}>
        <Button
          type={connection.connected ? 'default' : 'primary'}
          danger={connection.connected}
          icon={connection.connected ? <DisconnectOutlined /> : <LinkOutlined />}
          onClick={toggleConnection}
        >
          {connection.connected ? '断开连接' : '建立连接'}
        </Button>
        <Button icon={<ReloadOutlined />} disabled={!connection.connected}>
          重新连接
        </Button>
      </Space>
    </Card>
  );
};
