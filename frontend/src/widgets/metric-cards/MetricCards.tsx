import React from 'react';
import { Card, Row, Col } from 'antd';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { ModelMetrics } from '@/types/metrics';
import styles from './MetricCards.module.css';

interface MetricCardsProps {
  metrics: ModelMetrics;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ metrics }) => {
  const items = [
    { label: 'Precision', value: metrics.precision, decimals: 3, colorClass: styles.precision },
    { label: 'Recall', value: metrics.recall, decimals: 3, colorClass: styles.recall },
    { label: 'F1 Score', value: metrics.f1Score, decimals: 3, colorClass: styles.f1 },
    { label: 'ADE (m)', value: metrics.ade, decimals: 2, colorClass: styles.ade },
    { label: 'FDE (m)', value: metrics.fde, decimals: 2, colorClass: styles.fde },
    ...(typeof metrics.missRate === 'number'
      ? [{ label: 'Miss Rate', value: metrics.missRate, decimals: 3, colorClass: styles.fde }]
      : []),
    ...(typeof metrics.occAde === 'number'
      ? [{ label: 'Occ-ADE (m)', value: metrics.occAde, decimals: 2, colorClass: styles.occAde }]
      : []),
    ...(typeof metrics.occAcc === 'number'
      ? [{ label: 'Occ-Acc', value: metrics.occAcc, decimals: 3, colorClass: styles.occAcc }]
      : []),
    { label: 'Latency (ms)', value: metrics.avgLatency, decimals: 1, colorClass: styles.latency },
    ...(typeof metrics.e2eLatency === 'number'
      ? [{ label: 'E2E-Lat (ms)', value: metrics.e2eLatency, decimals: 1, colorClass: styles.e2eLatency }]
      : []),
    ...(typeof metrics.leadTime === 'number'
      ? [{ label: 'Lead-Time (s)', value: metrics.leadTime, decimals: 2, colorClass: styles.leadTime }]
      : []),
  ];

  return (
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col xs={12} sm={8} md={4} key={item.label}>
          <Card className={`glass-card ${styles.card}`} size="small">
            <div className={styles.content}>
              <div className={styles.label}>
                {item.label}
              </div>
              <div className={`${styles.value} ${item.colorClass}`}>
                <AnimatedNumber value={item.value} decimals={item.decimals} className={styles.number} />
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
