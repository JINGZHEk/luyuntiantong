import React, { useState, useEffect } from 'react';
import { Layout, Menu, Badge } from 'antd';
import {
  DashboardOutlined,
  MonitorOutlined,
  PlayCircleOutlined,
  ExperimentOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';
import { NAV_ITEMS } from '@/constants/config';

const { Header, Sider, Content } = Layout;

const iconMap: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  MonitorOutlined: <MonitorOutlined />,
  PlayCircleOutlined: <PlayCircleOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  SettingOutlined: <SettingOutlined />,
};

const menuItems = NAV_ITEMS.map((item) => ({
  key: item.key,
  icon: iconMap[item.icon],
  label: item.label,
}));

const routeTitles: Record<string, string> = {
  '/': '总览大屏',
  '/monitor': '实时监控',
  '/replay': '事件回放',
  '/evaluation': '模型评估',
  '/settings': '系统设置',
};

// SVG Logo — 雷达盾牌造型
const BrandLogo: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div
    style={{
      height: 56,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: collapsed ? '0' : '0 16px',
      justifyContent: 'center',
      borderBottom: '1px solid rgba(0, 212, 255, 0.1)',
      position: 'relative',
    }}
  >
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#0099cc" />
        </linearGradient>
      </defs>
      {/* Shield outline */}
      <path
        d="M16 2 L28 8 L28 18 C28 24 22 29 16 31 C10 29 4 24 4 18 L4 8 Z"
        stroke="url(#logoGrad)"
        strokeWidth="1.5"
        fill="rgba(0, 212, 255, 0.08)"
      />
      {/* Radar circles */}
      <circle cx="16" cy="14" r="8" stroke="url(#logoGrad)" strokeWidth="1" fill="none" opacity="0.5" />
      <circle cx="16" cy="14" r="5" stroke="url(#logoGrad)" strokeWidth="1" fill="none" opacity="0.7" />
      <circle cx="16" cy="14" r="2" fill="#00d4ff" />
      {/* Radar sweep */}
      <path d="M16 14 L24 14" stroke="url(#logoGrad)" strokeWidth="1" opacity="0.8" />
    </svg>
    {!collapsed && (
      <span
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 16,
          fontWeight: 700,
          color: '#e0e6f0',
          whiteSpace: 'nowrap',
          letterSpacing: '0.05em',
        }}
      >
        路云天瞳
      </span>
    )}
    {/* Bottom gradient line */}
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
        opacity: 0.4,
      }}
    />
  </div>
);

// Bottom status area
const StatusArea: React.FC = () => (
  <div
    style={{
      padding: '16px 20px',
      borderTop: '1px solid rgba(0, 212, 255, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}
  >
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
      <span
        style={{
          fontSize: 11,
          color: '#8892a4',
          letterSpacing: '0.1em',
        }}
      >
        SYSTEM ONLINE
      </span>
    </div>
    <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
      API Latency: 12ms
    </span>
  </div>
);

// Live clock
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
        fontSize: 13,
        color: '#8892a4',
        letterSpacing: '0.05em',
      }}
    >
      {time.toLocaleTimeString('zh-CN', { hour12: false })}
    </span>
  );
};

export const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const pageTitle = routeTitles[location.pathname] || 'V2X 平台';

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={200}
        style={{
          background: colors.siderBg,
          borderRight: `1px solid ${colors.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <BrandLogo collapsed={collapsed} />
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              background: 'transparent',
              borderRight: 0,
              flex: 1,
            }}
          />
          <StatusArea />
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: colors.headerBg,
            borderBottom: `1px solid ${colors.cardBorder}`,
            padding: '0 20px',
            height: 48,
            lineHeight: '48px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>
              {pageTitle}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Data source label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              <span
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  color: '#00ff88',
                  letterSpacing: '0.1em',
                }}
              >
                LIVE
              </span>
            </div>
            {/* WebSocket status */}
            <Badge
              status="success"
              text={
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  WebSocket 已连接
                </span>
              }
            />
            <LiveClock />
          </div>
        </Header>

        <Content
          style={{
            padding: 20,
            overflow: 'auto',
            background: colors.bg,
          }}
        >
          <Breadcrumbs />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
};
