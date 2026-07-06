import React from 'react';
import { Card, Row, Col } from 'antd';
import {
  ApiOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { SystemMetrics } from '@/types/metrics';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface KpiBarProps {
  metrics: SystemMetrics;
}

export const KpiBar: React.FC<KpiBarProps> = ({ metrics }) => {
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const items = [
    {
      icon: <ApiOutlined style={{ color: colors.success, fontSize: 24 }} />,
      label: '在线设备数',
      value: metrics.onlineDevices,
      decimals: 0,
      suffix: '台',
      color: colors.success,
    },
    {
      icon: <ClockCircleOutlined style={{ color: colors.accent, fontSize: 24 }} />,
      label: '平均时延',
      value: metrics.avgLatency,
      decimals: 1,
      suffix: 'ms',
      color: colors.accent,
    },
    {
      icon: <DisconnectOutlined style={{ color: '#faad14', fontSize: 24 }} />,
      label: '丢包率',
      value: metrics.packetLossRate * 100,
      decimals: 2,
      suffix: '%',
      color: '#faad14',
    },
    {
      icon: <WarningOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />,
      label: '今日高危事件',
      value: metrics.todayHighRiskEvents,
      decimals: 0,
      suffix: '次',
      color: '#ff4d4f',
    },
  ];

  return (
    <Row gutter={16}>
      {items.map((item) => (
        <Col xs={12} sm={12} md={6} key={item.label}>
          <Card className="glass-card" size="small" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {item.icon}
              <div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>
                  <AnimatedNumber
                    value={item.value}
                    decimals={item.decimals}
                    suffix={item.suffix}
                  />
                </div>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
