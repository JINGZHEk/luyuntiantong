import React, { useState } from 'react';
import { Layout, Menu, Typography, Badge } from 'antd';
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

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '总览大屏' },
  { key: '/monitor', icon: <MonitorOutlined />, label: '实时监控' },
  { key: '/replay', icon: <PlayCircleOutlined />, label: '事件回放' },
  { key: '/evaluation', icon: <ExperimentOutlined />, label: '模型评估' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

const routeTitles: Record<string, string> = {
  '/': '总览大屏',
  '/monitor': '实时监控',
  '/replay': '事件回放',
  '/evaluation': '模型评估',
  '/settings': '系统设置',
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
        }}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${colors.cardBorder}`,
          }}
        >
          <span
            className="neon-text"
            style={{
              fontSize: collapsed ? 16 : 14,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {collapsed ? 'V2X' : 'V2X 安全防御平台'}
          </span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{
            background: 'transparent',
            borderRight: 0,
          }}
        />
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
          <span style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>
            {pageTitle}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge status="success" text={<span style={{ fontSize: 12, color: colors.textSecondary }}>系统运行中</span>} />
            <span style={{ fontSize: 12, color: colors.textSecondary }}>
              车路云一体化遮挡行人主动安全防御
            </span>
          </div>
        </Header>

        <Content
          style={{
            padding: 16,
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
