import React, { useEffect } from 'react';
import { Button, Card, Col, message, Result, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import { DownloadOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useEvaluationStore } from '@/store/evaluationStore';
import { MetricCards } from '@/widgets/metric-cards/MetricCards';
import { BarChart } from '@/entities/charts/BarChart';
import { BaseChart } from '@/entities/charts/BaseChart';
import { CHART_COLORS } from '@/constants/colors';
import { PageLoading } from '@/shared/components/PageLoading';
import { PageHeader } from '@/shared/components/PageHeader';
import { downloadJson } from '@/shared/utils/helpers';
import styles from './EvaluationPage.module.css';

const EvaluationPage: React.FC = () => {
  const metrics = useEvaluationStore((state) => state.metrics);
  const baselines = useEvaluationStore((state) => state.baselines);
  const ablations = useEvaluationStore((state) => state.ablations);
  const targetStatus = useEvaluationStore((state) => state.targetStatus);
  const reports = useEvaluationStore((state) => state.reports);
  const selectedReportKey = useEvaluationStore((state) => state.selectedReportKey);
  const source = useEvaluationStore((state) => state.source);
  const summary = useEvaluationStore((state) => state.summary);
  const pageState = useEvaluationStore((state) => state.pageState);
  const loadData = useEvaluationStore((state) => state.loadData);
  const selectReport = useEvaluationStore((state) => state.selectReport);
  const setError = useEvaluationStore((state) => state.setError);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (pageState.loading) return <PageLoading />;

  if (pageState.error) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="MODEL VALIDATION" title="模型评估" subtitle="指标达标、基线对比与消融结果" icon={<ExperimentOutlined />} />
        <Result
          status="error"
          title="评估数据加载失败"
          subTitle={pageState.error}
          extra={<Button type="primary" onClick={() => setError(null)}>重试</Button>}
        />
      </div>
    );
  }

  const baselineCategories = baselines.map((baseline) => baseline.model);
  const selectedReport = reports.find((item) => item.key === selectedReportKey);
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
        data: baselines.slice(0, 3).map((baseline, index) => ({
          value: [baseline.precision, baseline.recall, baseline.f1Score, Math.max(0, 1 - baseline.ade), Math.max(0, 1 - baseline.fde)],
          name: baseline.model,
          lineStyle: { color: [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.tertiary][index] },
          areaStyle: { color: ['rgba(0,212,255,0.15)', 'rgba(0,255,136,0.15)', 'rgba(168,85,247,0.15)'][index] },
        })),
      },
    ],
  };

  const ablationColumns = [
    { title: '变体', dataIndex: 'variant', key: 'variant' },
    { title: 'F1 Score', dataIndex: 'f1Score', key: 'f1', render: (value: number) => value.toFixed(3) },
    { title: 'ADE', dataIndex: 'ade', key: 'ade', render: (value: number) => value.toFixed(2) },
    { title: 'FDE', dataIndex: 'fde', key: 'fde', render: (value: number) => value.toFixed(2) },
    { title: '说明', dataIndex: 'description', key: 'desc' },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="MODEL VALIDATION"
        title="模型评估"
        subtitle="指标达标、基线对比与消融结果"
        icon={<ExperimentOutlined />}
        extra={source === 'mock' ? <Tag className={styles.demoTag} color="gold">演示数据</Tag> : undefined}
      />

      <Card className={`glass-card ${styles.summaryCard}`} size="small">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={7}>
            <Space wrap>
              <span className={styles.summaryLabel}>数据源</span>
              <Tag color={source === 'live' ? 'green' : 'gold'}>{source === 'live' ? 'LIVE' : 'MOCK'}</Tag>
              {selectedReport?.source && <Tag color="blue">{selectedReport.source}</Tag>}
            </Space>
          </Col>
          <Col xs={24} md={7}>
            <Select
              size="small"
              className={styles.reportSelect}
              value={selectedReportKey}
              onChange={(value) => void selectReport(value)}
              aria-label="选择评估报告"
              options={reports.map((item) => ({
                value: item.key,
                label: `${item.label}${item.available ? '' : '（未生成）'}`,
                disabled: !item.available,
              }))}
            />
          </Col>
          <Col xs={8} md={3}><Statistic title="样本帧" value={summary.sampleCount} /></Col>
          <Col xs={8} md={3}><Statistic title="高危事件" value={summary.eventCount} /></Col>
          <Col xs={8} md={4}><Statistic title="最低 TTC" value={summary.minTtc ?? 0} precision={2} suffix="s" /></Col>
        </Row>
      </Card>

      <section className={styles.section} aria-label="核心指标">
        <MetricCards metrics={metrics} />
      </section>

      {targetStatus.length > 0 && (
        <section className={styles.section} aria-label="指标达标状态">
          <Card className="glass-card" title="指标达标状态" size="small">
            <div className={styles.targetList} role="list">
              {targetStatus.map((target) => (
                <div key={target.key} className={styles.targetRow} role="listitem">
                  <div className={styles.targetMetric}>
                    <strong>{target.metric}</strong>
                    <span>{target.unit}</span>
                  </div>
                  <span className={styles.targetValue}>{typeof target.value === 'number' ? target.value.toFixed(2) : '--'}</span>
                  <span className={styles.targetGoal}>{target.target}</span>
                  <Tag color={target.status === 'pass' ? 'green' : target.status === 'fail' ? 'red' : 'default'}>
                    {target.status === 'pass' ? '达标' : target.status === 'fail' ? '未达标' : '待测'}
                  </Tag>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <Row gutter={[12, 12]} className={styles.section}>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="基线对比 — F1 / Precision / Recall" size="small">
            <BarChart
              categories={baselineCategories}
              series={[
                { name: 'F1 Score', data: baselines.map((baseline) => baseline.f1Score), color: CHART_COLORS.primary },
                { name: 'Precision', data: baselines.map((baseline) => baseline.precision), color: CHART_COLORS.secondary },
                { name: 'Recall', data: baselines.map((baseline) => baseline.recall), color: CHART_COLORS.tertiary },
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

      <Row gutter={[12, 12]} className={styles.section}>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="消融实验 — F1 Score" size="small">
            <BarChart
              categories={ablations.map((ablation) => ablation.variant)}
              series={[{ name: 'F1 Score', data: ablations.map((ablation) => ablation.f1Score), color: CHART_COLORS.primary }]}
              height={280}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="glass-card" title="消融实验 — ADE / FDE" size="small">
            <BarChart
              categories={ablations.map((ablation) => ablation.variant)}
              series={[
                { name: 'ADE', data: ablations.map((ablation) => ablation.ade), color: CHART_COLORS.quaternary },
                { name: 'FDE', data: ablations.map((ablation) => ablation.fde), color: CHART_COLORS.quinary },
              ]}
              height={280}
            />
          </Card>
        </Col>
      </Row>

      <section className={styles.section} aria-label="消融实验详情">
        <Card
          className="glass-card"
          title="消融实验详情"
          size="small"
          extra={
            <Button
              icon={<DownloadOutlined />}
              size="small"
              onClick={() => {
                downloadJson({ metrics, baselines, ablations, targetStatus, summary, selectedReportKey }, `evaluation-report-${selectedReportKey || 'default'}.json`);
                message.success('报告已导出');
              }}
            >
              导出报告
            </Button>
          }
        >
          <Table dataSource={ablations} columns={ablationColumns} rowKey="variant" size="small" pagination={false} />
        </Card>
      </section>
    </div>
  );
};

export default EvaluationPage;
