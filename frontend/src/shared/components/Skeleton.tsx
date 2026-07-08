import React from 'react';

interface SkeletonProps {
  type?: 'card' | 'table' | 'chart';
  height?: number | string;
  rows?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  type = 'card',
  height = 200,
  rows = 3,
}) => {
  if (type === 'card') {
    return (
      <div className="glass-card" style={{ padding: 16, height }}>
        <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 28, width: '60%', marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 20, width: '100%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 20, width: '80%' }} />
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="glass-card" style={{ padding: 16 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 32, width: '100%', marginBottom: 8, borderRadius: 4 }}
          />
        ))}
      </div>
    );
  }

  // chart
  return (
    <div className="glass-card" style={{ padding: 16, height }}>
      <div className="skeleton" style={{ height: '100%', width: '100%', borderRadius: 4 }} />
    </div>
  );
};

export default Skeleton;
