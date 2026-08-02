import {
  ApiOutlined,
  ClockCircleOutlined,
  DisconnectOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { RISK_COLORS, CHART_COLORS, SEMANTIC_COLORS } from '@/constants/colors';
import { SystemMetrics } from '@/types/metrics';
import styles from './KpiBar.module.css';

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
