import React from 'react';
import { Row, Col, Tag } from 'antd';
import { useDashboardStore } from '@/store/dashboardStore';
import { KpiBar } from '@/widgets/kpi-bar/KpiBar';
import { RiskList } from '@/widgets/risk-list/RiskList';
import { LogStream } from '@/widgets/log-stream/LogStream';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { LineChart } from '@/entities/charts/LineChart';
import { CHART_COLORS } from '@/constants/colors';
import { PageLoading } from '@/shared/components/PageLoading';

const DashboardPage: React.FC = () => {
  const {
    metrics,
    riskItems,
    trendTtc,
    trendRisk,
    trendBrake,
    logs,
    logFilter,
    setLogFilter,
    source,
    pageState,
  } = useDashboardStore();

  if (pageState.loading) return <PageLoading />;

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Tag color={source === 'live' ? 'green' : 'gold'}>{source === 'live' ? 'live' : 'mock'}</Tag>
      </div>
      <KpiBar metrics={metrics} />

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col xs={24} lg={5}>
          <RiskList items={riskItems} />
        </Col>

        <Col xs={24} lg={13}>
          <div className="glass-card" style={{ borderRadius: 8, overflow: 'hidden' }}>
            <IntersectionScene height={420} showLabel />
          </div>
        </Col>

        <Col xs={24} lg={6}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="glass-card" style={{ borderRadius: 8, padding: 8 }}>
              <LineChart
                data={trendTtc}
                title="TTC 趋势"
                color={CHART_COLORS.primary}
                height={125}
                yAxisName="秒"
              />
            </div>
            <div className="glass-card" style={{ borderRadius: 8, padding: 8 }}>
              <LineChart
                data={trendRisk}
                title="风险分趋势"
                color={CHART_COLORS.quaternary}
                areaColor="rgba(249, 115, 22, 0.15)"
                height={125}
              />
            </div>
            <div className="glass-card" style={{ borderRadius: 8, padding: 8 }}>
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
        </Col>
      </Row>

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col span={24}>
          <LogStream logs={logs} filter={logFilter} onFilterChange={setLogFilter} />
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
