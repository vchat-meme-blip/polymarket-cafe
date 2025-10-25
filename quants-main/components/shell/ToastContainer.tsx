/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect } from 'react';
import { useUI, Toast as ToastType } from '../../lib/state';
import styles from './Shell.module.css';

const TOAST_ICONS: Record<ToastType['type'], string> = {
    intel: '🚀',
    system: 'settings_system_daydream',
    error: 'error'
};

export default function ToastContainer() {
  const { toastQueue, removeToast, openIntelDossier } = useUI();

  return (
    <div className={styles.toastContainer}>
      {toastQueue.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
          onView={toast.intel ? () => {
            openIntelDossier(toast.intel!);
            removeToast(toast.id);
          } : undefined}
        />
      ))}
    </div>
  );
}

const Toast = ({
  toast,
  onClose,
  onView,
}: {
  toast: ToastType;
  onClose: () => void;
  onView?: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-dismiss after 5 seconds

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`${styles.toast} ${styles[toast.type]}`}>
      <span className={`icon ${styles.toastIcon}`}>{TOAST_ICONS[toast.type]}</span>
      <div className={styles.toastContent}>
        <p>{toast.message}</p>
        {toast.tokenName && (
          <p>
            <strong className={styles.tokenName}>${toast.tokenName}</strong>
          </p>
        )}
      </div>
      <div className={styles.toastActions}>
        {onView && (
            <button className="button primary" onClick={onView}>
                View
            </button>
        )}
        <button className="button secondary" onClick={onClose}>
          <span className="icon">close</span>
        </button>
      </div>
    </div>
  );
};