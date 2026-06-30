import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from './layout/MainLayout';
import { PageLoading } from '@/shared/components/PageLoading';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const MonitorPage = lazy(() => import('@/pages/monitor/MonitorPage'));
const ReplayPage = lazy(() => import('@/pages/replay/ReplayPage'));
const EvaluationPage = lazy(() => import('@/pages/evaluation/EvaluationPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/not-found/NotFoundPage'));

function withSuspense(Component: React.LazyExoticComponent<React.FC>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
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
