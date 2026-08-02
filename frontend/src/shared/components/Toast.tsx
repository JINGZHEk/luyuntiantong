import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { registerToast, ToastType } from './toastService';
import styles from './Toast.module.css';

interface ToastState {
  visible: boolean;
  message: string;
  type: 'info' | 'warning' | 'error';
}

export const Toast: React.FC = () => {
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  const show = useCallback((message: string, type: ToastType = 'info') => {
    setState({ visible: true, message, type });
  }, []);

  useEffect(() => {
    return registerToast(show);
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

  const alertType: 'info' | 'warning' | 'error' = state.type === 'error'
    ? 'error'
    : state.type === 'warning'
      ? 'warning'
      : 'info';
  const typeClass = state.type === 'error'
    ? styles.error
    : state.type === 'warning'
      ? styles.warning
      : styles.info;

  return (
    <div className={`${styles.toast} ${typeClass}`} role={state.type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <Alert
        type={alertType}
        showIcon
        icon={state.type === 'error' ? <ExclamationCircleOutlined /> : undefined}
        message={state.message}
        closable
        onClose={() => setState((s) => ({ ...s, visible: false }))}
        className={styles.alert}
      />
    </div>
  );
};

export default Toast;
