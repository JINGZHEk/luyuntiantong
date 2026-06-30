import React from 'react';
import { Breadcrumb } from 'antd';
import { useLocation, Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';

const routeLabels: Record<string, string> = {
  '/': '总览大屏',
  '/monitor': '实时监控',
  '/replay': '事件回放',
  '/evaluation': '模型评估',
  '/settings': '系统设置',
};

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathLabel = routeLabels[location.pathname] || '未知页面';

  const items = [
    {
      title: (
        <Link to="/">
          <HomeOutlined />
        </Link>
      ),
    },
  ];

  if (location.pathname !== '/') {
    items.push({ title: <span>{pathLabel}</span> });
  }

  return <Breadcrumb items={items} style={{ marginBottom: 12 }} />;
};
