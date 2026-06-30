import React, { useEffect } from 'react';
import { Row, Col, Card, Button, message, Result, Table, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useEvaluationStore } from '@/store/evaluationStore';
import { MetricCards } from '@/widgets/metric-cards/MetricCards';
import { BarChart } from '@/entities/charts/BarChart';
import { BaseChart } from '@/entities/charts/BaseChart';
import { CHART_COLORS } from '@/constants/colors';
import { PageLoading } from '@/shared/components/PageLoading';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

const { Title } = Typography;

const EvaluationPage: React.FC = () => {
  const { metrics, baselines, ablations, pageState, loadData, setError } = useEvaluationStore();
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (pageState.loading) return <PageLoading />;

  if (pageState.error) {
    return (
      <Result
        status="error"
        title="评估数据加载失败"
        subTitle={pageState.error}
        extra={<Button type="primary" onClick={() => setError(null)}>重试</Button>}
      />
    );
  }

  const baselineCategories = baselines.map((b) => b.model);

  const radarOption = {
    tooltip: {},
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    radar: {
      indicator: [
        { name: 'Precision', max: 1 },
        { name: 'Recall', max: 1 },
        { name: 'F1 Score', max: 1 },
        { name: '1-ADE', max: 1 },
        { name: '1-FDE', max: 1 },
      ],
      shape: 'polygon' as const,
      splitArea: { areaStyle: { color: ['rgba(0,212,255,0.02)', 'rgba(0,212,255,0.05)'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
    },
    series: [
      {
        type: 'radar' as const,
        data: baselines.slice(0, 3).map((b, i) => ({
          value: [b.precision, b.recall, b.f1Score, Math.max(0, 1 - b.ade), Math.max(0, 1 - b.fde)],
          name: b.model,
          lineStyle: {
            color: [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary][i],
          },
          areaStyle: {
            color: [
              'rgba(0,212,255,0.15)',
              'rgba(0,255,136,0.15)',
              'rgba(168,85,247,0.15)',
            ][i],
          },
        })),
      },
    ],
  };

  const ablationColumns = [
    { title: '变体', dataIndex: 'variant', key: 'variant' },
    { title: 'F1 Score', dataIndex: 'f1Score', key: 'f1', render: (v: number) => v.toFixed(3) },
    { title: 'ADE', dataIndex: 'ade', key: 'ade', render: (v: number) => v.toFixed(2) },
    { title: 'FDE', dataIndex: 'fde', key: 'fde', render: (v: number) => v.toFixed(2) },
    { title: '说明', dataIndex: 'description', key: 'desc' },
  ];

  return (
    <div>
      <MetricCards metrics={metrics} />

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card
            className="glass-card"
            title="基线对比 — F1 / Precision / Recall"
            size="small"
          >
            <BarChart
              categories={baselineCategories}
              series={[
                { name: 'F1 Score', data: baselines.map((b) => b.f1Score), color: CHART_COLORS.primary },
                { name: 'Precision', data: baselines.map((b) => b.precision), color: CHART_COLORS.secondary },
                { name: 'Recall', data: baselines.map((b) => b.recall), color: CHART_COLORS.tertiary },
              ]}
              height={320}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="雷达图对比" size="small">
            <BaseChart option={radarOption} height={320} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="消融实验 — F1 Score" size="small">
            <BarChart
              categories={ablations.map((a) => a.variant)}
              series={[
                {
                  name: 'F1 Score',
                  data: ablations.map((a) => a.f1Score),
                  color: CHART_COLORS.primary,
                },
              ]}
              height={280}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="消融实验 — ADE / FDE" size="small">
            <BarChart
              categories={ablations.map((a) => a.variant)}
              series={[
                { name: 'ADE', data: ablations.map((a) => a.ade), color: CHART_COLORS.quaternary },
                { name: 'FDE', data: ablations.map((a) => a.fde), color: CHART_COLORS.quinary },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col span={24}>
          <Card
            className="glass-card"
            title="消融实验详情"
            size="small"
            extra={
              <Button
                icon={<DownloadOutlined />}
                size="small"
                onClick={() => message.info('导出功能将在接入后端后启用')}
              >
                导出报告
              </Button>
            }
          >
            <Table
              dataSource={ablations}
              columns={ablationColumns}
              rowKey="variant"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default EvaluationPage;
