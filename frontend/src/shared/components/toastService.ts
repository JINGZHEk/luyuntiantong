export type ToastType = 'info' | 'warning' | 'error';

type ToastPresenter = (message: string, type?: ToastType) => void;

let externalShow: ToastPresenter | null = null;

export const registerToast = (presenter: ToastPresenter): (() => void) => {
  externalShow = presenter;
  return () => {
    if (externalShow === presenter) externalShow = null;
  };
};

export const showToast = (message: string, type: ToastType = 'info') => {
  externalShow?.(message, type);
};
