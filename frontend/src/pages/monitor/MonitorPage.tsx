import React from 'react';
import { Row, Col, Result, Button } from 'antd';
import { ConnectionPanel } from '@/widgets/connection-panel/ConnectionPanel';
import { TopicManager } from '@/widgets/topic-manager/TopicManager';
import { MessagePanel } from '@/widgets/message-panel/MessagePanel';
import { PerceptionCards } from '@/widgets/perception-cards/PerceptionCards';
import { useMonitorStore } from '@/store/monitorStore';
import { PageLoading } from '@/shared/components/PageLoading';

const MonitorPage: React.FC = () => {
  const { messages, pageState, setError } = useMonitorStore();

  if (pageState.loading) return <PageLoading />;

  if (pageState.error) {
    return (
      <Result
        status="error"
        title="监控服务异常"
        subTitle={pageState.error}
        extra={<Button type="primary" onClick={() => setError(null)}>重试</Button>}
      />
    );
  }

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <ConnectionPanel />
        </Col>
        <Col xs={24} md={12}>
          <TopicManager />
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={24}>
          <PerceptionCards />
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={24}>
          <MessagePanel messages={messages} />
        </Col>
      </Row>
    </div>
  );
};

export default MonitorPage;
