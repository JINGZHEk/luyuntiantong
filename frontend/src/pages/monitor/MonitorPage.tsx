import React, { useEffect, useState } from 'react';
import { Row, Col, Result, Button, Card, Space, Tag, message, Select } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, StepForwardOutlined, SyncOutlined } from '@ant-design/icons';
import { ConnectionPanel } from '@/widgets/connection-panel/ConnectionPanel';
import { TopicManager } from '@/widgets/topic-manager/TopicManager';
import { MessagePanel } from '@/widgets/message-panel/MessagePanel';
import { PerceptionCards } from '@/widgets/perception-cards/PerceptionCards';
import { useMonitorStore } from '@/store/monitorStore';
import { PageLoading } from '@/shared/components/PageLoading';
import { DemoStatus, demoApi } from '@/services/demoApi';

const MonitorPage: React.FC = () => {
  const { messages, pageState, setError } = useMonitorStore();
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [scenario, setScenario] = useState('moderate');
  const [busy, setBusy] = useState(false);

  const refreshDemoStatus = async () => {
    try {
      const status = await demoApi.status();
      setDemoStatus(status);
      if (status.running) {
        setScenario(status.scenario || 'moderate');
      }
    } catch {
      setDemoStatus(null);
    }
  };

  const runDemoAction = async (action: 'start' | 'stop' | 'step') => {
    setBusy(true);
    try {
      const next =
        action === 'start'
          ? await demoApi.start(10, scenario)
          : action === 'stop'
            ? await demoApi.stop()
            : await demoApi.step(scenario);
      setDemoStatus(next);
      message.success(action === 'start' ? '演示已启动' : action === 'stop' ? '演示已停止' : '已推进一帧');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Demo API 请求失败');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshDemoStatus();
    const timer = window.setInterval(refreshDemoStatus, 3000);
    return () => window.clearInterval(timer);
  }, []);

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
      <Card className="glass-card" size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Space wrap>
            <Tag color={demoStatus?.running ? 'green' : 'gold'}>
              {demoStatus?.running ? 'Demo running' : 'Demo idle'}
            </Tag>
            <Tag color="blue">frame {demoStatus?.frame_index ?? '-'}</Tag>
            <Tag color="cyan">{demoStatus?.scene_id ?? 'scene_001'} / {demoStatus?.scenario ?? scenario}</Tag>
          </Space>
          <Space wrap>
            <Select
              value={scenario}
              style={{ width: 150 }}
              disabled={demoStatus?.running || busy}
              onChange={setScenario}
              options={(demoStatus?.available_scenarios ?? ['light', 'moderate', 'heavy']).map((item) => ({
                value: item,
                label: item === 'light' ? 'Light' : item === 'heavy' ? 'Heavy' : 'Moderate',
              }))}
            />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={busy}
              disabled={demoStatus?.running}
              onClick={() => runDemoAction('start')}
            >
              启动演示
            </Button>
            <Button
              icon={<PauseCircleOutlined />}
              loading={busy}
              disabled={!demoStatus?.running}
              onClick={() => runDemoAction('stop')}
            >
              停止
            </Button>
            <Button
              icon={<StepForwardOutlined />}
              loading={busy}
              onClick={() => runDemoAction('step')}
            >
              单步
            </Button>
            <Button icon={<SyncOutlined />} onClick={refreshDemoStatus}>
              刷新
            </Button>
          </Space>
        </div>
      </Card>

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
