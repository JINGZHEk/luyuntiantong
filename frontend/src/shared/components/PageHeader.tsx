import React from 'react';
import { Space } from 'antd';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, extra }) => {
  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid rgba(0, 212, 255, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <span style={{ fontSize: 20, color: '#00d4ff' }}>{icon}</span>
        )}
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#e0e6f0',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <span
              style={{
                fontSize: 12,
                color: '#8892a4',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {extra && <Space>{extra}</Space>}
    </div>
  );
};

export default PageHeader;
