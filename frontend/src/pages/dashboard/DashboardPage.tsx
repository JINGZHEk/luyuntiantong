import React from 'react';
import { Tag } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';
import { useDashboardStore } from '@/store/dashboardStore';
import { KpiBar } from '@/widgets/kpi-bar/KpiBar';
import { RiskList } from '@/widgets/risk-list/RiskList';
import { LogStream } from '@/widgets/log-stream/LogStream';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { LineChart } from '@/entities/charts/LineChart';
import { CHART_COLORS } from '@/constants/colors';
import { PageLoading } from '@/shared/components/PageLoading';
import { PageHeader } from '@/shared/components/PageHeader';
import styles from './DashboardPage.module.css';

const DashboardPage: React.FC = () => {
  const metrics = useDashboardStore((state) => state.metrics);
  const riskItems = useDashboardStore((state) => state.riskItems);
  const trendTtc = useDashboardStore((state) => state.trendTtc);
  const trendRisk = useDashboardStore((state) => state.trendRisk);
  const trendBrake = useDashboardStore((state) => state.trendBrake);
  const logs = useDashboardStore((state) => state.logs);
  const logFilter = useDashboardStore((state) => state.logFilter);
  const setLogFilter = useDashboardStore((state) => state.setLogFilter);
  const source = useDashboardStore((state) => state.source);
  const pageState = useDashboardStore((state) => state.pageState);

  if (pageState.loading) return <PageLoading />;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="LIVE INTERSECTION TELEMETRY"
        title="总览大屏"
        subtitle="V2X 遮挡行人主动安全防御 · 实时态势感知"
        icon={<DashboardOutlined />}
        extra={
          <Tag className={styles.sourceTag} color={source === 'live' ? 'green' : 'gold'}>
            {source === 'live' ? 'LIVE DATA' : '演示数据'}
          </Tag>
        }
      />

      <section className={styles.kpiSection} aria-label="系统关键指标">
        <KpiBar metrics={metrics} />
      </section>

      <section className={styles.overviewGrid} aria-label="实时路口态势">
        <div className={styles.riskColumn}>
          <RiskList items={riskItems} />
        </div>

        <div className={`glass-card tech-border ${styles.sceneCard}`}>
          <IntersectionScene height={420} showLabel />
        </div>

        <div className={styles.chartStack}>
          <div className={`glass-card ${styles.chartCard}`}>
            <LineChart
              data={trendTtc}
              title="TTC 趋势"
              color={CHART_COLORS.primary}
              height={125}
              yAxisName="秒"
              threshold={3}
            />
          </div>
          <div className={`glass-card ${styles.chartCard}`}>
            <LineChart
              data={trendRisk}
              title="风险分趋势"
              color={CHART_COLORS.quaternary}
              areaColor="rgba(249, 115, 22, 0.15)"
              height={125}
              threshold={0.7}
            />
          </div>
          <div className={`glass-card ${styles.chartCard}`}>
            <LineChart
              data={trendBrake}
              title="制动触发"
              color={CHART_COLORS.quinary}
              areaColor="rgba(236, 72, 153, 0.15)"
              height={125}
              smooth={false}
            />
          </div>
        </div>
      </section>

      <section className={styles.logSection} aria-label="实时日志">
        <LogStream logs={logs} filter={logFilter} onFilterChange={setLogFilter} />
      </section>
    </div>
  );
};

export default DashboardPage;
