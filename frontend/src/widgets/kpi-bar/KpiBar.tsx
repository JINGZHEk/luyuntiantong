import React, { useEffect, useRef } from 'react';
import { Card, Col, Row } from 'antd';
import {
  ApiOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { Sparkline } from '@/shared/components/Sparkline';
import { RISK_COLORS, CHART_COLORS, SEMANTIC_COLORS } from '@/constants/colors';
import { SystemMetrics } from '@/types/metrics';
import { getTrendDirection, getTrendPercent, TrendDirection } from './trend';
import styles from './KpiBar.module.css';

interface KpiBarProps {
  metrics: SystemMetrics;
}

interface KpiCardData {
  key: keyof SystemMetrics;
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals: number;
  suffix: string;
  colorClass: string;
  sparkColor: string;
}

const metricKeys: KpiCardData['key'][] = [
  'onlineDevices',
  'avgLatency',
  'packetLossRate',
  'todayHighRiskEvents',
];

const trendIcon: Record<Exclude<TrendDirection, 'stable'>, React.ReactNode> = {
  up: <ArrowUpOutlined />,
  down: <ArrowDownOutlined />,
};

export function buildKpiItems(metrics: SystemMetrics): KpiCardData[] {
  return [
    {
      key: 'onlineDevices',
      icon: <ApiOutlined className={styles.iconSuccess} />,
      label: '在线设备数',
      value: metrics.onlineDevices,
      decimals: 0,
      suffix: '台',
      colorClass: styles.valueSuccess,
      sparkColor: SEMANTIC_COLORS.online,
    },
    {
      key: 'avgLatency',
      icon: <ClockCircleOutlined className={styles.iconAccent} />,
      label: '平均时延',
      value: metrics.avgLatency,
      decimals: 1,
      suffix: 'ms',
      colorClass: styles.valueAccent,
      sparkColor: CHART_COLORS.primary,
    },
    {
      key: 'packetLossRate',
      icon: <DisconnectOutlined className={styles.iconWarning} />,
      label: '丢包率',
      value: metrics.packetLossRate * 100,
      decimals: 2,
      suffix: '%',
      colorClass: styles.valueWarning,
      sparkColor: RISK_COLORS.medium,
    },
    {
      key: 'todayHighRiskEvents',
      icon: <WarningOutlined className={styles.iconDanger} />,
      label: '今日高危事件',
      value: metrics.todayHighRiskEvents,
      decimals: 0,
      suffix: '次',
      colorClass: styles.valueDanger,
      sparkColor: RISK_COLORS.critical,
    },
  ];
}

export const KpiBar: React.FC<KpiBarProps> = ({ metrics }) => {
  const historyRef = useRef<Record<string, number[]>>({});
  const previousRef = useRef<Record<string, number>>({});
  const items = buildKpiItems(metrics);

  useEffect(() => {
    items.forEach((item) => {
      const history = historyRef.current[item.key] || [];
      historyRef.current[item.key] = [...history, item.value].slice(-20);
    });
  }, [items]);

  return (
    <Row gutter={[12, 12]} className="fade-in-stagger">
      {items.map((item) => {
        const previous = previousRef.current[item.key];
        const direction = getTrendDirection(item.value, previous);
        const percent = getTrendPercent(item.value, previous);
        const trendClass = direction === 'up' ? styles.trendUp : styles.trendDown;
        previousRef.current[item.key] = item.value;
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

export { metricKeys };
