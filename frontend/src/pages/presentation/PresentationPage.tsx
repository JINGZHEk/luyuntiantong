import React, { useEffect, useState } from 'react';
import { Card } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { KpiBar } from '@/widgets/kpi-bar/KpiBar';
import { RiskList } from '@/widgets/risk-list/RiskList';
import { LineChart } from '@/entities/charts/LineChart';
import { useDashboardStore } from '@/store/dashboardStore';
import { CHART_COLORS } from '@/constants/colors';
import styles from './PresentationPage.module.css';

const timelinePositions = [
  styles.position10,
  styles.position20,
  styles.position30,
  styles.position40,
  styles.position50,
  styles.position60,
  styles.position70,
  styles.position80,
];

const LiveClock: React.FC = () => {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className={styles.clock} dateTime={time.toISOString()}>{time.toLocaleString('zh-CN', { hour12: false })}</time>;
};

const PresentationPage: React.FC = () => {
  const navigate = useNavigate();
  const metrics = useDashboardStore((state) => state.metrics);
  const riskItems = useDashboardStore((state) => state.riskItems);
  const trendTtc = useDashboardStore((state) => state.trendTtc);
  const trendRisk = useDashboardStore((state) => state.trendRisk);
  const source = useDashboardStore((state) => state.source);

  return (
    <div className={styles.presentation}>
      <header className={styles.topbar}>
        <div className={styles.brandGroup}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/')} aria-label="返回总览大屏">
            <ArrowLeftOutlined />
            <span>返回控制台</span>
          </button>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>ROADSIDE DIGITAL TWIN</span>
            <h1>路云天瞳 · 数字孪生感知平台</h1>
          </div>
          <div className={styles.sourceBadge}>
            <span className={`${styles.sourceDot} ${source === 'live' ? styles.sourceLive : styles.sourceMock}`} aria-hidden="true" />
            <span>{source === 'live' ? 'LIVE' : 'MOCK'}</span>
          </div>
        </div>
        <LiveClock />
      </header>

      <main className={styles.main}>
        <section className={styles.sceneColumn} aria-label="数字孪生路口">
          <div className={`glass-card tech-border ${styles.scenePanel}`}>
            <IntersectionScene height="100%" cameraMode="cinematic" showLabel />
          </div>
          <KpiBar metrics={metrics} />
        </section>

        <aside className={styles.dataColumn} aria-label="实时风险与趋势">
          <div className={styles.riskPanel}>
            <RiskList items={riskItems} />
          </div>
          <div className={styles.chartStack}>
            <Card className="glass-card" size="small">
              <LineChart data={trendTtc} title="TTC 趋势" color={CHART_COLORS.primary} height={120} yAxisName="秒" threshold={3} />
            </Card>
            <Card className="glass-card" size="small">
              <LineChart data={trendRisk} title="风险分趋势" color={CHART_COLORS.quaternary} areaColor="rgba(249, 115, 22, 0.15)" height={120} threshold={0.7} />
            </Card>
          </div>
        </aside>
      </main>

      <footer className={styles.timeline} aria-label="事件时间轴">
        <span className={styles.timelineLabel}>事件时间轴</span>
        <div className={styles.timelineTrack}>
          {riskItems.slice(0, 8).map((item, index) => (
            <span
              key={item.id}
              className={`${styles.timelineDot} ${styles[`risk_${item.riskLevel}`]} ${timelinePositions[index]}`}
              aria-label={`${item.target} ${item.riskLevel}`}
            />
          ))}
        </div>
        <span className={styles.eventCount}>{riskItems.length} EVENTS</span>
      </footer>
    </div>
  );
};

export default PresentationPage;
