import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { router } from './router';
import { getAntdTheme } from './styles/theme';
import { useSettingsStore } from '@/store/settingsStore';
import { useMockRealtime } from '@/shared/hooks/useMockRealtime';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useMockRealtime();
  return <>{children}</>;
};

export const App: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const antdTheme = getAntdTheme(theme);

  return (
    <ErrorBoundary>
      <ConfigProvider theme={antdTheme} locale={zhCN}>
        <div className={theme === 'light' ? 'light-theme' : ''}>
          <RealtimeProvider>
            <RouterProvider router={router} />
          </RealtimeProvider>
        </div>
      </ConfigProvider>
    </ErrorBoundary>
  );
};
