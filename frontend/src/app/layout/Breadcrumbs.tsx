import React from 'react';
import { Breadcrumb } from 'antd';
import { useLocation, Link } from 'react-router-dom';
import { HomeOutlined } from '@ant-design/icons';
import { ROUTE_META } from '@/constants/config';
import styles from './Breadcrumbs.module.css';

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathLabel = ROUTE_META[location.pathname as keyof typeof ROUTE_META]?.label || '未知页面';

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

  return <Breadcrumb className={styles.breadcrumbs} items={items} />;
};
