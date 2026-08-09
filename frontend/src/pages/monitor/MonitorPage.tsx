import React, { useEffect, useState } from 'react';
import { Row, Col, Result, Button, Card, Space, Tag, message, Select, Switch } from 'antd';
import { MonitorOutlined, PlayCircleOutlined, PauseCircleOutlined, StepForwardOutlined, SyncOutlined } from '@ant-design/icons';
import { ConnectionPanel } from '@/widgets/connection-panel/ConnectionPanel';
import { TopicManager } from '@/widgets/topic-manager/TopicManager';
import { MessagePanel } from '@/widgets/message-panel/MessagePanel';
import { PerceptionCards } from '@/widgets/perception-cards/PerceptionCards';
import { useMonitorStore } from '@/store/monitorStore';
import { PageLoading } from '@/shared/components/PageLoading';
import { PageHeader } from '@/shared/components/PageHeader';
import { DemoStatus, demoApi } from '@/services/demoApi';
import { ScenarioSummary } from '@/types/realtime';
import styles from './MonitorPage.module.css';

const LEGACY_SCENARIOS: ScenarioSummary[] = [
  { scenario_id: 'light', name: '兼容模式 · Light', category: 'ghost_probe', duration_ms: 12000, default_fps: 10, environment: {} },
  { scenario_id: 'moderate', name: '兼容模式 · Moderate', category: 'ghost_probe', duration_ms: 12000, default_fps: 10, environment: {} },
  { scenario_id: 'heavy', name: '兼容模式 · Heavy', category: 'ghost_probe', duration_ms: 12000, default_fps: 10, environment: {} },
];

const MonitorPage: React.FC = () => {
  const { messages, pageState, setError } = useMonitorStore();
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [scenario, setScenario] = useState('GP-01');
  const [scenarioCatalog, setScenarioCatalog] = useState<ScenarioSummary[]>(LEGACY_SCENARIOS);
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadScenarioCatalog = async () => {
    try {
      const result = await demoApi.list();
      setScenarioCatalog([...LEGACY_SCENARIOS, ...result.items]);
      if (!result.items.some((item) => item.scenario_id === scenario) && result.items[0]) {
        setScenario(result.items[0].scenario_id);
      }
    } catch {
      setScenarioCatalog(LEGACY_SCENARIOS);
    }
  };

  const refreshDemoStatus = async () => {
    try {
      const status = await demoApi.status();
      setDemoStatus(status);
      if (status.running) {
        setScenario(status.scenario_id || status.scenario || 'GP-01');
        setLoop(Boolean(status.loop));
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
          ? await demoApi.start(scenario, 10, loop)
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
    loadScenarioCatalog();
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
    <div className={styles.page}>
      <PageHeader
        eyebrow="PIPELINE OBSERVABILITY"
        title="实时监控"
        subtitle="路侧感知 · 车端决策 · 云端事件 实时数据流"
        icon={<MonitorOutlined />}
      />
      <Card className={`glass-card ${styles.controlCard}`} size="small">
        <div className={styles.controlBar}>
          <Space wrap className={styles.statusGroup}>
            <Tag color={demoStatus?.running ? 'green' : 'gold'}>
              {demoStatus?.running ? 'Demo running' : 'Demo idle'}
            </Tag>
            <Tag color="blue">frame {demoStatus?.frame_index ?? '-'}</Tag>
            <Tag color="cyan">{demoStatus?.scene_id ?? 'scene_001'} / {demoStatus?.scenario_id ?? scenario}</Tag>
            <Tag color="purple">run {demoStatus?.run_id ?? '-'}</Tag>
          </Space>
          <Space wrap className={styles.actionGroup}>
            <Select
              value={scenario}
              className={styles.scenarioSelect}
              disabled={demoStatus?.running || busy}
              onChange={setScenario}
              options={scenarioCatalog.map((item) => ({
                value: item.scenario_id,
                label: `${item.scenario_id} · ${item.name}`,
              }))}
            />
            <Switch
              checked={loop}
              disabled={demoStatus?.running || busy}
              checkedChildren="循环"
              unCheckedChildren="单次"
              onChange={setLoop}
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

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <ConnectionPanel />
        </Col>
        <Col xs={24} md={12}>
          <TopicManager />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.section}>
        <Col span={24}>
          <PerceptionCards />
        </Col>
      </Row>

      <Row gutter={[16, 16]} className={styles.section}>
        <Col span={24}>
          <MessagePanel messages={messages} />
        </Col>
      </Row>
    </div>
  );
};

export default MonitorPage;
