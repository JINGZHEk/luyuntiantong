import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from './layout/MainLayout';
import { PageLoading } from '@/shared/components/PageLoading';
import LoginPage from '@/pages/login/LoginPage';
import { getAuthSession } from '@/services/auth';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const MonitorPage = lazy(() => import('@/pages/monitor/MonitorPage'));
const ReplayPage = lazy(() => import('@/pages/replay/ReplayPage'));
const EvaluationPage = lazy(() => import('@/pages/evaluation/EvaluationPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/not-found/NotFoundPage'));
const PresentationPage = lazy(() => import('@/pages/presentation/PresentationPage'));
const ZhiluWujiePage = lazy(() => import('@/pages/zhiluwujie/ZhiluWujiePage'));
const ZhiluWujiePreviewPage = lazy(() => import('@/pages/zhiluwujie-preview/ZhiluWujiePreviewPage'));

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!getAuthSession()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function withSuspense(Component: React.LazyExoticComponent<React.FC>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/presentation',
    element: withSuspense(PresentationPage),
  },
  {
    path: '/zhiluwujie',
    element: withSuspense(ZhiluWujiePage),
  },
  {
    path: '/zhiluwujie-preview',
    element: withSuspense(ZhiluWujiePreviewPage),
  },
  {
    path: '/',
    element: <RequireAuth><MainLayout /></RequireAuth>,
    children: [
      { index: true, element: withSuspense(DashboardPage) },
      { path: 'monitor', element: withSuspense(MonitorPage) },
      { path: 'replay', element: withSuspense(ReplayPage) },
      { path: 'evaluation', element: withSuspense(EvaluationPage) },
      { path: 'settings', element: withSuspense(SettingsPage) },
      { path: '404', element: withSuspense(NotFoundPage) },
      { path: '*', element: <Navigate to="/404" replace /> },
    ],
  },
]);
