/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import Modal from '../Modal';
import { useUI } from '../../lib/state/index.js';
import styles from '../modals/Modals.module.css';
import { BettingIntel } from '../../lib/types/index.js';

export default function IntelDossierModal() {
    const { showIntelDossierModal, closeIntelDossier, setChatPrompt, setView } = useUI();

    if (!showIntelDossierModal) {
        return null;
    }

    const intel: BettingIntel = showIntelDossierModal;

    const handleDiscuss = () => {
        setChatPrompt(`Let's talk about the intel on "${intel.market}". What's your take on it?`);
        closeIntelDossier();
        setView('dashboard');
    };

    return (
        <Modal onClose={closeIntelDossier}>
            <div className={`${styles.modalContentPane} ${styles.intelDossierModal}`}>
                <div className={styles.dossierHeader}>
                    <div className={styles.dossierTitleGroup}>
                        <h2>Intel Dossier: {intel.market}</h2>
                        <p>Asset ID: {intel.id}</p>
                    </div>
                </div>
                <div className={styles.dossierGrid}>
                    <div>
                        <div className={styles.dossierCard}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">psychology_alt</span>Alpha Content</h4>
                            <p>{intel.content}</p>
                        </div>
                        {intel.sourceUrls && intel.sourceUrls.length > 0 && (
                            <div className={styles.dossierCard} style={{ marginTop: '24px' }}>
                                <h4 className={styles.dossierCardTitle}><span className="icon">link</span>Research Sources</h4>
                                <div className={styles.sourcesList}>
                                    {intel.sourceUrls.map((url, index) => (
                                        <a href={url} key={index} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                                            <span className="icon">open_in_new</span>
                                            {url}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div>
                        <div className={styles.dossierCard}>
                            <h4 className={styles.dossierCardTitle}><span className="icon">info</span>Metadata</h4>
                            <div className={styles.securityMetrics}>
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Source</span>
                                    <span className={styles.metricItemValue}>{intel.sourceDescription}</span>
                                </div>
                                {intel.pricePaid && (
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Acquisition Cost</span>
                                    <span className={styles.metricItemValue}>{intel.pricePaid} BOX</span>
                                </div>
                                )}
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>PNL Generated</span>
                                    <span className={styles.metricItemValue}>${intel.pnlGenerated.amount.toFixed(2)}</span>
                                </div>
                                <div className={styles.metricItem}>
                                    <span className={styles.metricItemLabel}>Acquired</span>
                                    <span className={styles.metricItemValue}>{new Date(intel.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        <button className="button primary" onClick={handleDiscuss} style={{ width: '100%', justifyContent: 'center', marginTop: '24px' }}>
                            <span className="icon">chat</span> Discuss with Agent
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}