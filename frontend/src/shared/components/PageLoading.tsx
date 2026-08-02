import React from 'react';
import { Spin } from 'antd';
import styles from './PageLoading.module.css';

export const PageLoading: React.FC<{ tip?: string }> = ({ tip = '加载中...' }) => (
  <div className={styles.page}>
    <Spin size="large" tip={tip}>
      <div className={styles.spinnerContent} />
    </Spin>
  </div>
);
