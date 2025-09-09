/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { ReactNode } from 'react';
import styles from './modals/Modals.module.css';

type ModalProps = {
  children?: ReactNode
  onClose: () => void
}
export default function Modal({ children, onClose }: ModalProps) {
  return (
    <div className={styles.modalShroud}>
      <div className={styles.modal}>
        <button onClick={onClose} className={styles.modalClose}>
          <span className="icon">close</span>
        </button>
        <div className={styles.modalContent}>{children}</div>
      </div>
    </div>
  )
}