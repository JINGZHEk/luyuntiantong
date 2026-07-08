import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col } from 'antd';
import {
  ApiOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DisconnectOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { Sparkline } from '@/shared/components/Sparkline';
import { SystemMetrics } from '@/types/metrics';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface KpiBarProps {
  metrics: SystemMetrics;
}

interface KpiCardData {
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals: number;
  suffix: string;
  color: string;
  sparkColor: string;
}

export const KpiBar: React.FC<KpiBarProps> = ({ metrics }) => {
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  // Track sparkline history locally
  const historyRef = useRef<Record<string, number[]>>({
    onlineDevices: [],
    avgLatency: [],
    packetLossRate: [],
    todayHighRiskEvents: [],
  });
  const prevRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const h = historyRef.current;
    const push = (key: string, val: number) => {
      h[key] = [...(h[key] || []), val].slice(-20);
    };
    push('onlineDevices', metrics.onlineDevices);
    push('avgLatency', metrics.avgLatency);
    push('packetLossRate', metrics.packetLossRate * 100);
    push('todayHighRiskEvents', metrics.todayHighRiskEvents);
  }, [metrics]);

  const items: KpiCardData[] = [
    {
      icon: <ApiOutlined style={{ color: colors.success, fontSize: 20 }} />,
      label: '在线设备数',
      value: metrics.onlineDevices,
      decimals: 0,
      suffix: '台',
      color: colors.success,
      sparkColor: '#00ff88',
    },
    {
      icon: <ClockCircleOutlined style={{ color: colors.accent, fontSize: 20 }} />,
      label: '平均时延',
      value: metrics.avgLatency,
      decimals: 1,
      suffix: 'ms',
      color: colors.accent,
      sparkColor: '#00d4ff',
    },
    {
      icon: <DisconnectOutlined style={{ color: '#faad14', fontSize: 20 }} />,
      label: '丢包率',
      value: metrics.packetLossRate * 100,
      decimals: 2,
      suffix: '%',
      color: '#faad14',
      sparkColor: '#faad14',
    },
    {
      icon: <WarningOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />,
      label: '今日高危事件',
      value: metrics.todayHighRiskEvents,
      decimals: 0,
      suffix: '次',
      color: '#ff4d4f',
      sparkColor: '#ff4d4f',
    },
  ];

  return (
    <Row gutter={12} className="fade-in-stagger">
      {items.map((item, idx) => {
        const key = ['onlineDevices', 'avgLatency', 'packetLossRate', 'todayHighRiskEvents'][idx];
        const sparkData = historyRef.current[key] || [];
        const prevVal = prevRef.current[key];
        const trend = prevVal !== undefined && item.value !== prevVal
          ? item.value > prevVal ? 'up' : 'down'
          : 'stable';
        prevRef.current[key] = item.value;

        return (
          <Col xs={12} sm={12} md={6} key={item.label}>
            <Card className="glass-card" size="small" style={{ marginBottom: 12, height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Top: icon + label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.icon}
                  <span style={{ fontSize: 11, color: colors.textSecondary, letterSpacing: '0.02em' }}>
                    {item.label}
                  </span>
                </div>
                {/* Middle: big number */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <AnimatedNumber
                    value={item.value}
                    decimals={item.decimals}
                    suffix={item.suffix}
                    style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 26,
                      fontWeight: 900,
                      color: item.color,
                      lineHeight: 1.1,
                    }}
                  />
                </div>
                {/* Bottom: sparkline + trend */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <Sparkline data={sparkData} color={item.sparkColor} width={70} height={20} />
                  {trend !== 'stable' && (
                    <span
                      style={{
                        fontSize: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        color: trend === 'up' ? '#00ff88' : '#ff4d4f',
                      }}
                    >
                      {trend === 'up' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
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
