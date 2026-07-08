import React, { useState } from 'react';
import { Card, Button, Space, Empty } from 'antd';
import { RiskItem } from '@/mock/dashboardMock';
import { RISK_COLORS } from '@/constants/colors';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface RiskListProps {
  items: RiskItem[];
}

type SortField = 'riskScore' | 'ttc' | 'timestamp';

const sortLabels: Record<SortField, string> = {
  riskScore: '风险分',
  ttc: 'TTC',
  timestamp: '时间',
};

export const RiskList: React.FC<RiskListProps> = ({ items }) => {
  const [sortBy, setSortBy] = useState<SortField>('riskScore');
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'riskScore') return b.riskScore - a.riskScore;
    if (sortBy === 'ttc') return a.ttc - b.ttc;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return (
    <Card
      className="glass-card tech-border"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="data-pulse"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#00ff88',
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>实时风险榜</span>
        </div>
      }
      size="small"
      extra={
        <Space size={4}>
          {(Object.keys(sortLabels) as SortField[]).map((field) => (
            <Button
              key={field}
              size="small"
              type={sortBy === field ? 'primary' : 'text'}
              onClick={() => setSortBy(field)}
              style={
                sortBy === field
                  ? {
                      background: 'rgba(0, 212, 255, 0.15)',
                      borderColor: 'rgba(0, 212, 255, 0.4)',
                      color: '#00d4ff',
                      fontSize: 11,
                    }
                  : { fontSize: 11, color: colors.textSecondary }
              }
            >
              {sortLabels[field]}
            </Button>
          ))}
        </Space>
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: '4px 8px', maxHeight: 400, overflow: 'auto' } }}
    >
      {sorted.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险数据" />
      ) : (
        sorted.map((item, idx) => {
          const riskColor = RISK_COLORS[item.riskLevel];
          const isCritical = item.riskLevel === 'critical';
          return (
            <div
              key={item.id}
              className="fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                marginBottom: 2,
                borderRadius: 4,
                position: 'relative',
                cursor: 'pointer',
                background: isCritical ? 'rgba(255, 77, 79, 0.06)' : 'transparent',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isCritical
                  ? 'rgba(255, 77, 79, 0.12)'
                  : 'rgba(0, 212, 255, 0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isCritical
                  ? 'rgba(255, 77, 79, 0.06)'
                  : 'transparent';
              }}
            >
              {/* Left risk line */}
              <div
                style={{
                  width: 3,
                  height: 32,
                  borderRadius: 2,
                  background: riskColor,
                  flexShrink: 0,
                  boxShadow: `0 0 8px ${riskColor}80`,
                }}
              />
              {/* Rank number */}
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: riskColor,
                  width: 28,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              {/* Middle: target + details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
                  {item.target}
                </div>
                <div style={{ fontSize: 10, color: colors.textSecondary }}>
                  TTC: {item.ttc}s · {item.location}
                </div>
              </div>
              {/* Right: risk score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span
                  style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: riskColor,
                  }}
                >
                  {item.riskScore.toFixed(2)}
                </span>
                <div
                  style={{
                    fontSize: 9,
                    color: riskColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {item.riskLevel}
                </div>
              </div>
            </div>
          );
        })
      )}
    </Card>
  );
};
