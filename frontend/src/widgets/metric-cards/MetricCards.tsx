import React from 'react';
import { Card, Row, Col } from 'antd';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { ModelMetrics } from '@/types/metrics';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS, CHART_COLORS } from '@/constants/colors';

interface MetricCardsProps {
  metrics: ModelMetrics;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ metrics }) => {
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const items = [
    { label: 'Precision', value: metrics.precision, decimals: 3, color: CHART_COLORS.primary },
    { label: 'Recall', value: metrics.recall, decimals: 3, color: CHART_COLORS.secondary },
    { label: 'F1 Score', value: metrics.f1Score, decimals: 3, color: CHART_COLORS.tertiary },
    { label: 'ADE (m)', value: metrics.ade, decimals: 2, color: CHART_COLORS.quaternary },
    { label: 'FDE (m)', value: metrics.fde, decimals: 2, color: CHART_COLORS.quinary },
    ...(typeof metrics.occAde === 'number'
      ? [{ label: 'Occ-ADE (m)', value: metrics.occAde, decimals: 2, color: CHART_COLORS.line3 }]
      : []),
    ...(typeof metrics.occAcc === 'number'
      ? [{ label: 'Occ-Acc', value: metrics.occAcc, decimals: 3, color: CHART_COLORS.line2 }]
      : []),
    { label: 'Latency (ms)', value: metrics.avgLatency, decimals: 1, color: colors.accent },
    ...(typeof metrics.e2eLatency === 'number'
      ? [{ label: 'E2E-Lat (ms)', value: metrics.e2eLatency, decimals: 1, color: CHART_COLORS.line4 }]
      : []),
    ...(typeof metrics.leadTime === 'number'
      ? [{ label: 'Lead-Time (s)', value: metrics.leadTime, decimals: 2, color: CHART_COLORS.line3 }]
      : []),
  ];

  return (
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col xs={12} sm={8} md={4} key={item.label}>
          <Card className="glass-card" size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>
                <AnimatedNumber value={item.value} decimals={item.decimals} />
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
