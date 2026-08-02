import React, { useEffect, useMemo, useRef } from 'react';
import { Card, Col, Row } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { Sparkline } from '@/shared/components/Sparkline';
import { SystemMetrics } from '@/types/metrics';
import { getTrendDirection, getTrendPercent, TrendDirection } from './trend';
import { buildKpiItems } from './kpi-utils';
import styles from './KpiBar.module.css';

interface KpiBarProps {
  metrics: SystemMetrics;
}

const trendIcon: Record<Exclude<TrendDirection, 'stable'>, React.ReactNode> = {
  up: <ArrowUpOutlined />,
  down: <ArrowDownOutlined />,
};

export const KpiBar: React.FC<KpiBarProps> = ({ metrics }) => {
  const historyRef = useRef<Record<string, number[]>>({});
  const previousRef = useRef<Record<string, number>>({});
  const items = useMemo(
    () => buildKpiItems(metrics),
    [metrics],
  );

  useEffect(() => {
    items.forEach((item) => {
      const history = historyRef.current[item.key] || [];
      historyRef.current[item.key] = [...history, item.value].slice(-20);
      previousRef.current[item.key] = item.value;
    });
  }, [items]);

  return (
    <Row gutter={[12, 12]} className="fade-in-stagger">
      {items.map((item) => {
        const previous = previousRef.current[item.key];
        const direction = getTrendDirection(item.value, previous);
        const percent = getTrendPercent(item.value, previous);
        const trendClass = direction === 'up' ? styles.trendUp : styles.trendDown;
        const trendLabel = percent === null ? '暂无趋势数据' : `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;

        return (
          <Col xs={12} sm={12} md={6} key={item.key} className={styles.column}>
            <Card className={`glass-card ${styles.card}`} size="small">
              <div className={styles.cardContent}>
                <div className={styles.metricHead}>
                  <span className={styles.metricIcon}>{item.icon}</span>
                  <span className={styles.metricLabel}>{item.label}</span>
                </div>
                <div className={`${styles.metricValue} ${item.colorClass}`}>
                  <AnimatedNumber
                    value={item.value}
                    decimals={item.decimals}
                    suffix={item.suffix}
                    className={styles.number}
                  />
                </div>
                <div className={styles.sparklineRow}>
                  <Sparkline data={historyRef.current[item.key] || []} color={item.sparkColor} width={84} height={22} />
                  {direction === 'stable' ? (
                    <span className={styles.trendStable} aria-label={trendLabel}>—</span>
                  ) : (
                    <span className={`${styles.trend} ${trendClass}`} aria-label={`${item.label}变化 ${trendLabel}`}>
                      {trendIcon[direction]}
                      <span>{trendLabel}</span>
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
};
