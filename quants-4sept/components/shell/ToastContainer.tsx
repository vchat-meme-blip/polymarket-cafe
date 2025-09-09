/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect } from 'react';
import { useUI } from '../../lib/state';
import styles from './Shell.module.css';

export default function ToastContainer() {
  const { toastQueue, removeToast, openIntelDossier } = useUI();

  return (
    <div className={styles.toastContainer}>
      {toastQueue.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
          onView={() => {
            openIntelDossier(toast.intel);
            removeToast(toast.id);
          }}
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
  toast: any;
  onClose: () => void;
  onView: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-dismiss after 5 seconds

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={styles.toast}>
      <span className={`icon ${styles.toastIcon}`}>🚀</span>
      <div className={styles.toastContent}>
        <p>{toast.message}</p>
        <p>
          <strong className={styles.tokenName}>${toast.tokenName}</strong>
        </p>
      </div>
      <div className={styles.toastActions}>
        <button className="button primary" onClick={onView}>
          View
        </button>
        <button className="button secondary" onClick={onClose}>
          <span className="icon">close</span>
        </button>
      </div>
    </div>
  );
};