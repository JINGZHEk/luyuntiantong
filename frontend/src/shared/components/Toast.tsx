import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

interface ToastState {
  visible: boolean;
  message: string;
  type: 'info' | 'warning' | 'error';
}

let externalShow: ((message: string, type?: 'info' | 'warning' | 'error') => void) | null = null;

export const showToast = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
  if (externalShow) externalShow(message, type);
};

export const Toast: React.FC = () => {
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  const show = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    setState({ visible: true, message, type });
  }, []);

  useEffect(() => {
    externalShow = show;
    return () => { externalShow = null; };
  }, [show]);

  useEffect(() => {
    if (state.visible) {
      const timer = setTimeout(() => {
        setState((s) => ({ ...s, visible: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.visible]);

  if (!state.visible) return null;

  const alertType = state.type === 'error' ? 'error' : state.type === 'warning' ? 'warning' : 'info';

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1070,
        animation: 'fadeIn 0.3s ease-out',
        minWidth: 300,
        maxWidth: 450,
      }}
    >
      <Alert
        type={alertType as any}
        showIcon
        icon={state.type === 'error' ? <ExclamationCircleOutlined /> : undefined}
        message={state.message}
        closable
        onClose={() => setState((s) => ({ ...s, visible: false }))}
        style={{
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          border: `1px solid ${
            state.type === 'error' ? 'rgba(255, 77, 79, 0.4)' :
            state.type === 'warning' ? 'rgba(250, 173, 20, 0.4)' :
            'rgba(0, 212, 255, 0.3)'
          }`,
        }}
      />
    </div>
  );
};

export default Toast;
