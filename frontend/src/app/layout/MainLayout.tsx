import React, { useEffect, useState } from 'react';
import { Badge, Button, Layout, Menu, Tooltip } from 'antd';
import {
  DashboardOutlined,
  ExperimentOutlined,
  LeftOutlined,
  MenuUnfoldOutlined,
  MonitorOutlined,
  MoonOutlined,
  PlayCircleOutlined,
  RightOutlined,
  RocketOutlined,
  SettingOutlined,
  SunOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useDashboardStore } from '@/store/dashboardStore';
import { useMonitorStore } from '@/store/monitorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { NAV_ITEMS, ROUTE_META } from '@/constants/config';
import styles from './MainLayout.module.css';
import { getAuthSession, signOut } from '@/services/auth';

const { Header, Sider, Content } = Layout;

const iconMap: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  MonitorOutlined: <MonitorOutlined />,
  PlayCircleOutlined: <PlayCircleOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  SettingOutlined: <SettingOutlined />,
  RocketOutlined: <RocketOutlined />,
};

const menuItems = NAV_ITEMS.map((item) => ({
  key: item.key,
  icon: iconMap[item.icon],
  label: item.label,
}));

const fallbackRoute = {
  label: 'V2X 平台',
  description: '路云天瞳数字孪生感知平台',
};

const BrandLogo: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div className={styles.brand}>
    <img className={styles.brandMark} src="/brand-mark.svg" alt="" aria-hidden="true" />
    {!collapsed && <span className={styles.brandText}>路云天瞳</span>}
    <span className={styles.brandLine} aria-hidden="true" />
  </div>
);

const StatusArea: React.FC<{ connected: boolean; source: 'live' | 'mock' }> = ({ connected, source }) => (
  <div className={styles.statusArea}>
    <div className={styles.statusHeading}>
      <span
        className={`${styles.statusDot} ${connected ? styles.statusOnline : styles.statusOffline} ${connected ? 'data-pulse' : ''}`}
        aria-hidden="true"
      />
      <span>{connected ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
    </div>
    <div className={styles.statusMeta}>
      <span>API LATENCY</span>
      <strong className={styles.unavailableText}>未采集</strong>
    </div>
    <div className={styles.statusMeta}>
      <span>DATA SOURCE</span>
      <strong className={source === 'live' ? styles.liveText : styles.mockText}>
        {source.toUpperCase()}
      </strong>
    </div>
  </div>
);

const LiveClock: React.FC = () => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time className={styles.clock} dateTime={time.toISOString()}>
      {time.toLocaleTimeString('zh-CN', { hour12: false })}
    </time>
  );
};

export const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 900);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const connection = useMonitorStore((state) => state.connection);
  const source = useDashboardStore((state) => state.source);
  const session = getAuthSession();
  const routeMeta = ROUTE_META[location.pathname as keyof typeof ROUTE_META] || fallbackRoute;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const handleChange = (event: MediaQueryListEvent) => setCollapsed(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return (
    <Layout className={styles.layout}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={72}
        trigger={(
          <button
            type="button"
            className={styles.siderTriggerButton}
            aria-label={collapsed ? '展开侧边导航' : '收起侧边导航'}
          >
            {collapsed ? <RightOutlined aria-hidden="true" /> : <LeftOutlined aria-hidden="true" />}
          </button>
        )}
        className={`${styles.sider} ${collapsed ? styles.siderCollapsed : ''}`}
      >
        <div className={styles.siderInner}>
          <BrandLogo collapsed={collapsed} />
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => {
              navigate(key);
            }}
            className={styles.menu}
          />
          <StatusArea connected={connection.connected} source={source} />
        </div>
      </Sider>

      <Layout className={styles.mainLayout}>
        <Header className={styles.header}>
          <div className={styles.headerLeft}>
            <Button
              type="text"
              className={styles.mobileMenuButton}
              icon={<MenuUnfoldOutlined />}
              aria-label={collapsed ? '打开导航菜单' : '收起导航菜单'}
              onClick={() => setCollapsed((value) => !value)}
            />
            <div className={styles.headerTitles}>
              <Breadcrumbs />
              <div className={styles.headerPageLine}>
                <span className={styles.headerPageTitle}>{routeMeta.label}</span>
                <span className={styles.headerPageDescription}>{routeMeta.description}</span>
              </div>
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.sourceBadge} aria-label={`数据源：${source === 'live' ? '实时' : '演示'}`}>
              <span className={source === 'live' ? `${styles.sourceDot} ${styles.sourceLive}` : `${styles.sourceDot} ${styles.sourceMock}`} />
              <span className={source === 'live' ? styles.liveText : styles.mockText}>{source.toUpperCase()}</span>
            </div>
            <Badge
              status={connection.connected ? 'success' : 'error'}
              text={<span className={styles.connectionText}>{connection.connected ? 'WebSocket 已连接' : 'WebSocket 已断开'}</span>}
            />
            <LiveClock />
            <div className={styles.userChip} title={session?.username || '已登录'}>
              <span className={styles.userAvatar}><UserOutlined /></span>
              <span className={styles.userName}>{session?.username || 'operator'}</span>
            </div>
            <Tooltip title="退出登录">
              <button
                type="button"
                className={styles.themeButton}
                aria-label="退出登录"
                onClick={() => {
                  signOut();
                  navigate('/login', { replace: true });
                }}
              >
                <LogoutOutlined />
              </button>
            </Tooltip>
            <Tooltip title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}>
              <button
                type="button"
                className={styles.themeButton}
                aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              </button>
            </Tooltip>
          </div>
        </Header>

        <Content className={styles.content}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Content>
      </Layout>
    </Layout>
  );
};
