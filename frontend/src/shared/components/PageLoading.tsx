import React from 'react';
import { Spin } from 'antd';

export const PageLoading: React.FC<{ tip?: string }> = ({ tip = '加载中...' }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: 300,
    }}
  >
    <Spin size="large" tip={tip}>
      <div style={{ padding: 50 }} />
    </Spin>
  </div>
);
