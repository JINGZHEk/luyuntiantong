import React, { useState, useEffect } from 'react';
import { Card, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { KpiBar } from '@/widgets/kpi-bar/KpiBar';
import { RiskList } from '@/widgets/risk-list/RiskList';
import { LineChart } from '@/entities/charts/LineChart';
import { useDashboardStore } from '@/store/dashboardStore';
import { CHART_COLORS } from '@/constants/colors';

const LiveClock: React.FC = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span
      style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        color: '#8892a4',
        letterSpacing: '0.05em',
      }}
    >
      {time.toLocaleString('zh-CN', { hour12: false })}
    </span>
  );
};

const PresentationPage: React.FC = () => {
  const navigate = useNavigate();
  const { metrics, riskItems, trendTtc, trendRisk, source } = useDashboardStore();

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #050816 0%, #0a0e1a 50%, #0d1424 100%)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top title bar (72px) */}
      <div
        style={{
          height: 72,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Card
            size="small"
            hoverable
            onClick={() => navigate('/')}
            style={{
              background: 'rgba(0, 212, 255, 0.1)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              cursor: 'pointer',
            }}
            styles={{ body: { padding: '4px 12px' } }}
          >
            <ArrowLeftOutlined style={{ color: '#00d4ff', fontSize: 14 }} />
            <span style={{ color: '#8892a4', fontSize: 12, marginLeft: 6 }}>返回</span>
          </Card>
          <h1
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: '#e0e6f0',
              margin: 0,
              letterSpacing: '0.05em',
            }}
          >
            路云天瞳 · 数字孪生感知平台
          </h1>
          {/* Data source indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span
              className="data-pulse"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: source === 'live' ? '#00ff88' : '#faad14',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 11,
                color: source === 'live' ? '#00ff88' : '#faad14',
                letterSpacing: '0.1em',
              }}
            >
              {source === 'live' ? 'LIVE' : 'MOCK'}
            </span>
          </div>
        </div>
        <LiveClock />
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 12, gap: 12 }}>
        {/* Left: 3D scene (65%) */}
        <div style={{ flex: '0 0 65%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glass-card tech-border" style={{ flex: 1, borderRadius: 8, overflow: 'hidden', padding: 0 }}>
            <IntersectionScene height="100%" cameraMode="cinematic" showLabel />
          </div>
          {/* Bottom: KPI bar */}
          <KpiBar metrics={metrics} />
        </div>

        {/* Right: data panels (35%) */}
        <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          {/* Risk list */}
          <div style={{ flex: '0 0 40%', overflow: 'hidden' }}>
            <RiskList items={riskItems} />
          </div>
          {/* Charts */}
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
            <Card className="glass-card" size="small" style={{ flex: 1 }}>
              <LineChart
                data={trendTtc}
                title="TTC 趋势"
                color={CHART_COLORS.primary}
                height={120}
                yAxisName="秒"
              />
            </Card>
            <Card className="glass-card" size="small" style={{ flex: 1 }}>
              <LineChart
                data={trendRisk}
                title="风险分趋势"
                color={CHART_COLORS.quaternary}
                areaColor="rgba(249, 115, 22, 0.15)"
                height={120}
              />
            </Card>
          </div>
        </div>
      </div>

      {/* Bottom event timeline (60px) */}
      <div
        style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          borderTop: '1px solid rgba(0, 212, 255, 0.1)',
          flexShrink: 0,
          gap: 16,
        }}
      >
        <span style={{ fontSize: 11, color: '#8892a4', whiteSpace: 'nowrap' }}>事件时间轴</span>
        <div
          style={{
            flex: 1,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.2), transparent)',
            position: 'relative',
          }}
        >
          {/* Timeline dots */}
          {riskItems.slice(0, 8).map((item, i) => (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                left: `${(i + 1) * 10}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.riskLevel === 'critical' ? '#ff4d4f' :
                  item.riskLevel === 'high' ? '#ff7a45' :
                  item.riskLevel === 'medium' ? '#faad14' : '#52c41a',
                boxShadow: `0 0 8px ${item.riskLevel === 'critical' ? '#ff4d4f' : '#00d4ff'}80`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            color: '#00d4ff',
          }}
        >
          {riskItems.length} EVENTS
        </span>
      </div>
    </div>
  );
};

export default PresentationPage;
